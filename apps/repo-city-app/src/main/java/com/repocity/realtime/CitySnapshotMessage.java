package com.repocity.realtime;

import com.repocity.citystate.model.CityState;
import com.repocity.citystate.model.DistrictState;
import com.repocity.citystate.model.WorkerState;
import com.repocity.identity.domain.Gender;
import com.repocity.identity.domain.RepoStatus;
import com.repocity.identity.domain.UserRole;

import java.time.Instant;
import java.util.List;
import java.util.Set;

/**
 * Full city state snapshot broadcast to {@code /topic/city/snapshot} when a new
 * browser client connects.
 *
 * <p>Built from the live {@link CityState} by {@link SessionConnectHandler}.
 *
 * @see <a href="../../../../../../docs/modular-monolith-architecture.md#93-message-citysnapshotmessage">§9.3</a>
 */
public record CitySnapshotMessage(

        /** One entry per repository district. */
        List<DistrictSummary> districts,

        /** One entry per developer (worker). */
        List<WorkerSummary> workers,

        /** Aggregate counters for the city HUD. */
        Stats stats,

        /** Wall-clock time when this snapshot was generated. */
        Instant generatedAt
) {

    /**
     * Summary of a single repository district.
     *
     * @param repoSlug           repository slug
     * @param repoIcon           emoji icon for the building
     * @param repoName           human-readable district label
     * @param repoStatus         lifecycle status of the repository
     * @param buildingFloors     current floor height of the building
     * @param openMrCount        number of currently open merge requests
     * @param pipelineStatus     last known CI/CD pipeline status
     * @param activeWorkerNames  display names of developers currently in this district
     */
    public record DistrictSummary(
            String      repoSlug,
            String      repoIcon,
            String      repoName,
            RepoStatus  repoStatus,
            int         buildingFloors,
            int         openMrCount,
            String      pipelineStatus,
            Set<String> activeWorkerNames
    ) {}

    /**
     * Summary of a single developer (worker).
     *
     * @param displayName          full human-readable name
     * @param role                 developer role
     * @param gender               gender (drives avatar asset selection)
     * @param currentDistrictSlug  repo slug of the district the worker is currently in; may be null
     */
    public record WorkerSummary(
            String   displayName,
            UserRole role,
            Gender   gender,
            String   currentDistrictSlug
    ) {}

    /**
     * City-wide aggregate counters.
     *
     * @param totalCommits         total number of commits ever processed
     * @param totalMrsMerged       total number of merged MRs ever processed
     * @param activeDeveloperCount number of developers who have appeared in the city
     */
    public record Stats(
            int totalCommits,
            int totalMrsMerged,
            int activeDeveloperCount
    ) {}

    // ── Factory ────────────────────────────────────────────────────────────────

    /**
     * Creates a {@code CitySnapshotMessage} from the live in-memory {@link CityState}.
     *
     * @param state the live city state (read-only access)
     * @return a fully serializable snapshot DTO
     */
    public static CitySnapshotMessage from(CityState state) {
        List<DistrictSummary> districts = state.getDistricts().values().stream()
                .map(CitySnapshotMessage::toDistrictSummary)
                .sorted(java.util.Comparator.comparing(DistrictSummary::repoSlug))
                .toList();

        List<WorkerSummary> workers = state.getWorkers().values().stream()
                .map(CitySnapshotMessage::toWorkerSummary)
                .sorted(java.util.Comparator.comparing(WorkerSummary::displayName))
                .toList();

        Stats stats = new Stats(
                state.getTotalCommits(),
                state.getTotalMrsMerged(),
                state.getActiveDeveloperCount()
        );

        return new CitySnapshotMessage(districts, workers, stats, Instant.now());
    }

    private static DistrictSummary toDistrictSummary(DistrictState d) {
        return new DistrictSummary(
                d.getRepoSlug(),
                d.getRepoIcon(),
                d.getRepoName(),
                d.getRepoStatus(),
                d.getBuildingFloors(),
                d.getOpenMrCount(),
                d.getPipelineStatus() != null ? d.getPipelineStatus().name() : null,
                Set.copyOf(d.getActiveWorkerNames())
        );
    }

    private static WorkerSummary toWorkerSummary(WorkerState w) {
        return new WorkerSummary(
                w.getDisplayName(),
                w.getRole(),
                w.getGender(),
                w.getCurrentDistrictSlug()
        );
    }
}
