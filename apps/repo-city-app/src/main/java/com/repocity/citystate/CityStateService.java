package com.repocity.citystate;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.repocity.citystate.event.CityMutation;
import com.repocity.citystate.event.CityMutation.AnimationHint;
import com.repocity.citystate.event.CityMutationEvent;
import com.repocity.citystate.event.PollCycleCompleted;
import com.repocity.citystate.model.CityState;
import com.repocity.citystate.model.DistrictState;
import com.repocity.citystate.model.PipelineStatus;
import com.repocity.citystate.model.WorkerState;
import com.repocity.citystate.repository.CitySnapshot;
import com.repocity.citystate.repository.CitySnapshotRepository;
import com.repocity.identity.domain.Gender;
import com.repocity.identity.domain.GitLabRepository;
import com.repocity.identity.domain.GitlabUser;
import com.repocity.identity.domain.UserRole;
import com.repocity.identity.repository.GitlabUserRepository;
import com.repocity.identity.repository.RepoRepository;
import com.repocity.poller.domain.PollEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Core of the {@code city-state} module.
 *
 * <h3>Responsibilities</h3>
 * <ol>
 *   <li>Bootstraps {@link CityState} on startup from the identity module data
 *       (seeded repositories and developers) and, if available, from the most
 *       recent persisted {@link CitySnapshot}.</li>
 *   <li>Listens for {@link PollCycleCompleted} events published by
 *       {@link com.repocity.poller.service.EventDispatcher}.</li>
 *   <li>For each new {@link PollEvent}, resolves the author and repository via
 *       the identity module, applies the appropriate city mutation rule, and
 *       updates the in-memory {@link CityState}.</li>
 *   <li>Publishes a {@link CityMutationEvent} so the {@code realtime} module
 *       can broadcast the mutations to connected browsers.</li>
 *   <li>Persists a {@link CitySnapshot} to the database every 5 minutes so that
 *       the city survives a server restart.</li>
 * </ol>
 *
 * <h3>Thread Safety</h3>
 * <p>All mutations are guarded by {@code synchronized(cityState)} to prevent
 * concurrent poll cycles from corrupting in-memory counters.
 */
@Service
public class CityStateService {

    private static final Logger log = LoggerFactory.getLogger(CityStateService.class);

    private final RepoRepository       repoRepo;
    private final GitlabUserRepository userRepo;
    private final CitySnapshotRepository snapshotRepo;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;

    /** The single in-memory city state instance. Mutated under its own monitor. */
    private final CityState cityState = new CityState();

    public CityStateService(RepoRepository repoRepo,
                            GitlabUserRepository userRepo,
                            CitySnapshotRepository snapshotRepo,
                            ApplicationEventPublisher eventPublisher,
                            ObjectMapper objectMapper) {
        this.repoRepo      = repoRepo;
        this.userRepo      = userRepo;
        this.snapshotRepo  = snapshotRepo;
        this.eventPublisher= eventPublisher;
        this.objectMapper  = objectMapper;
    }

    // ── Bootstrap ──────────────────────────────────────────────────────────────

    /**
     * Initialises districts and workers from identity data on startup.
     * Listening to {@link ApplicationReadyEvent} guarantees that the datasource
     * initialization (data.sql) has already run before we query the identity tables.
     */
    @EventListener(ApplicationReadyEvent.class)
    void bootstrap() {
        if (!tryRestoreFromSnapshot()) {
            seedFromDb();
        }

        // Always overwrite per-district open MR counts from the DB after bootstrap,
        // regardless of whether we restored from a snapshot or seeded fresh.
        // openMrCount is @JsonIgnore in DistrictState so snapshots never carry stale
        // values — this call is the single authoritative source for open MR counts.
        synchronized (cityState) {
            refreshOpenMrCountsFromDb();
        }

        log.info("City state bootstrapped: {} districts, {} workers, {} total commits, {} total merges, {} active developers, {} open MR",
                 cityState.getDistricts().size(), cityState.getWorkers().size(), cityState.getTotalCommits(), cityState.getTotalMrsMerged(), cityState.getActiveDeveloperCount(), cityState.getDistricts().values().stream().mapToInt(DistrictState::getOpenMrCount).sum());
    }

    /**
     * Attempts to restore the city state from the most recent persisted snapshot.
     *
     * @return {@code true} if a snapshot was found and successfully deserialized;
     *         {@code false} if no snapshot exists or deserialization failed (caller
     *         should fall back to {@link #seedFromDb()}).
     */
    private boolean tryRestoreFromSnapshot() {
        Optional<CitySnapshot> latest = snapshotRepo.findTopByOrderByCreatedAtDesc();
        if (latest.isEmpty()) return false;

        try {
            CityState persisted = objectMapper.readValue(latest.get().getPayload(), CityState.class);
            synchronized (cityState) {
                cityState.getDistricts().clear();
                persisted.getDistricts().values().forEach(cityState::putDistrict);

                cityState.getWorkers().clear();
                persisted.getWorkers().values().forEach(cityState::putWorker);

                cityState.restoreAggregates(
                        persisted.getTotalCommits(),
                        persisted.getTotalMrsMerged(),
                        persisted.getLastUpdatedAt());
            }
            log.info("City state restored from snapshot: {} districts, {} workers, {} total commits, {} total merges",
                    cityState.getDistricts().size(), cityState.getWorkers().size(),
                    cityState.getTotalCommits(), cityState.getTotalMrsMerged());
            return true;
        } catch (Exception e) {
            log.warn("Failed to restore city snapshot: {} — falling back to seeded identity data", e.getMessage());
            return false;
        }
    }

