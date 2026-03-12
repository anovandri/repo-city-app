package com.repocity.citystate.event;

/**
 * Phase 5: Application event published by CityStateService during bootstrap
 * when an immediate poll is required (no snapshot or stale snapshot).
 *
 * <p>This event-based approach eliminates the circular dependency between
 * CityStateService and PollerService. The poller listens for this event
 * and executes {@code performImmediatePoll()} without direct coupling.
 *
 * <p><strong>Publisher:</strong> CityStateService.bootstrap()
 * <br><strong>Listener:</strong> PollerService.onImmediatePollRequested()
 */
public class ImmediatePollRequested {

    private final String reason;

    /**
     * Constructs an immediate poll request event.
     *
     * @param reason Human-readable explanation of why the poll was requested
     *               (e.g., "No snapshot found", "Snapshot stale (15 minutes)")
     */
    public ImmediatePollRequested(String reason) {
        this.reason = reason;
    }

    /**
     * Returns the reason why an immediate poll was requested.
     *
     * @return Human-readable reason string
     */
    public String getReason() {
        return reason;
    }

    @Override
    public String toString() {
        return "ImmediatePollRequested{reason='" + reason + "'}";
    }
}
