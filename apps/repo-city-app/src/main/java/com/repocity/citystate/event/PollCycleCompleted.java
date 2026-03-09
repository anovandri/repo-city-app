package com.repocity.citystate.event;

import com.repocity.poller.domain.PollEvent;
import lombok.Getter;
import lombok.ToString;

import java.time.Instant;
import java.util.List;

/**
 * Published by {@link com.repocity.poller.service.EventDispatcher} after each poll cycle
 * completes and new {@link PollEvent} rows have been persisted.
 *
 * <p>The {@code city-state} module listens for this event via
 * {@link com.repocity.citystate.CityStateService} to apply mutation rules and update
 * in-memory city state.
 *
 * <p>Only events that were <em>newly inserted</em> (not deduplicated away) are included,
 * so listeners never need to re-check for duplicates.
 */
@Getter
@ToString
public class PollCycleCompleted {

    /** Events saved in this cycle, in insertion order. Never null; may be empty. */
    private final List<PollEvent> newEvents;

    /** Wall-clock time when the cycle completed. */
    private final Instant completedAt;

    public PollCycleCompleted(List<PollEvent> newEvents) {
        this.newEvents   = List.copyOf(newEvents);
        this.completedAt = Instant.now();
    }
}
