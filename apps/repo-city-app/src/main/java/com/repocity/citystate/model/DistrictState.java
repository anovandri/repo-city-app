package com.repocity.citystate.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.repocity.identity.domain.RepoStatus;
import lombok.Getter;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Mutable in-memory state for a single repository district.
 *
 * <p>All mutations happen inside {@link com.repocity.citystate.CityStateService}
 * while holding the service-level lock — this class itself is not thread-safe.
 */
@Getter
public class DistrictState {

    /** Matches {@link com.repocity.identity.domain.GitLabRepository#getSlug()}. */
    private final String repoSlug;

    /**
     * Human-readable display name used as the floating building label in the city UI.
     * Sourced from {@link com.repocity.identity.domain.GitLabRepository#getName()}.
     */
    private final String repoName;

    /** Emoji icon from the repository master data. */
    private final String repoIcon;

    /**
     * Lifecycle status of this district's repository.
     * Controls the visual variant of the floating building label
     * ({@link RepoStatus#MAINTENANCE} → ⚠️ "SUNSET SOON" badge, etc.).
     */
    private final RepoStatus repoStatus;

    /** Number of building floors — incremented on COMMIT and MR_MERGED events. */
    private int buildingFloors;

    /**
     * Count of currently open merge requests.
     * Incremented on MR_OPENED, decremented (floor 0) on MR_MERGED.
     *
     * <p>Excluded from snapshot serialization ({@code @JsonIgnore}) because the DB
     * column {@code gitlab_repositories.open_mrs} is the single source of truth.
     * The value is always re-synced from the DB after restore and after each poll
     * cycle via {@link com.repocity.citystate.CityStateService#refreshOpenMrCountsFromDb()}.
     */
    @JsonIgnore
    private int openMrCount;

    /** Current CI pipeline status. */
    private PipelineStatus pipelineStatus;

    /** Display names of developers who are currently active in this district. */
    private final Set<String> activeWorkerNames;

    /** Last time this district received any event. */
    private Instant lastActivityAt;

    public DistrictState(String repoSlug, String repoName, String repoIcon,
                         RepoStatus repoStatus, int openMrCount) {
        this.repoSlug         = repoSlug;
        this.repoName         = repoName;
        this.repoIcon         = repoIcon;
        this.repoStatus       = repoStatus;
        this.buildingFloors   = 0;
        this.openMrCount      = openMrCount;
        this.pipelineStatus   = PipelineStatus.IDLE;
        this.activeWorkerNames= new LinkedHashSet<>();
        this.lastActivityAt   = Instant.EPOCH;
    }

    // ── Mutation helpers (called by CityStateService) ──────────────────────────

    public void commitArrived(String workerName) {
        activeWorkerNames.add(workerName);
        lastActivityAt = Instant.now();
    }

    public void mrOpened(String workerName) {
        openMrCount = Math.max(0, openMrCount) + 1;
        activeWorkerNames.add(workerName);
        lastActivityAt = Instant.now();
    }

    public void mrMerged(String workerName) {
        openMrCount      = Math.max(0, openMrCount - 1);
        buildingFloors  += 3;
        activeWorkerNames.add(workerName);
        lastActivityAt   = Instant.now();
    }

    public void pipelineUpdated(PipelineStatus status) {
        this.pipelineStatus = status;
        this.lastActivityAt = Instant.now();
    }

    /**
     * Overrides the open MR count with the authoritative value from
     * {@link com.repocity.identity.domain.GitLabRepository#getOpenMrs()}.
     * Called after each poll cycle to keep this counter in sync with the DB
     * instead of relying solely on incremental MR_OPENED/MR_MERGED deltas.
     */
    public void setOpenMrCount(int openMrCount) {
        this.openMrCount = Math.max(0, openMrCount);
    }

    // ── Custom getter: defensive copy of the mutable set ──────────────────────

    /**
     * Returns an immutable snapshot of the active-worker set.
     * Overrides the Lombok-generated getter to prevent callers from mutating
     * the internal {@link LinkedHashSet}.
     */
    public Set<String> getActiveWorkerNames() {
        return Set.copyOf(activeWorkerNames);
    }
}
