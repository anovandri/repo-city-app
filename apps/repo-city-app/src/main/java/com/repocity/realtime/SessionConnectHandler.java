package com.repocity.realtime;

import com.repocity.citystate.CityStateService;
import com.repocity.citystate.model.CityState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;

/**
 * Sends a full {@link CitySnapshotMessage} to every newly connected WebSocket client.
 *
 * <p>Listens for Spring's {@link SessionConnectedEvent}, which fires once per client
 * immediately after the STOMP CONNECTED frame is sent. The snapshot is broadcast
 * to {@code /topic/city/snapshot} so the newly connected browser can render the
 * city in its current state before any live mutations arrive.
 *
 * <h3>Why {@code /topic/city/snapshot} instead of a user-destination?</h3>
 * <p>SockJS + simple broker does not support per-session subscriptions without a
 * full-featured broker (RabbitMQ/ActiveMQ). Broadcasting to a shared topic is
 * acceptable here because the payload is idempotent — all clients end up with the
 * same state regardless of when they connect.
 *
 * <h3>Architecture constraints</h3>
 * <ul>
 *   <li>The only allowed cross-module call is {@link CityStateService#getCityState()},
 *       which exposes a read-only view of the in-memory state.</li>
 *   <li>This class does <strong>not</strong> depend on {@code poller}, {@code api},
 *       or {@code scheduler}.</li>
 * </ul>
 *
 * @see <a href="../../../../../../docs/modular-monolith-architecture.md#93-message-citysnapshotmessage">§9.3 Realtime Contract — CitySnapshotMessage</a>
 */
@Component
public class SessionConnectHandler implements ApplicationListener<SessionConnectedEvent> {

    private static final Logger log = LoggerFactory.getLogger(SessionConnectHandler.class);

    /** STOMP destination — full snapshot on connect. */
    static final String TOPIC_SNAPSHOT = "/topic/city/snapshot";

    private final SimpMessagingTemplate messagingTemplate;
    private final CityStateService      cityStateService;

    public SessionConnectHandler(SimpMessagingTemplate messagingTemplate,
                                 CityStateService cityStateService) {
        this.messagingTemplate = messagingTemplate;
        this.cityStateService  = cityStateService;
    }

    /**
     * Fires when a new STOMP session is established.
     *
     * <p>Reads the current in-memory {@link CityState} and broadcasts a full
     * {@link CitySnapshotMessage} to {@code /topic/city/snapshot}.
     *
     * @param event the session-connected application event from Spring WebSocket
     */
    @Override
    public void onApplicationEvent(SessionConnectedEvent event) {
        String sessionId = event.getMessage().getHeaders()
                .getOrDefault("simpSessionId", "?").toString();
        log.debug("WebSocket session connected: {}", sessionId);

        CityState     state    = cityStateService.getCityState();
        CitySnapshotMessage snapshot = CitySnapshotMessage.from(state);

        messagingTemplate.convertAndSend(TOPIC_SNAPSHOT, snapshot);
        log.debug("Sent city snapshot to /topic/city/snapshot: {} districts, {} workers",
                snapshot.districts().size(), snapshot.workers().size());
    }
}