    /**
     * Seeds the city state from the identity module (repositories + developers).
     * Called when no usable snapshot is available.
     */
    private void seedFromDb() {
        for (GitLabRepository repo : repoRepo.findAll()) {
            cityState.putDistrict(new DistrictState(
                    repo.getSlug(),
                    repo.getName(),
                    repo.getIcon(),
                    repo.getStatus(),
                    repo.getOpenMrs()));
        }
        for (GitlabUser user : userRepo.findAll()) {
            cityState.putWorker(new WorkerState(
                    user.getDisplayName(),
                    user.getRole(),
                    user.getGender()));
        }
    }

    // ── Event listener ─────────────────────────────────────────────────────────

    /**
     * Processes each new poll event and mutates the city state accordingly.
     * Runs on the same thread that published the event (Spring default behaviour).
     */
    @EventListener
    public void onPollCycleCompleted(PollCycleCompleted cycle) {
        List<PollEvent> events = cycle.getNewEvents();
        if (events.isEmpty()) return;

        log.debug("Processing {} new poll event(s) from cycle at {}", events.size(), cycle.getCompletedAt());

        List<CityMutation> mutations = new ArrayList<>();

        synchronized (cityState) {
            for (PollEvent event : events) {
                CityMutation mutation = applyEvent(event);
                if (mutation != null) {
                    mutations.add(mutation);
                }
            }

            // Re-sync openMrCount for every district from the DB after mutations.
            // The incremental MR_OPENED / MR_MERGED deltas can drift because historical
            // events are replayed on each poll; the DB column is always authoritative.
            refreshOpenMrCountsFromDb();
        }

        if (!mutations.isEmpty()) {
            log.info("City state updated: {} mutation(s) produced", mutations.size());
            eventPublisher.publishEvent(new CityMutationEvent(mutations));
        }
    }

    // ── Mutation rules ─────────────────────────────────────────────────────────

