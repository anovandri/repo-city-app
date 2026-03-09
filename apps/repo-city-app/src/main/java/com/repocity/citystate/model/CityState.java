package com.repocity.citystate.model;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Root in-memory city state object.
 *
 * <p>Held as a singleton by {@link com.repocity.citystate.CityStateService}.
 * All mutations go through {@code CityStateService} which holds a lock before
 * delegating to the individual {@link DistrictState} and {@link WorkerState} objects.
 *
 * <p>Maps are keyed by {@code repoSlug} and {@code developerDisplayName} respectively,
 * matching the prototype's {@code STRUCTURES[].repo} and {@code PEOPLE[].name} arrays.
 */
public class CityState {

    /** One entry per repository, keyed by repo slug. */
    private final Map<String, DistrictState> districts = new ConcurrentHashMap<>();

    /** One entry per developer, keyed by display name. */
    private final Map<String, WorkerState> workers = new ConcurrentHashMap<>();

    /** Ring buffer of the last {@value #RECENT_EVENTS_CAPACITY} mutations for the activity feed. */
    private static final int RECENT_EVENTS_CAPACITY = 50;
    private final Deque<String> recentEventSummaries = new ArrayDeque<>(RECENT_EVENTS_CAPACITY + 1);

    // Aggregate stats
    private int totalCommits;
    private int totalMrsMerged;
    private Instant lastUpdatedAt = Instant.EPOCH;

    // ── Mutation API (called by CityStateService) ──────────────────────────────

    public void putDistrict(DistrictState d) {
        districts.put(d.getRepoSlug(), d);
    }

    public void putWorker(WorkerState w) {
        workers.put(w.getDisplayName(), w);
    }

    public void recordCommit() {
        totalCommits++;
        lastUpdatedAt = Instant.now();
    }

    public void recordMerge() {
        totalMrsMerged++;
        lastUpdatedAt = Instant.now();
    }

    /**
     * Adds a human-readable summary to the recent-events ring buffer.
     * Oldest entries are discarded when the buffer is full.
     */
    public void pushRecentEvent(String summary) {
        recentEventSummaries.addFirst(summary);
        while (recentEventSummaries.size() > RECENT_EVENTS_CAPACITY) {
            recentEventSummaries.removeLast();
        }
    }

    // ── Read API ───────────────────────────────────────────────────────────────

    public Map<String, DistrictState> getDistricts() { return districts; }
    public Map<String, WorkerState>   getWorkers()   { return workers;   }

    public List<String> getRecentEventSummaries() {
        return List.copyOf(recentEventSummaries);
    }

    public int     getTotalCommits()       { return totalCommits;         }
    public int     getTotalMrsMerged()     { return totalMrsMerged;       }
    public int     getActiveDeveloperCount(){ return workers.size();      }
    public Instant getLastUpdatedAt()      { return lastUpdatedAt;        }
}
