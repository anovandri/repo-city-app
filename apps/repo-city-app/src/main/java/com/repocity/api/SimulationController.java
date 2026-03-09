package com.repocity.api;

import com.repocity.citystate.CityStateService;
import com.repocity.citystate.event.CityMutation;
import com.repocity.citystate.event.CityMutation.AnimationHint;
import com.repocity.citystate.event.CityMutationEvent;
import com.repocity.identity.domain.Gender;
import com.repocity.identity.domain.GitlabUser;
import com.repocity.identity.domain.UserRole;
import com.repocity.identity.repository.GitlabUserRepository;
import com.repocity.identity.repository.RepoRepository;
import com.repocity.poller.domain.PollEvent.EventType;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Developer-only endpoint that fires synthetic city mutation events without
 * requiring a real GitLab poll cycle.
 *
 * <p>Useful for testing the full pipeline:
 * <pre>
 *   POST /api/simulate  →  CityMutationEvent  →  CityBroadcaster  →  WebSocket  →  Frontend effects
 * </pre>
 *
 * <p><strong>This controller is for development / QA only.</strong>
 * In production it should be protected or disabled via a profile flag.
 */
@RestController
@RequestMapping("/api/simulate")
public class SimulationController {

    /** Maps request event-type strings to AnimationHint values. */
    private static final Map<String, AnimationHint> HINT_MAP = Map.of(
            "COMMIT",           AnimationHint.COMMIT_BEAM,
            "MR_OPENED",        AnimationHint.MR_OPENED_BEAM,
            "MR_MERGED",        AnimationHint.MERGE_SUCCESS,
            "PIPELINE_RUNNING", AnimationHint.PIPELINE_RUNNING,
            "PIPELINE_SUCCESS", AnimationHint.PIPELINE_SUCCESS,
            "PIPELINE_FAILED",  AnimationHint.PIPELINE_FAILED
    );

    /** Maps request event-type strings to EventType enum. */
    private static final Map<String, EventType> EVENT_TYPE_MAP = Map.of(
            "COMMIT",           EventType.COMMIT,
            "MR_OPENED",        EventType.MR_OPENED,
            "MR_MERGED",        EventType.MR_MERGED,
            "PIPELINE_RUNNING", EventType.PIPELINE,
            "PIPELINE_SUCCESS", EventType.PIPELINE,
            "PIPELINE_FAILED",  EventType.PIPELINE
    );

    private final ApplicationEventPublisher eventPublisher;
    private final RepoRepository            repoRepository;
    private final GitlabUserRepository      gitlabUserRepository;
    private final CityStateService          cityStateService;
    private final Random                    rng = new Random();

    public SimulationController(ApplicationEventPublisher eventPublisher,
                                RepoRepository repoRepository,
                                GitlabUserRepository gitlabUserRepository,
                                CityStateService cityStateService) {
        this.eventPublisher       = eventPublisher;
        this.repoRepository       = repoRepository;
        this.gitlabUserRepository = gitlabUserRepository;
        this.cityStateService     = cityStateService;
    }

    /**
     * Request body for a single simulation event.
     *
     * @param repoSlug  full repo slug e.g. {@code "ms-partner-gateway"}
     * @param eventType one of COMMIT, MR_OPENED, MR_MERGED,
     *                  PIPELINE_RUNNING, PIPELINE_SUCCESS, PIPELINE_FAILED
     * @param actor     optional actor gitlabUsername (random real worker if omitted)
     */
    public record SimulateRequest(
            String repoSlug,
            String eventType,
            String actor
    ) {}

