package com.repocity.realtime;

import com.repocity.citystate.CityStateService;
import com.repocity.citystate.model.CityState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

/**
 * Handles the client-initiated snapshot request.
 *
 * <p>The browser subscribes to {@code /topic/city/snapshot} and then immediately
 * sends to {@code /app/city/snapshot-request}. This controller receives that
 * message and broadcasts the current city state back to the shared topic.
 *
 * <p>Using a client-pull model avoids the race condition that exists when the
 * server pushes on {@link org.springframework.web.socket.messaging.SessionConnectedEvent}:
 * the STOMP CONNECTED event fires before the client has sent its SUBSCRIBE frames,
 * so a server push at that moment arrives before the subscription is active and
 * is silently dropped by the broker.
 */
@Controller
public class SessionConnectHandler {

    private static final Logger log = LoggerFactory.getLogger(SessionConnectHandler.class);

    /** STOMP destination — full snapshot broadcast. */
    static final String TOPIC_SNAPSHOT = "/topic/city/snapshot";

    private final SimpMessagingTemplate messagingTemplate;
    private final CityStateService      cityStateService;

    public SessionConnectHandler(SimpMessagingTemplate messagingTemplate,
                                 CityStateService cityStateService) {
        this.messagingTemplate = messagingTemplate;
        this.cityStateService  = cityStateService;
    }

    /**
     * Client sends {@code /app/city/snapshot-request} after subscribing.
     * Responds by broadcasting the current city state to {@code /topic/city/snapshot}.
     */
    @MessageMapping("/city/snapshot-request")
    public void onSnapshotRequest() {
        CityState           state    = cityStateService.getCityState();
        log.debug("City state open MR {}", state.getDistricts().values().stream().mapToInt(d -> d.getOpenMrCount()).sum());
        CitySnapshotMessage snapshot = CitySnapshotMessage.from(state);

        messagingTemplate.convertAndSend(TOPIC_SNAPSHOT, snapshot);
        log.debug("Sent city snapshot on request: {} districts, {} workers",
                snapshot.districts().size(), snapshot.workers().size());
    }
}


