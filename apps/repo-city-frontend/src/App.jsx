import React, { useRef, useCallback, useState, useEffect } from 'react';
import { CityCanvas } from './components/CityCanvas.jsx';
import { HUD }        from './components/HUD.jsx';
import { MRPanel }    from './components/MRPanel.jsx';
import { DevPanel }   from './components/DevPanel.jsx';
import { SimPanel }   from './components/SimPanel.jsx';
import { LeaderboardPanel } from './components/LeaderboardPanel.jsx';
import { Toast }        from './components/Toast.jsx';
import { ActivityFeed } from './components/ActivityFeed.jsx';
import { useWebSocket }  from './hooks/useWebSocket.js';
import { useCityState }  from './hooks/useCityState.js';

/**
 * App — root component.
 *
 * Architecture:
 *  - sceneRef holds imperative handles to 3D managers (no React state for 3D)
 *  - useCityState holds HUD/panel data (minimal React re-renders)
 *  - useWebSocket pipes snapshot → applySnapshot and mutations → applyMutation + 3D effects
 */
export default function App() {
  const sceneRef           = useRef(null);  // { sceneMgr, buildingMgr, effectsMgr, developerMgr }
  const toastRef           = useRef(null);  // addToast function from Toast component
  const activityFeedRef    = useRef(null);  // { push, complete } from ActivityFeed
  const snapshotApplied    = useRef(false); // true once the first snapshot has been applied

  const [showMR,  setShowMR]  = useState(false);
  const [showDev, setShowDev] = useState(false);
  const [showSim, setShowSim] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isNightMode, setIsNightMode] = useState(false);
  const [workers, setWorkers] = useState([]);
  // slug → gitlabMrListUrl (populated on mount from /api/repos)
  const [mrListUrls, setMrListUrls] = useState({});

  useEffect(() => {
    fetch('/api/workers', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
      .then(setWorkers);

    fetch('/api/repos', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
      .then(repos => {
        const map = {};
        repos.forEach(r => { if (r.gitlabMrListUrl) map[r.slug] = r.gitlabMrListUrl; });
        setMrListUrls(map);
      });
  }, []);

  // Option+S (macOS) / Alt+S (Windows/Linux) toggles the simulation panel.
  // On macOS, Option+S produces the 'ß' character, so we check both.
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey && (e.key === 's' || e.key === 'S' || e.key === 'ß')) {
        e.preventDefault();
        setShowSim(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { stats, mrMap, devActivity, applySnapshot, applyMutation } = useCityState(workers);

  // Applies a snapshot to both React state and the 3D scene.
  const _applySnapshotToScene = useCallback(snapshot => {
    applySnapshot(snapshot);
    if (sceneRef.current?.buildingMgr && snapshot.districts) {
      snapshot.districts.forEach(d => {
        if (d.buildingFloors) {
          sceneRef.current.buildingMgr.setFloors(d.repoSlug, d.buildingFloors);
        }
      });
    }
  }, [applySnapshot]);

  // Applies a single mutation to both React state and the 3D scene.
  const _applyMutationToScene = useCallback(mutation => {
    applyMutation(mutation);
    sceneRef.current?.effectsMgr?.trigger(mutation);
    if (mutation.newBuildingFloors && mutation.repoSlug) {
      sceneRef.current?.buildingMgr?.setFloors(mutation.repoSlug, mutation.newBuildingFloors);
    }
  }, [applyMutation]);

  // Handle snapshot — always apply the first snapshot as the true baseline.
  // Any subsequent snapshots (broadcast when another client connects) are
  // ignored because we already have live incremental state.
  const handleSnapshot = useCallback(snapshot => {
    if (snapshotApplied.current) {
      console.debug('[App] Ignoring mid-session snapshot (already have baseline)');
      return;
    }
    snapshotApplied.current = true;
    _applySnapshotToScene(snapshot);
  }, [_applySnapshotToScene]);

  // Handle mutation — apply immediately, always.
  // Mutations may arrive before the snapshot (race condition on connect).
  // That is fine — they increment from zero until the snapshot arrives and
  // sets the correct baseline. Once the snapshot arrives it won't override
  // accumulated mutations because snapshotApplied is checked above.
  const handleMutation = useCallback(mutation => {
    _applyMutationToScene(mutation);
  }, [_applyMutationToScene]);

  useWebSocket({ onSnapshot: handleSnapshot, onMutation: handleMutation });

  // Toast callback — called from EffectsManager inside the canvas
  const handleToast = useCallback((message, type) => {
    toastRef.current?.(message, type);
  }, []);

  // ActivityFeed callback — called from EffectsManager
  const handleActivity = useCallback((action, data) => {
    activityFeedRef.current?.[action]?.(data);
  }, []);

  // Day/Night toggle callback
  // TODO: In future, this should be automatically triggered via WebSocket based on server time
  // Server time logic: 7AM-6PM = day (false), 6PM-7AM = night (true)
  const handleToggleDayNight = useCallback(() => {
    setIsNightMode(prev => {
      const newMode = !prev;
      sceneRef.current?.sceneMgr?.setDayNightMode(newMode);
      sceneRef.current?.developerMgr?.setNightMode(newMode);
      return newMode;
    });
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Full-screen Three.js canvas */}
      <CityCanvas sceneRef={sceneRef} onToast={handleToast} onActivity={handleActivity} />

      {/* Day / Night toggle — top-center */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <button
          onClick={handleToggleDayNight}
          aria-label={isNightMode ? 'Switch to day mode' : 'Switch to night mode'}
          title={isNightMode ? 'Day mode' : 'Night mode'}
          style={{
            background: 'rgba(0,0,0,0.45)',
            color: '#fff',
            border: 'none',
            borderRadius: 20,
            padding: '6px 12px',
            fontSize: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 2px 6px rgba(0,0,0,0.4)'
          }}
        >
          <span style={{ fontSize: 16 }}>{isNightMode ? '🌙' : '☀️'}</span>
          <span style={{ opacity: 0.95 }}>{isNightMode ? 'Night' : 'Day'}</span>
        </button>
      </div>

      {/* HUD — top-left */}
      <HUD
        stats={stats}
        onOpenMRPanel={() => setShowMR(true)}
        onOpenDevPanel={() => setShowDev(true)}
        onOpenLeaderboardPanel={() => setShowLeaderboard(true)}
      />

      {/* Overlay panels */}
      {showMR  && <MRPanel  mrMap={mrMap} mrListUrls={mrListUrls} onClose={() => setShowMR(false)} />}
      {showDev && (
        <DevPanel 
          workers={workers} 
          devActivity={devActivity} 
          onClose={() => setShowDev(false)}
        />
      )}
      {showLeaderboard && <LeaderboardPanel onClose={() => setShowLeaderboard(false)} />}

      {/* Simulation panel — toggle with Alt+S */}
      {showSim && (
        <SimPanel 
          onClose={() => setShowSim(false)}
          onToggleDayNight={handleToggleDayNight}
          isNightMode={isNightMode}
        />
      )}

      {/* Activity Feed — terminal-style event log, top-right */}
      <ActivityFeed feedRef={activityFeedRef} />

      {/* Toast notifications — bottom-center */}
      <Toast toastRef={toastRef} />
    </div>
  );
}