    /**
     * Applies the mutation rule for a single event.
     * Must be called while holding the lock on {@code cityState}.
     *
     * @return the resulting {@link CityMutation}, or {@code null} if the event
     *         could not be applied (e.g. unknown repo or unknown author).
     */
    private CityMutation applyEvent(PollEvent event) {
        DistrictState district = cityState.getDistricts().get(event.getRepoSlug());
        if (district == null) {
            log.debug("No district for repo '{}' — skipping event {}", event.getRepoSlug(), event.getId());
            return null;
        }

        // Resolve author — may be null if the author field wasn't in the payload
        Optional<GitlabUser> authorOpt = resolveAuthor(event.getAuthorUsername());
        String  actorDisplayName    = authorOpt.map(GitlabUser::getDisplayName).orElse(event.getAuthorUsername());
        String  actorGitlabUsername = authorOpt.map(GitlabUser::getGitlabUsername).orElse(event.getAuthorUsername());
        UserRole actorRole          = authorOpt.map(GitlabUser::getRole).orElse(UserRole.ENGINEER);
        Gender   actorGender        = authorOpt.map(GitlabUser::getGender).orElse(Gender.MALE);

        // Move worker to this district
        if (actorDisplayName != null) {
            WorkerState worker = cityState.getWorkers().get(actorDisplayName);
            if (worker != null) worker.moveTo(event.getRepoSlug());
        }

        var b = CityMutation.builder()
                .repoSlug(event.getRepoSlug())
                .repoIcon(district.getRepoIcon())
                .actorDisplayName(actorDisplayName)
                .actorGitlabUsername(actorGitlabUsername)
                .actorRole(actorRole)
                .actorGender(actorGender)
                .eventType(event.getEventType());

        switch (event.getEventType()) {
            case COMMIT -> {
                district.commitArrived(actorDisplayName != null ? actorDisplayName : "unknown");
                cityState.recordCommit();
                cityState.pushRecentEvent(actorDisplayName + " committed to " + event.getRepoSlug());
                b.animationHint(AnimationHint.COMMIT_BEAM)
                 .newBuildingFloors(district.getBuildingFloors())
                 .newOpenMrCount(district.getOpenMrCount());
            }
            case MR_OPENED -> {
                district.mrOpened(actorDisplayName != null ? actorDisplayName : "unknown");
                cityState.pushRecentEvent(actorDisplayName + " opened an MR in " + event.getRepoSlug());
                b.animationHint(AnimationHint.MR_OPENED_BEAM)
                 .newBuildingFloors(district.getBuildingFloors())
                 .newOpenMrCount(district.getOpenMrCount());
            }
            case MR_MERGED -> {
                district.mrMerged(actorDisplayName != null ? actorDisplayName : "unknown");
                cityState.recordMerge();
                cityState.pushRecentEvent(actorDisplayName + " merged an MR in " + event.getRepoSlug());
                b.animationHint(AnimationHint.MERGE_SUCCESS)
                 .newBuildingFloors(district.getBuildingFloors())
                 .newOpenMrCount(district.getOpenMrCount());
            }
            case PIPELINE -> {
                PipelineStatus status = resolvePipelineStatus(event.getPayload());
                district.pipelineUpdated(status);
                AnimationHint hint = switch (status) {
                    case RUNNING -> AnimationHint.PIPELINE_RUNNING;
                    case SUCCESS -> AnimationHint.PIPELINE_SUCCESS;
                    case FAILED  -> AnimationHint.PIPELINE_FAILED;
                    default      -> AnimationHint.PIPELINE_RUNNING;
                };
                cityState.pushRecentEvent("Pipeline " + status.name().toLowerCase() + " in " + event.getRepoSlug());
                b.animationHint(hint)
                 .pipelineStatus(status.name().toLowerCase())
                 .newBuildingFloors(district.getBuildingFloors())
                 .newOpenMrCount(district.getOpenMrCount());
            }
        }

        return b.build();
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /**
     * Resolves a GitLab username or display name to a {@link GitlabUser}.
     * Tries {@code gitlabUsername} first, then falls back to a case-insensitive
     * display-name match (useful for commit author_name fields that are full names).
     */
    private Optional<GitlabUser> resolveAuthor(String authorUsername) {
        if (authorUsername == null || authorUsername.isBlank()) return Optional.empty();
        Optional<GitlabUser> byUsername = userRepo.findByGitlabUsername(authorUsername);
        if (byUsername.isPresent()) return byUsername;
        return userRepo.findByDisplayNameIgnoreCase(authorUsername);
    }

    /**
     * Inspects the raw JSON payload to determine the pipeline status.
     * GitLab pipeline status values: {@code "running"}, {@code "success"}, {@code "failed"},
     * {@code "pending"}, {@code "canceled"}, {@code "skipped"}.
     */
    private PipelineStatus resolvePipelineStatus(String payload) {
        if (payload == null) return PipelineStatus.IDLE;
        String lower = payload.toLowerCase();
        if (lower.contains("\"status\":\"running\""))  return PipelineStatus.RUNNING;
        if (lower.contains("\"status\":\"success\""))  return PipelineStatus.SUCCESS;
        if (lower.contains("\"status\":\"failed\""))   return PipelineStatus.FAILED;
        return PipelineStatus.IDLE;
    }

    // ── Snapshot persistence ───────────────────────────────────────────────────

    /**
     * Re-reads {@code open_mrs} from {@link GitLabRepository} rows and pushes the
     * values into the matching in-memory {@link DistrictState} entries.
     *
     * <p>Must be called while holding the lock on {@code cityState}. Incremental
     * MR_OPENED / MR_MERGED event deltas can drift (especially when historical
     * events are replayed), so the DB column is treated as the single source of
     * truth for the open-MR count.
     */
    private void refreshOpenMrCountsFromDb() {
        List<GitLabRepository> repos = repoRepo.findAll();
        for (GitLabRepository repo : repos) {
            DistrictState district = cityState.getDistricts().get(repo.getSlug());
            if (district != null) {
                district.setOpenMrCount(repo.getOpenMrs());
            }
        }
        log.debug("Open MR counts refreshed from DB: {} total open MRs",
                cityState.getDistricts().values().stream().mapToInt(DistrictState::getOpenMrCount).sum());
    }

    /**
     * Writes a JSON snapshot of the current city state to the database every 5 minutes.
     * The snapshot is used by the {@code realtime} module to send a full-state message
     * to newly connected browsers, and by {@link #bootstrap()} on restart.
     */
    @Scheduled(fixedDelayString = "${repocity.citystate.snapshot-interval-ms:300000}")
    public void persistSnapshot() {
        synchronized (cityState) {
            try {
                String json = objectMapper.writeValueAsString(cityState);
                CitySnapshot snap = new CitySnapshot(
                        json,
                        cityState.getDistricts().size(),
                        cityState.getWorkers().size());
                snapshotRepo.save(snap);
                log.debug("City snapshot persisted: {} districts, {} workers",
                          snap.getDistrictCount(), snap.getWorkerCount());
            } catch (JsonProcessingException e) {
                log.error("Failed to serialize city state snapshot: {}", e.getMessage());
            }
        }
    }

    // ── Read API (used by api module) ──────────────────────────────────────────

    /** Returns the current in-memory city state. Callers must treat it as read-only. */
    public CityState getCityState() {
        return cityState;
    }
}
