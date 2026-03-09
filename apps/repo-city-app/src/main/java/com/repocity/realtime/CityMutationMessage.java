package com.repocity.realtime;

import com.repocity.citystate.event.CityMutation;
import com.repocity.identity.domain.Gender;
import com.repocity.identity.domain.UserRole;

import java.time.Instant;

/**
 * JSON payload broadcast to {@code /topic/city/mutations} for each processed event.
 *
 * <p>Built from a {@link CityMutation} by {@link CityBroadcaster}.
 *
 * @see <a href="../../../../../../docs/modular-monolith-architecture.md#92-message-citymutationmessage">§9.2</a>
 */
public record CityMutationMessage(

        /** Original event type that caused this mutation (e.g. {@code COMMIT}, {@code MR_MERGED}). */
        String type,

        /** Repository slug matching the prototype's {@code STRUCTURES[].repo}. */
        String repoSlug,

        /** Emoji icon for the repository district. */
        String repoIcon,

        /** Human-readable developer name (drives avatar label in the frontend). */
        String actorDisplayName,

        /** Unique GitLab username for exact dev matching in the frontend. May be null. */
        String actorGitlabUsername,

        /** Developer role (used for avatar type selection). */
        UserRole actorRole,

        /** Developer gender (drives avatar asset selection). */
        Gender actorGender,

        /**
         * Direct animation instruction for the Three.js frontend.
         * One of: {@code COMMIT_BEAM}, {@code MR_OPENED_BEAM}, {@code MERGE_SUCCESS},
         * {@code PIPELINE_RUNNING}, {@code PIPELINE_SUCCESS}, {@code PIPELINE_FAILED}.
         */
        String animationHint,

        /** Updated building floor count for the affected district (post-mutation). */
        int newBuildingFloors,

        /** Updated open MR count for the affected district (post-mutation). */
        int newOpenMrCount,

        /** Pipeline status string for PIPELINE mutations; {@code null} for other types. */
        String pipelineStatus,

        /** Wall-clock time of the underlying poll event. */
        Instant timestamp
) {

    /**
     * Factory method — creates a {@code CityMutationMessage} from a domain {@link CityMutation}.
     *
     * @param mutation the domain mutation produced by the {@code city-state} module
     * @return a serializable DTO ready for STOMP broadcast
     */
    public static CityMutationMessage from(CityMutation mutation) {
        return new CityMutationMessage(
                mutation.getEventType() != null ? mutation.getEventType().name() : null,
                mutation.getRepoSlug(),
                mutation.getRepoIcon(),
                mutation.getActorDisplayName(),
                mutation.getActorGitlabUsername(),
                mutation.getActorRole(),
                mutation.getActorGender(),
                mutation.getAnimationHint() != null ? mutation.getAnimationHint().name() : null,
                mutation.getNewBuildingFloors(),
                mutation.getNewOpenMrCount(),
                mutation.getPipelineStatus(),
                mutation.getTimestamp()
        );
    }
}
