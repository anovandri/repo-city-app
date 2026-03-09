import { useState, useCallback, useRef } from 'react';
import { REPOS } from '../constants/repos.js';

const INITIAL_STATS = {
  repoCount:            REPOS.length,
  activeDeveloperCount: 0,
  totalCommits:         0,
  openMrCount:          0,
};

const buildEmptyMrMap = () =>
  Object.fromEntries(REPOS.map(r => [r.name, 0]));

const buildEmptyDevActivity = (workers) =>
  Object.fromEntries(
    workers.map(w => [
      w.displayName,
      { commits: 0, mrsOpened: 0, mrsMerged: 0, pipelines: 0, byRepo: {} },
    ])
  );

/**
 * useCityState — React state layer for HUD data only.
 *
 * The 3D scene state lives in SceneManager / BuildingManager — this hook
 * only tracks the data needed by HUD panels (stats, open MRs, dev activity).
 *
 * Resource optimization:
 *  - State is updated with minimal object churn (only changed fields)
 *  - Heavy snapshot hydration is done with a single setState call
 */
export function useCityState(workers = []) {
  const [stats, setStats]             = useState(INITIAL_STATS);
  const [mrMap, setMrMap]             = useState(buildEmptyMrMap);
  const [devActivity, setDevActivity] = useState(() => buildEmptyDevActivity(workers));

  // ref for mutation handler to read latest state without re-render triggers
  const mrMapRef       = useRef(mrMap);
  const devActivityRef = useRef(devActivity);
  mrMapRef.current       = mrMap;
  devActivityRef.current = devActivity;

  /**
   * Hydrate all state from the initial snapshot.
   * @param {import('../types').CitySnapshotMessage} snapshot
   */
  const applySnapshot = useCallback(snapshot => {
    // Compute total open MRs from district list (most accurate source)
    const totalOpenMrs = snapshot.districts?.reduce((s, d) => s + (d.openMrCount ?? 0), 0) ?? 0;

    setStats({
      repoCount:            REPOS.length,
      activeDeveloperCount: snapshot.stats?.activeDeveloperCount ?? 0,
      totalCommits:         snapshot.stats?.totalCommits          ?? 0,
      openMrCount:          snapshot.stats?.openMrCount           ?? totalOpenMrs,
    });

    // MR map — keyed by repoSlug, sourced from districts
    if (snapshot.districts?.length) {
      setMrMap(prev => {
        const next = { ...prev };
        snapshot.districts.forEach(d => {
          if (d.repoSlug) next[d.repoSlug] = d.openMrCount ?? 0;
        });
        return next;
      });
    }
  }, []);

  /**
   * Apply an incremental mutation to HUD state.
   * @param {import('../types').CityMutationMessage} mutation
   */
  const applyMutation = useCallback(mutation => {
    const { type, repoSlug, actorDisplayName, newOpenMrCount } = mutation;

    // Update stats
    setStats(prev => {
      const next = { ...prev };
      if (type === 'COMMIT') {
        next.totalCommits = prev.totalCommits + 1;
      }
      if (newOpenMrCount !== undefined && repoSlug) {
        // Recalculate total open MRs from map after this update
        // We do it in the mrMap update below
      }
      return next;
    });

    // Update per-repo MR count
    if (newOpenMrCount !== undefined && repoSlug) {
      setMrMap(prev => {
        const next = { ...prev, [repoSlug]: newOpenMrCount };
        // Recalculate total open MRs and push into stats
        const total = Object.values(next).reduce((a, v) => a + v, 0);
        setStats(s => ({ ...s, openMrCount: total }));
        return next;
      });
    }

    // Update dev activity
    if (actorDisplayName) {
      // actorDisplayName from the backend matches displayName from /api/workers,
      // which is the key we use in devActivity.
      const key = actorDisplayName;
      setDevActivity(prev => {
        const old = prev[key] ?? { commits: 0, mrsOpened: 0, mrsMerged: 0, pipelines: 0, byRepo: {} };
        const byRepo = { ...old.byRepo };
        if (!byRepo[repoSlug]) byRepo[repoSlug] = { commits: 0, mrsOpened: 0, mrsMerged: 0, pipelines: 0 };
        const entry = { ...byRepo[repoSlug] };

        const updated = { ...old, byRepo };
        switch (type) {
          case 'COMMIT':          updated.commits++;   entry.commits++;   break;
          case 'MR_OPENED':       updated.mrsOpened++; entry.mrsOpened++; break;
          case 'MR_MERGED':       updated.mrsMerged++; entry.mrsMerged++; break;
          case 'PIPELINE_PASSED':
          case 'PIPELINE_FAILED': updated.pipelines++; entry.pipelines++; break;
        }
        byRepo[repoSlug] = entry;
        return { ...prev, [key]: updated };
      });
    }
  }, []);

  return { stats, mrMap, devActivity, applySnapshot, applyMutation };
}
