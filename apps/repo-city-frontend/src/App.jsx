import React, { useRef, useCallback, useState, useEffect } from 'react';
import { CityCanvas } from './components/CityCanvas.jsx';
import { HUD }        from './components/HUD.jsx';
import { MRPanel }    from './components/MRPanel.jsx';
import { DevPanel }   from './components/DevPanel.jsx';
import { SimPanel }   from './components/SimPanel.jsx';
import { Toast }      from './components/Toast.jsx';
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
  const sceneRef  = useRef(null);  // { buildingMgr, effectsMgr, developerMgr }
  const toastRef  = useRef(null);  // addToast function from Toast component

  const [showMR,  setShowMR]  = useState(false);
  const [showDev, setShowDev] = useState(false);
  const [showSim, setShowSim] = useState(false);
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

  // Toast callback — called from EffectsManager inside the canvas
  const handleToast = useCallback((message, type) => {
    toastRef.current?.(message, type);
  }, []);

  // Handle snapshot — hydrate React state + building floors
  const handleSnapshot = useCallback(snapshot => {
    applySnapshot(snapshot);
    // Update building heights from snapshot
    if (sceneRef.current?.buildingMgr && snapshot.districts) {
      snapshot.districts.forEach(d => {
        if (d.buildingFloors) {
          sceneRef.current.buildingMgr.setFloors(d.repoSlug, d.buildingFloors);
        }
      });
    }
  }, [applySnapshot]);

  // Handle mutation — update React state + trigger 3D effect
  const handleMutation = useCallback(mutation => {
    applyMutation(mutation);
    // Trigger 3D visual effect (no React re-render)
    sceneRef.current?.effectsMgr?.trigger(mutation);
    // Update building height if floors changed
    if (mutation.newBuildingFloors && mutation.repoSlug) {
      sceneRef.current?.buildingMgr?.setFloors(mutation.repoSlug, mutation.newBuildingFloors);
    }
  }, [applyMutation]);

  useWebSocket({ onSnapshot: handleSnapshot, onMutation: handleMutation });

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Full-screen Three.js canvas */}
      <CityCanvas sceneRef={sceneRef} onToast={handleToast} />

      {/* HUD — top-left */}
      <HUD
        stats={stats}
        onOpenMRPanel={() => setShowMR(true)}
        onOpenDevPanel={() => setShowDev(true)}
      />

      {/* Overlay panels */}
      {showMR  && <MRPanel  mrMap={mrMap} mrListUrls={mrListUrls} onClose={() => setShowMR(false)} />}
      {showDev && <DevPanel workers={workers} devActivity={devActivity} onClose={() => setShowDev(false)} />}

      {/* Simulation panel — toggle with Alt+S */}
      {showSim && <SimPanel onClose={() => setShowSim(false)} />}

      {/* Toast notifications — bottom-center */}
      <Toast toastRef={toastRef} />
    </div>
  );
}
