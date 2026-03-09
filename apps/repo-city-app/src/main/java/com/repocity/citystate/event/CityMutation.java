package com.repocity.citystate.event;

import com.repocity.identity.domain.Gender;
import com.repocity.identity.domain.UserRole;
import com.repocity.poller.domain.PollEvent.EventType;
import lombok.Builder;
import lombok.Getter;
import lombok.ToString;

import java.time.Instant;

/**
 * Represents a single state mutation produced by the {@code city-state} module.
 *
 * <p>Consumed by the {@code realtime} module ({@code CityBroadcaster}) which serializes
 * each mutation to a {@code CityMutationMessage} JSON and broadcasts it to browsers via STOMP.
 *
 * <p>The {@code animationHint} field gives the frontend a direct, unambiguous instruction
 * for which Three.js animation to trigger — no switch logic needed in the browser.
 */
@Getter
@Builder
@ToString
public class CityMutation {

    /**
     * Tells the Three.js frontend exactly which animation to fire.
     *
     * @see <a href="../../docs/modular-monolith-architecture.md#realtime-contract">§9.2</a>
     */
    public enum AnimationHint {
        COMMIT_BEAM,
        MR_OPENED_BEAM,
        MERGE_SUCCESS,
        PIPELINE_RUNNING,
        PIPELINE_SUCCESS,
        PIPELINE_FAILED
    }

    /** Original event type that caused this mutation. */
    private final EventType eventType;

    /** Repository slug (matches {@code STRUCTURES[].repo} in the prototype). */
    private final String repoSlug;

    /** Emoji icon for the repository (e.g. {@code "💱"}). May be null if unknown. */
    private final String repoIcon;

    /** Developer's human-readable display name. May be null if author was unresolvable. */
    private final String actorDisplayName;

    /** Developer's role. May be null if actor was unresolvable. */
    private final UserRole actorRole;

    /** Developer's gender (drives avatar selection in the frontend). May be null. */
    private final Gender actorGender;

    /** Direct animation instruction for the Three.js frontend. */
    private final AnimationHint animationHint;

    /** Updated building floor count for the affected district (post-mutation). */
    private final int newBuildingFloors;

    /** Updated open-MR count for the affected district (post-mutation). */
    private final int newOpenMrCount;

    /** Pipeline status string for PIPELINE mutations (e.g. "running", "success", "failed"). */
    private final String pipelineStatus;

    /**
     * Wall-clock time of the underlying poll event.
     * Defaults to {@link Instant#now()} when not set explicitly via the builder.
     */
    @Builder.Default
    private final Instant timestamp = Instant.now();
}
