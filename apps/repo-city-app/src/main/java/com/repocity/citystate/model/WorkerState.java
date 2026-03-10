package com.repocity.citystate.model;

import com.repocity.identity.domain.Gender;
import com.repocity.identity.domain.UserRole;
import lombok.Getter;

import java.time.Instant;

/**
 * Mutable in-memory state for a single developer (worker) in the city.
 *
 * <p>Tracks where the developer is currently located and when they last appeared,
 * allowing the frontend to render them walking between districts.
 */
@Getter
public class WorkerState {

    /** Matches {@link com.repocity.identity.domain.GitlabUser#getDisplayName()}. */
    private final String displayName;

    private final UserRole role;
    private final Gender   gender;

    /** The repo slug of the district where this worker is currently active. Null = idle. */
    private String currentDistrictSlug;

    /** Last time an event was attributed to this worker. */
    private Instant lastSeenAt;

    /** Activity counters for this developer. */
    private final DeveloperActivity activity = new DeveloperActivity();

    public WorkerState(String displayName, UserRole role, Gender gender) {
        this.displayName = displayName;
        this.role        = role;
        this.gender      = gender;
        this.lastSeenAt  = Instant.EPOCH;
    }

    // ── Mutation helpers ───────────────────────────────────────────────────────

    public void moveTo(String repoSlug) {
        this.currentDistrictSlug = repoSlug;
        this.lastSeenAt          = Instant.now();
    }
}
