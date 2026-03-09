package com.repocity.realtime;

import com.repocity.citystate.event.CityMutation;
import com.repocity.citystate.event.CityMutationEvent;
import com.repocity.identity.domain.Gender;
import com.repocity.identity.domain.UserRole;
import com.repocity.poller.domain.PollEvent.EventType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link CityBroadcaster}.
 *
 * <p>No Spring context is loaded — collaborators are mocked with Mockito.
 */
@ExtendWith(MockitoExtension.class)
class CityBroadcasterTest {

    @Mock  private SimpMessagingTemplate messagingTemplate;
    @Captor private ArgumentCaptor<CityMutationMessage> messageCaptor;

    private CityBroadcaster broadcaster;

    @BeforeEach
    void setUp() {
        broadcaster = new CityBroadcaster(messagingTemplate);
    }

    // ── onCityMutation — single mutation ──────────────────────────────────────

    @Test
    void onCityMutation_singleMutation_broadcastsToCorrectTopic() {
        CityMutation mutation = buildCommitMutation("ms-transaction", "💸", "Rizki Ekaputri");
        CityMutationEvent event = new CityMutationEvent(List.of(mutation));

        broadcaster.onCityMutation(event);

        verify(messagingTemplate).convertAndSend(
                eq(CityBroadcaster.TOPIC_MUTATIONS),
                any(CityMutationMessage.class)
        );
    }

    @Test
    void onCityMutation_singleMutation_messageFieldsMappedCorrectly() {
        CityMutation mutation = buildCommitMutation("ms-transaction", "💸", "Rizki Ekaputri");
        CityMutationEvent event = new CityMutationEvent(List.of(mutation));

        broadcaster.onCityMutation(event);

        verify(messagingTemplate).convertAndSend(
                eq(CityBroadcaster.TOPIC_MUTATIONS),
                messageCaptor.capture()
        );

        CityMutationMessage msg = messageCaptor.getValue();
        assertThat(msg.type()).isEqualTo("COMMIT");
        assertThat(msg.repoSlug()).isEqualTo("ms-transaction");
        assertThat(msg.repoIcon()).isEqualTo("💸");
        assertThat(msg.actorDisplayName()).isEqualTo("Rizki Ekaputri");
        assertThat(msg.actorRole()).isEqualTo(UserRole.ENGINEER);
        assertThat(msg.actorGender()).isEqualTo(Gender.FEMALE);
        assertThat(msg.animationHint()).isEqualTo("COMMIT_BEAM");
        assertThat(msg.newBuildingFloors()).isEqualTo(7);
        assertThat(msg.timestamp()).isNotNull();
    }

    @Test
    void onCityMutation_multipleMutations_broadcastsOneMessageEach() {
        List<CityMutation> mutations = List.of(
                buildCommitMutation("ms-transaction", "💸", "Rizki Ekaputri"),
                buildCommitMutation("ms-partner-a",   "🤝", "Bram Perdana")
        );
        CityMutationEvent event = new CityMutationEvent(mutations);

        broadcaster.onCityMutation(event);

        verify(messagingTemplate, times(2)).convertAndSend(
                eq(CityBroadcaster.TOPIC_MUTATIONS),
                any(CityMutationMessage.class)
        );
    }

    // ── onCityMutation — edge cases ───────────────────────────────────────────

    @Test
    void onCityMutation_emptyMutationList_doesNotBroadcast() {
        CityMutationEvent event = new CityMutationEvent(List.of());

        broadcaster.onCityMutation(event);

        verifyNoInteractions(messagingTemplate);
    }

    @Test
    void onCityMutation_nullEventTypeAndHint_doesNotThrow() {
        CityMutation mutation = CityMutation.builder()
                .repoSlug("ms-transaction")
                .repoIcon("💸")
                .actorDisplayName("Unknown Actor")
                .eventType(null)
                .animationHint(null)
                .newBuildingFloors(1)
                .newOpenMrCount(0)
                .timestamp(Instant.now())
                .build();

        CityMutationEvent event = new CityMutationEvent(List.of(mutation));

        assertThatNoException().isThrownBy(() -> broadcaster.onCityMutation(event));

        verify(messagingTemplate).convertAndSend(
                eq(CityBroadcaster.TOPIC_MUTATIONS),
                messageCaptor.capture()
        );
        CityMutationMessage msg = messageCaptor.getValue();
        assertThat(msg.type()).isNull();
        assertThat(msg.animationHint()).isNull();
    }

    @Test
    void onCityMutation_pipelineMutation_includesPipelineStatus() {
        CityMutation mutation = CityMutation.builder()
                .repoSlug("ms-pip-a")
                .repoIcon("🔧")
                .actorDisplayName("CI Bot")
                .eventType(EventType.PIPELINE)
                .animationHint(CityMutation.AnimationHint.PIPELINE_SUCCESS)
                .pipelineStatus("success")
                .newBuildingFloors(5)
                .newOpenMrCount(2)
                .timestamp(Instant.now())
                .build();

        CityMutationEvent event = new CityMutationEvent(List.of(mutation));
        broadcaster.onCityMutation(event);

        verify(messagingTemplate).convertAndSend(
                eq(CityBroadcaster.TOPIC_MUTATIONS),
                messageCaptor.capture()
        );

        CityMutationMessage msg = messageCaptor.getValue();
        assertThat(msg.animationHint()).isEqualTo("PIPELINE_SUCCESS");
        assertThat(msg.pipelineStatus()).isEqualTo("success");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static CityMutation buildCommitMutation(String slug, String icon, String actorName) {
        return CityMutation.builder()
                .repoSlug(slug)
                .repoIcon(icon)
                .actorDisplayName(actorName)
                .actorRole(UserRole.ENGINEER)
                .actorGender(Gender.FEMALE)
                .eventType(EventType.COMMIT)
                .animationHint(CityMutation.AnimationHint.COMMIT_BEAM)
                .newBuildingFloors(7)
                .newOpenMrCount(3)
                .timestamp(Instant.now())
                .build();
    }
}