    /**
     * Fires a single synthetic event for the given repo + event type.
     * Publishes a {@link CityMutationEvent} through Spring so it flows through
     * {@code CityBroadcaster} and arrives at the browser exactly like a real event.
     */
    @PostMapping
    public ResponseEntity<Map<String, String>> simulate(@RequestBody SimulateRequest req) {
        if (req.repoSlug() == null || req.eventType() == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "repoSlug and eventType are required"));
        }

        AnimationHint hint = HINT_MAP.get(req.eventType().toUpperCase());
        if (hint == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Unknown eventType: " + req.eventType()
                            + ". Valid values: " + String.join(", ", HINT_MAP.keySet())));
        }

        // Resolve repo icon from DB (graceful fallback if slug not found)
        String repoIcon = repoRepository.findBySlug(req.repoSlug())
                .map(r -> r.getIcon())
                .orElse("🏢");

        // Look up worker by gitlabUsername, or pick a random real worker
        GitlabUser worker = (req.actor() != null && !req.actor().isBlank())
                ? gitlabUserRepository.findByGitlabUsername(req.actor()).orElse(null)
                : null;
        if (worker == null) {
            List<GitlabUser> all = gitlabUserRepository.findAll();
            worker = all.isEmpty() ? null : all.get(rng.nextInt(all.size()));
        }
        String   actorName          = worker != null ? worker.getDisplayName()    : "Unknown";
        String   actorGitlabUsername = worker != null ? worker.getGitlabUsername() : null;
        UserRole actorRole           = worker != null ? worker.getRole()           : UserRole.ENGINEER;
        Gender   actorGender         = worker != null ? worker.getGender()         : Gender.MALE;

        EventType eventType = EVENT_TYPE_MAP.getOrDefault(req.eventType().toUpperCase(), EventType.COMMIT);

        // Read current district state so we can produce a realistic delta.
        // MR_OPENED adds 1 open MR; MR_MERGED subtracts 1; others keep the current count.
        var districtState = cityStateService.getCityState().getDistricts().get(req.repoSlug());
        int currentOpenMrs   = districtState != null ? districtState.getOpenMrCount()   : 0;
        int currentFloors    = districtState != null ? districtState.getBuildingFloors() : 1;
        int newOpenMrCount = switch (req.eventType().toUpperCase()) {
            case "MR_OPENED" -> currentOpenMrs + 1;
            case "MR_MERGED" -> Math.max(0, currentOpenMrs - 1);
            default          -> currentOpenMrs;
        };
        int newBuildingFloors = (req.eventType().equalsIgnoreCase("MR_MERGED"))
                ? Math.min(currentFloors + 1, 12)
                : currentFloors;

        CityMutation mutation = CityMutation.builder()
                .eventType(eventType)
                .repoSlug(req.repoSlug())
                .repoIcon(repoIcon)
                .actorDisplayName(actorName)
                .actorGitlabUsername(actorGitlabUsername)
                .actorRole(actorRole)
                .actorGender(actorGender)
                .animationHint(hint)
                .newBuildingFloors(newBuildingFloors)
                .newOpenMrCount(newOpenMrCount)
                .build();

        eventPublisher.publishEvent(new CityMutationEvent(List.of(mutation)));

        return ResponseEntity.ok(Map.of(
                "status",    "fired",
                "repoSlug",  req.repoSlug(),
                "eventType", req.eventType(),
                "hint",      hint.name(),
                "actor",     actorName,
                "repoIcon",  repoIcon
        ));
    }

    /**
     * Fires a burst of random events across all repos.
     * Useful for stress-testing the animation system.
     *
     * @param count number of events to fire (default 5, max 20)
     */
    @PostMapping("/burst")
    public ResponseEntity<Map<String, Object>> burst(
            @RequestParam(defaultValue = "5") int count) {

        count = Math.min(count, 20);

        List<String> slugs = repoRepository.findAll().stream()
                .map(r -> r.getSlug())
                .toList();

        if (slugs.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "No repos found in database"));
        }

        String[] eventTypes = HINT_MAP.keySet().toArray(new String[0]);
        List<GitlabUser> allWorkers = gitlabUserRepository.findAll();
        List<Map<String, String>> fired = new java.util.ArrayList<>();

        for (int i = 0; i < count; i++) {
            String slug      = slugs.get(rng.nextInt(slugs.size()));
            String eventType = eventTypes[rng.nextInt(eventTypes.length)];

            GitlabUser worker = allWorkers.isEmpty()
                    ? null
                    : allWorkers.get(rng.nextInt(allWorkers.size()));
            String   actor              = worker != null ? worker.getDisplayName()    : "Unknown";
            String   actorGitlabUsername = worker != null ? worker.getGitlabUsername() : null;
            UserRole actorRole           = worker != null ? worker.getRole()           : UserRole.ENGINEER;
            Gender   actorGender         = worker != null ? worker.getGender()         : Gender.MALE;

            String repoIcon = repoRepository.findBySlug(slug)
                    .map(r -> r.getIcon())
                    .orElse("🏢");

            AnimationHint hint      = HINT_MAP.get(eventType);
            EventType     evType    = EVENT_TYPE_MAP.get(eventType);

            var districtState = cityStateService.getCityState().getDistricts().get(slug);
            int currentOpenMrs  = districtState != null ? districtState.getOpenMrCount()   : 0;
            int currentFloors   = districtState != null ? districtState.getBuildingFloors() : 1;
            int newOpenMrCount = switch (eventType) {
                case "MR_OPENED" -> currentOpenMrs + 1;
                case "MR_MERGED" -> Math.max(0, currentOpenMrs - 1);
                default          -> currentOpenMrs;
            };
            int newFloors = eventType.equals("MR_MERGED") ? Math.min(currentFloors + 1, 12) : currentFloors;

            CityMutation mutation = CityMutation.builder()
                    .eventType(evType)
                    .repoSlug(slug)
                    .repoIcon(repoIcon)
                    .actorDisplayName(actor)
                    .actorGitlabUsername(actorGitlabUsername)
                    .actorRole(actorRole)
                    .actorGender(actorGender)
                    .animationHint(hint)
                    .newBuildingFloors(newFloors)
                    .newOpenMrCount(newOpenMrCount)
                    .build();

            eventPublisher.publishEvent(new CityMutationEvent(List.of(mutation)));
            fired.add(Map.of("slug", slug, "event", eventType, "actor", actor));
        }

        return ResponseEntity.ok(Map.of("fired", fired, "count", count));
    }
}
