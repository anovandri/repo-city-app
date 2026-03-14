package com.repocity.citystate;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.repocity.citystate.event.CityMutation;
import com.repocity.citystate.event.CityMutation.AnimationHint;
import com.repocity.citystate.event.CityMutationEvent;
import com.repocity.citystate.event.ImmediatePollRequested;
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
import com.repocity.poller.repository.PollEventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
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
    private final PollEventRepository pollEventRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;

    /** Phase 2: Bootstrap staleness threshold in minutes. */
    @Value("${repocity.citystate.bootstrap.staleness-threshold-minutes:5}")
    private int stalenessThresholdMinutes;

    /** The single in-memory city state instance. Mutated under its own monitor. */
    private final CityState cityState = new CityState();

    public CityStateService(RepoRepository repoRepo,
                            GitlabUserRepository userRepo,
                            CitySnapshotRepository snapshotRepo,
                            PollEventRepository pollEventRepository,
                            ApplicationEventPublisher eventPublisher,
                            ObjectMapper objectMapper) {
        this.repoRepo      = repoRepo;
        this.userRepo      = userRepo;
        this.snapshotRepo  = snapshotRepo;
        this.pollEventRepository = pollEventRepository;
        this.eventPublisher= eventPublisher;
        this.objectMapper  = objectMapper;
    }

    // ── Bootstrap ──────────────────────────────────────────────────────────────

    /**
     * Phase 5: Refactored bootstrap logic with event-based communication.
     *
     * <h3>Bootstrap Strategy</h3>
     * <ol>
     *   <li>Always load master data (repos & users metadata)</li>
     *   <li>Check for existing snapshot</li>
     *   <li>If no snapshot exists, trigger immediate poll</li>
     *   <li>If snapshot exists:
     *     <ul>
     *       <li>Restore state from snapshot</li>
     *       <li>Check staleness against configured threshold</li>
     *       <li>If stale (&gt; threshold), trigger immediate poll to refresh</li>
     *     </ul>
     *   </li>
     * </ol>
     *
     * <p>Listening to {@link ApplicationReadyEvent} guarantees that the datasource
     * initialization (data.sql) has already run before we query the identity tables.
     */
    @EventListener(ApplicationReadyEvent.class)
    void bootstrap() {
        log.info("Starting city state bootstrap...");

        // Step 1: Always load master data (repos & users metadata)
        loadMasterData();

        // Step 2: Check for snapshot
        Optional<CitySnapshot> latestSnapshot = snapshotRepo.findTopByOrderByCreatedAtDesc();

        if (latestSnapshot.isEmpty()) {
            // No snapshot - first run scenario
            log.info("No snapshot found, triggering initial poll");
            eventPublisher.publishEvent(new ImmediatePollRequested("No snapshot found"));

        } else {
            CitySnapshot snapshot = latestSnapshot.get();
            Duration staleness = snapshot.getStaleness();

            log.info("Found snapshot from {} (age: {} minutes)",
                    snapshot.getCreatedAt(),
                    staleness.toMinutes());

            // Step 3: Restore from snapshot
            restoreFromSnapshot(snapshot);

            // Step 4: Check staleness and refresh if needed
            if (staleness.toMinutes() > stalenessThresholdMinutes) {
                log.warn("Snapshot is stale (>{} min), triggering immediate poll",
                        stalenessThresholdMinutes);
                eventPublisher.publishEvent(new ImmediatePollRequested(
                        String.format("Snapshot stale (%d minutes old)", staleness.toMinutes())));
            } else {
                log.info("Snapshot is recent (<{} min), using as-is",
                        stalenessThresholdMinutes);
            }
        }

        log.info("Bootstrap complete: {} districts, {} workers, {} total commits, {} open MRs",
                cityState.getDistricts().size(),
                cityState.getWorkers().size(),
                cityState.getTotalCommits(),
                cityState.getDistricts().values().stream()
                        .mapToInt(DistrictState::getOpenMrCount).sum());
    }

    /**
     * Phase 2: Loads master data (repos & users metadata) from identity module.
     * Called at the start of bootstrap before snapshot restore or poll.
     */
    private void loadMasterData() {
        // Load districts (repos metadata only, no state)
        for (GitLabRepository repo : repoRepo.findAll()) {
            cityState.putDistrict(new DistrictState(
                    repo.getSlug(),
                    repo.getName(),
                    repo.getIcon(),
                    repo.getStatus(),
                    0));  // Initial count = 0, will be set by poll/snapshot
        }

        // Load workers (users metadata)
        for (GitlabUser user : userRepo.findAll()) {
            cityState.putWorker(new WorkerState(
                    user.getDisplayName(),
                    user.getRole(),
                    user.getGender()));
        }

        log.debug("Master data loaded: {} repos, {} users",
                cityState.getDistricts().size(),
                cityState.getWorkers().size());
    }

    /**
     * Phase 2: Restores the city state from a persisted snapshot.
     * Merges snapshot state into existing master data loaded by {@link #loadMasterData()}.
     */
    private void restoreFromSnapshot(CitySnapshot snapshot) {
        try {
            CityState persisted = objectMapper.readValue(snapshot.getPayload(), CityState.class);
            synchronized (cityState) {
                // Restore district state (merge into existing districts loaded from master data)
                persisted.getDistricts().forEach((slug, district) -> {
                    DistrictState existing = cityState.getDistricts().get(slug);
                    if (existing != null) {
                        // Only restore openMrCount - other fields will be rebuilt from poll_events
                        existing.setOpenMrCount(district.getOpenMrCount());
                    }
                });

                // Restore aggregates
                cityState.restoreAggregates(
                        persisted.getTotalCommits(),
                        persisted.getTotalMrsMerged(),
                        persisted.getLastUpdatedAt());
            }
            log.info("City state restored from snapshot: {} districts, {} workers, {} total commits, {} total merges",
                    cityState.getDistricts().size(), cityState.getWorkers().size(),
                    cityState.getTotalCommits(), cityState.getTotalMrsMerged());
        } catch (Exception e) {
            log.error("Failed to restore city snapshot: {}", e.getMessage(), e);
            throw new RuntimeException("Snapshot restore failed", e);
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
        String  actorDisplayName    = authorOpt.map(GitlabUser::getDisplayName)
                                               .orElse(event.getAuthorUsername() != null && !event.getAuthorUsername().isBlank() 
                                                       ? event.getAuthorUsername() 
                                                       : "Pipeline");
        String  actorGitlabUsername = authorOpt.map(GitlabUser::getGitlabUsername)
                                               .orElse(event.getAuthorUsername() != null && !event.getAuthorUsername().isBlank() 
                                                       ? event.getAuthorUsername() 
                                                       : null);
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
                // Track developer activity
                if (actorDisplayName != null) {
                    WorkerState worker = cityState.getWorkers().get(actorDisplayName);
                    if (worker != null) {
                        worker.getActivity().incrementCommits(event.getRepoSlug());
                    }
                }
                b.animationHint(AnimationHint.COMMIT_BEAM)
                 .newBuildingFloors(district.getBuildingFloors())
                 .newOpenMrCount(district.getOpenMrCount());
            }
            case MR_OPENED -> {
                district.mrOpened(actorDisplayName != null ? actorDisplayName : "unknown");
                cityState.pushRecentEvent(actorDisplayName + " opened an MR in " + event.getRepoSlug());
                // Track developer activity
                if (actorDisplayName != null) {
                    WorkerState worker = cityState.getWorkers().get(actorDisplayName);
                    if (worker != null) {
                        worker.getActivity().incrementMrsOpened(event.getRepoSlug());
                    }
                }
                b.animationHint(AnimationHint.MR_OPENED_BEAM)
                 .newBuildingFloors(district.getBuildingFloors())
                 .newOpenMrCount(district.getOpenMrCount());
            }
            case MR_MERGED -> {
                district.mrMerged(actorDisplayName != null ? actorDisplayName : "unknown");
                cityState.recordMerge();
                cityState.pushRecentEvent(actorDisplayName + " merged an MR in " + event.getRepoSlug());
                // Track developer activity
                if (actorDisplayName != null) {
                    WorkerState worker = cityState.getWorkers().get(actorDisplayName);
                    if (worker != null) {
                        worker.getActivity().incrementMrsMerged(event.getRepoSlug());
                    }
                }
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
                // Track developer activity for completed pipelines
                if ((status == PipelineStatus.SUCCESS || status == PipelineStatus.FAILED) && actorDisplayName != null) {
                    WorkerState worker = cityState.getWorkers().get(actorDisplayName);
                    if (worker != null) {
                        worker.getActivity().incrementPipelines(event.getRepoSlug());
                    }
                }
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
     * Re-computes {@code openMrCount} from {@code poll_events} table and pushes the
     * values into the matching in-memory {@link DistrictState} entries.
     *
     * <p>Must be called while holding the lock on {@code cityState}. Incremental
     * MR_OPENED / MR_MERGED event deltas can drift (especially when historical
     * events are replayed), so we recompute from the event log as the source of truth.
     */
    private void refreshOpenMrCountsFromDb() {
        List<GitLabRepository> repos = repoRepo.findAll();
        for (GitLabRepository repo : repos) {
            DistrictState district = cityState.getDistricts().get(repo.getSlug());
            if (district != null) {
                // Compute from poll_events table
                int freshCount = (int) pollEventRepository.countOpenMrs(repo.getSlug());
                district.setOpenMrCount(freshCount);
            }
        }
        log.debug("Open MR counts refreshed from poll_events: {} total open MRs",
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
