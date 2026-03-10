package com.repocity.citystate.model;

import lombok.Getter;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks activity counters for a single developer.
 *
 * <p>These counters accumulate over the lifetime of the application
 * and are persisted in snapshots to survive restarts.
 */
@Getter
public class DeveloperActivity {

    /** Total commits by this developer. */
    private int commits;

    /** Total MRs opened by this developer. */
    private int mrsOpened;

    /** Total MRs merged by this developer. */
    private int mrsMerged;

    /** Total pipelines (passed + failed) by this developer. */
    private int pipelines;

    /** Per-repository breakdown of activity. */
    private final Map<String, RepoActivity> byRepo = new ConcurrentHashMap<>();

    // ── Mutation API ───────────────────────────────────────────────────────────

    public void incrementCommits(String repoSlug) {
        commits++;
        getOrCreateRepoActivity(repoSlug).incrementCommits();
    }

    public void incrementMrsOpened(String repoSlug) {
        mrsOpened++;
        getOrCreateRepoActivity(repoSlug).incrementMrsOpened();
    }

    public void incrementMrsMerged(String repoSlug) {
        mrsMerged++;
        getOrCreateRepoActivity(repoSlug).incrementMrsMerged();
    }

    public void incrementPipelines(String repoSlug) {
        pipelines++;
        getOrCreateRepoActivity(repoSlug).incrementPipelines();
    }

    /**
     * Restores activity counters from a previously persisted snapshot.
     *
     * <p>Called exclusively by {@link com.repocity.citystate.CityStateService}
     * during bootstrap.
     *
     * @param commits     persisted commit count
     * @param mrsOpened   persisted MRs opened count
     * @param mrsMerged   persisted MRs merged count
     * @param pipelines   persisted pipeline count
     * @param byRepo      persisted per-repo breakdown
     */
    public void restore(int commits, int mrsOpened, int mrsMerged, int pipelines,
                       Map<String, RepoActivity> byRepo) {
        this.commits    = commits;
        this.mrsOpened  = mrsOpened;
        this.mrsMerged  = mrsMerged;
        this.pipelines  = pipelines;
        this.byRepo.clear();
        if (byRepo != null) {
            this.byRepo.putAll(byRepo);
        }
    }

    private RepoActivity getOrCreateRepoActivity(String repoSlug) {
        return byRepo.computeIfAbsent(repoSlug, k -> new RepoActivity());
    }

    // ── Nested class for per-repo breakdown ───────────────────────────────────

    /**
     * Activity counters for a single repository.
     */
    @Getter
    public static class RepoActivity {
        private int commits;
        private int mrsOpened;
        private int mrsMerged;
        private int pipelines;

        public void incrementCommits()   { commits++;   }
        public void incrementMrsOpened() { mrsOpened++; }
        public void incrementMrsMerged() { mrsMerged++; }
        public void incrementPipelines() { pipelines++; }
    }
}
