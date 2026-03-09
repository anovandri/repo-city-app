package com.repocity.realtime;

import com.repocity.citystate.CityStateService;
import com.repocity.citystate.model.CityState;
import com.repocity.citystate.model.DistrictState;
import com.repocity.citystate.model.WorkerState;
import com.repocity.identity.domain.Gender;
import com.repocity.identity.domain.RepoStatus;
import com.repocity.identity.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.web.socket.messaging.SessionConnectedEvent;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link SessionConnectHandler}.
 *
 * <p>No Spring context is loaded — collaborators are mocked with Mockito.
 */
@ExtendWith(MockitoExtension.class)
class SessionConnectHandlerTest {

    @Mock  private SimpMessagingTemplate messagingTemplate;
    @Mock  private CityStateService      cityStateService;
    @Captor private ArgumentCaptor<CitySnapshotMessage> snapshotCaptor;

    private SessionConnectHandler handler;

    @BeforeEach
    void setUp() {
        handler = new SessionConnectHandler(messagingTemplate, cityStateService);
    }

    // ── onApplicationEvent ────────────────────────────────────────────────────

    @Test
    void onApplicationEvent_sendsSnapshotToCorrectTopic() {
        when(cityStateService.getCityState()).thenReturn(emptyState());

        handler.onApplicationEvent(buildEvent("session-001"));

        verify(messagingTemplate).convertAndSend(
                eq(SessionConnectHandler.TOPIC_SNAPSHOT),
                any(CitySnapshotMessage.class)
        );
    }

    @Test
    void onApplicationEvent_snapshotContainsDistrict() {
        CityState state = stateWithOneDistrict("ms-transaction", "💸", "Transaction Service");
        when(cityStateService.getCityState()).thenReturn(state);

        handler.onApplicationEvent(buildEvent("session-002"));

        verify(messagingTemplate).convertAndSend(
                eq(SessionConnectHandler.TOPIC_SNAPSHOT),
                snapshotCaptor.capture()
        );

        CitySnapshotMessage snapshot = snapshotCaptor.getValue();
        assertThat(snapshot.districts()).hasSize(1);
        assertThat(snapshot.districts().getFirst().repoSlug()).isEqualTo("ms-transaction");
        assertThat(snapshot.districts().getFirst().repoIcon()).isEqualTo("💸");
        assertThat(snapshot.districts().getFirst().repoName()).isEqualTo("Transaction Service");
        assertThat(snapshot.generatedAt()).isNotNull();
    }

    @Test
    void onApplicationEvent_snapshotContainsWorker() {
        CityState state = stateWithOneWorker("Rizki Ekaputri", UserRole.ENGINEER, Gender.FEMALE);
        when(cityStateService.getCityState()).thenReturn(state);

        handler.onApplicationEvent(buildEvent("session-003"));

        verify(messagingTemplate).convertAndSend(
                eq(SessionConnectHandler.TOPIC_SNAPSHOT),
                snapshotCaptor.capture()
        );

        CitySnapshotMessage snapshot = snapshotCaptor.getValue();
        assertThat(snapshot.workers()).hasSize(1);
        CitySnapshotMessage.WorkerSummary worker = snapshot.workers().getFirst();
        assertThat(worker.displayName()).isEqualTo("Rizki Ekaputri");
        assertThat(worker.role()).isEqualTo(UserRole.ENGINEER);
        assertThat(worker.gender()).isEqualTo(Gender.FEMALE);
    }

    @Test
    void onApplicationEvent_emptyState_sendsEmptySnapshot() {
        when(cityStateService.getCityState()).thenReturn(emptyState());

        handler.onApplicationEvent(buildEvent("session-004"));

        verify(messagingTemplate).convertAndSend(
                eq(SessionConnectHandler.TOPIC_SNAPSHOT),
                snapshotCaptor.capture()
        );

        CitySnapshotMessage snapshot = snapshotCaptor.getValue();
        assertThat(snapshot.districts()).isEmpty();
        assertThat(snapshot.workers()).isEmpty();
        assertThat(snapshot.stats().totalCommits()).isZero();
        assertThat(snapshot.stats().activeDeveloperCount()).isZero();
    }

    @Test
    void onApplicationEvent_statsReflectCityStateAggregates() {
        CityState state = emptyState();
        // Simulate some recorded activity
        state.recordCommit();
        state.recordCommit();
        state.recordMerge();
        state.putWorker(new WorkerState("Dev A", UserRole.ENGINEER, Gender.MALE));
        state.putWorker(new WorkerState("Dev B", UserRole.LEADER, Gender.FEMALE));
        when(cityStateService.getCityState()).thenReturn(state);

        handler.onApplicationEvent(buildEvent("session-005"));

        verify(messagingTemplate).convertAndSend(
                eq(SessionConnectHandler.TOPIC_SNAPSHOT),
                snapshotCaptor.capture()
        );

        CitySnapshotMessage snapshot = snapshotCaptor.getValue();
        assertThat(snapshot.stats().totalCommits()).isEqualTo(2);
        assertThat(snapshot.stats().totalMrsMerged()).isEqualTo(1);
        assertThat(snapshot.stats().activeDeveloperCount()).isEqualTo(2);
    }

    @Test
    void onApplicationEvent_callsCityStateServiceExactlyOnce() {
        when(cityStateService.getCityState()).thenReturn(emptyState());

        handler.onApplicationEvent(buildEvent("session-006"));

        verify(cityStateService, times(1)).getCityState();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Builds a minimal {@link SessionConnectedEvent} with the given session ID. */
    private static SessionConnectedEvent buildEvent(String sessionId) {
        Message<byte[]> message = MessageBuilder
                .withPayload(new byte[0])
                .setHeader("simpSessionId", sessionId)
                .build();
        return new SessionConnectedEvent(new Object(), message);
    }

    private static CityState emptyState() {
        return new CityState();
    }

    private static CityState stateWithOneDistrict(String slug, String icon, String name) {
        CityState state = new CityState();
        DistrictState district = new DistrictState(slug, name, icon, RepoStatus.ACTIVE, 0);
        state.putDistrict(district);
        return state;
    }

    private static CityState stateWithOneWorker(String name, UserRole role, Gender gender) {
        CityState state = new CityState();
        WorkerState worker = new WorkerState(name, role, gender);
        state.putWorker(worker);
        return state;
    }
}
