package com.repocity.realtime;

import com.repocity.citystate.event.CityMutationEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/**
 * Bridges the {@code city-state} module to the {@code realtime} module.
 *
 * <p>Listens for {@link CityMutationEvent} published by
 * {@link com.repocity.citystate.CityStateService} via Spring's {@code ApplicationEventPublisher}
 * and broadcasts each mutation as a {@link CityMutationMessage} JSON payload to all
 * WebSocket subscribers on {@code /topic/city/mutations}.
 *
 * <h3>Architecture constraints</h3>
 * <ul>
 *   <li>This class does <strong>not</strong> call any method on the {@code poller},
 *       {@code api}, or {@code scheduler} modules.</li>
 *   <li>Communication from {@code city-state} → {@code realtime} happens exclusively
 *       through Spring Application Events — no direct method calls.</li>
 * </ul>
 *
 * @see <a href="../../../../../../docs/modular-monolith-architecture.md#63-realtime-module">§6.3 Realtime Module</a>
 */
@Component
public class CityBroadcaster {

    private static final Logger log = LoggerFactory.getLogger(CityBroadcaster.class);

    /** STOMP destination — live incremental mutation stream. */
    static final String TOPIC_MUTATIONS = "/topic/city/mutations";

    private final SimpMessagingTemplate messagingTemplate;

    public CityBroadcaster(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * Receives a {@link CityMutationEvent} and broadcasts each contained mutation to
     * {@code /topic/city/mutations}.
     *
     * <p>Called on the same thread that published the event (Spring's synchronous
     * event dispatch), so this method must return quickly to avoid blocking the
     * city-state processing pipeline.
     *
     * @param event the mutation event produced by {@code CityStateService}
     */
    @EventListener
    public void onCityMutation(CityMutationEvent event) {
        int count = event.getMutations().size();
        log.debug("Broadcasting {} mutation(s) published at {}", count, event.getPublishedAt());

        for (var mutation : event.getMutations()) {
            CityMutationMessage message = CityMutationMessage.from(mutation);
            messagingTemplate.convertAndSend(TOPIC_MUTATIONS, message);
            log.debug("Broadcasted mutation: type={} repo={} actor={}",
                    message.type(), message.repoSlug(), message.actorDisplayName());
        }
    }
}
