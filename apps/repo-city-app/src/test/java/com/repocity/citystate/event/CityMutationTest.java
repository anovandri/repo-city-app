package com.repocity.citystate.event;

import com.repocity.identity.domain.Gender;
import com.repocity.identity.domain.UserRole;
import com.repocity.poller.domain.PollEvent.EventType;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.*;

/**
 * Unit tests for the Lombok {@code @Builder} and {@code @Builder.Default} behaviour on
 * {@link CityMutation}.
 */
class CityMutationTest {

    @Test
    void builder_setsAllFields() {
        Instant ts = Instant.parse("2026-01-01T00:00:00Z");

        CityMutation m = CityMutation.builder()
                .eventType(EventType.COMMIT)
                .repoSlug("partner-web")
                .repoIcon("🌐")
                .actorDisplayName("Aditya")
                .actorRole(UserRole.LEADER)
                .actorGender(Gender.MALE)
                .animationHint(CityMutation.AnimationHint.COMMIT_BEAM)
                .newBuildingFloors(5)
                .newOpenMrCount(2)
                .pipelineStatus(null)
                .timestamp(ts)
                .build();

        assertThat(m.getEventType()).isEqualTo(EventType.COMMIT);
        assertThat(m.getRepoSlug()).isEqualTo("partner-web");
        assertThat(m.getRepoIcon()).isEqualTo("🌐");
        assertThat(m.getActorDisplayName()).isEqualTo("Aditya");
        assertThat(m.getActorRole()).isEqualTo(UserRole.LEADER);
        assertThat(m.getActorGender()).isEqualTo(Gender.MALE);
        assertThat(m.getAnimationHint()).isEqualTo(CityMutation.AnimationHint.COMMIT_BEAM);
        assertThat(m.getNewBuildingFloors()).isEqualTo(5);
        assertThat(m.getNewOpenMrCount()).isEqualTo(2);
        assertThat(m.getPipelineStatus()).isNull();
        assertThat(m.getTimestamp()).isEqualTo(ts);
    }

    @Test
    void builder_defaultTimestamp_isCloseToNow() {
        Instant before = Instant.now().minusSeconds(1);

        CityMutation m = CityMutation.builder()
                .eventType(EventType.COMMIT)
                .repoSlug("partner-web")
                .build();

        assertThat(m.getTimestamp()).isAfter(before);
        assertThat(m.getTimestamp()).isBefore(Instant.now().plusSeconds(1));
    }

    @Test
    void builder_explicitTimestamp_overridesDefault() {
        Instant custom = Instant.parse("2020-06-15T12:00:00Z");

        CityMutation m = CityMutation.builder()
                .eventType(EventType.PIPELINE)
                .repoSlug("ginpay")
                .timestamp(custom)
                .build();

        assertThat(m.getTimestamp()).isEqualTo(custom);
    }

    @Test
    void toString_containsKeyFields() {
        CityMutation m = CityMutation.builder()
                .eventType(EventType.MR_OPENED)
                .repoSlug("pip-gateway")
                .actorDisplayName("Wira")
                .build();

        String s = m.toString();
        assertThat(s).contains("pip-gateway", "Wira", "MR_OPENED");
    }

    @Test
    void allAnimationHints_areReachable() {
        // Verifies the enum is intact after Lombok refactoring
        assertThat(CityMutation.AnimationHint.values()).containsExactlyInAnyOrder(
                CityMutation.AnimationHint.COMMIT_BEAM,
                CityMutation.AnimationHint.MR_OPENED_BEAM,
                CityMutation.AnimationHint.MERGE_SUCCESS,
                CityMutation.AnimationHint.PIPELINE_RUNNING,
                CityMutation.AnimationHint.PIPELINE_SUCCESS,
                CityMutation.AnimationHint.PIPELINE_FAILED
        );
    }
}
