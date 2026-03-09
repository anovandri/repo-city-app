package com.repocity.realtime;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * Configures STOMP over SockJS for the {@code realtime} module.
 *
 * <h3>Endpoints</h3>
 * <ul>
 *   <li>{@code /ws} — SockJS handshake endpoint; browsers connect here first.</li>
 *   <li>{@code /topic/**} — Simple in-memory broker prefix; server pushes to subscribers.</li>
 *   <li>{@code /app/**} — App-destination prefix; clients send frames here to reach
 *       {@code @MessageMapping} controllers.</li>
 * </ul>
 *
 * <p>No external message broker (Redis, RabbitMQ) is required — everything stays
 * in-process, consistent with the no-network-calls-between-modules architecture constraint.
 *
 * @see <a href="../../../../../../docs/modular-monolith-architecture.md#91-connection">§9.1 Realtime Contract — Connection</a>
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    /**
     * Registers the SockJS endpoint that browsers use for the initial HTTP upgrade.
     *
     * <p>SockJS fallback is enabled so the connection works in browsers that do not
     * support native WebSocket (e.g. corporate proxies that strip {@code Upgrade} headers).
     *
     * <p>{@code setAllowedOriginPatterns("*")} allows all origins during development;
     * tighten this in production.
     */
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*")
                .withSockJS();
    }

    /**
     * Configures the in-memory simple message broker.
     *
     * <ul>
     *   <li>{@code /topic} — broker destinations; the server broadcasts to these.</li>
     *   <li>{@code /app} — application destination prefix; messages routed to
     *       {@code @MessageMapping} methods.</li>
     * </ul>
     */
    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }
}
