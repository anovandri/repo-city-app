package com.repocity.citystate.event;

import lombok.Getter;
import lombok.ToString;

import java.time.Instant;
import java.util.List;

/**
 * Published by {@link com.repocity.citystate.CityStateService} after processing a
 * {@link PollCycleCompleted} event.
 *
 * <p>The {@code realtime} module listens for this event via {@code CityBroadcaster}
 * and broadcasts each {@link CityMutation} to subscribed browser clients over STOMP.
 */
@Getter
@ToString
public class CityMutationEvent {

    /** All mutations produced from one poll cycle, in processing order. */
    private final List<CityMutation> mutations;

    /** Wall-clock time this event was published. */
    private final Instant publishedAt;

    public CityMutationEvent(List<CityMutation> mutations) {
        this.mutations   = List.copyOf(mutations);
        this.publishedAt = Instant.now();
    }
}
