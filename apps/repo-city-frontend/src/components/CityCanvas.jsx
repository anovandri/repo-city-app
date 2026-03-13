import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { SceneManager }    from '../scene/SceneManager.js';
import { BuildingManager } from '../scene/BuildingManager.js';
import { DeveloperManager }from '../scene/DeveloperManager.js';
import { EffectsManager }  from '../scene/EffectsManager.js';
import { LabelManager }    from '../scene/LabelManager.js';

/**
 * CityCanvas — the full-screen Three.js canvas.
 *
 * Owns the animation loop and all scene managers.
 * Exposes imperative handles via sceneRef so App can route
 * WebSocket events directly to managers (no React re-render for 3D).
 *
 * Props:
 *   sceneRef   — ref filled with { buildingMgr, effectsMgr, developerMgr }
 *   onToast    — (message, type) => void
 *   onActivity — (action, data) => void  (for ActivityFeed)
 */
export const CityCanvas = React.memo(function CityCanvas({ sceneRef, onToast, onActivity }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const clockRef  = useRef(new THREE.Clock());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;  // guard against StrictMode double-invoke

    // ── Fetch repos + workers from REST API, then build scene ──────────
    Promise.all([
      fetch('/api/repos',    { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/workers',  { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([apiRepos, apiWorkers]) => {
      if (cancelled) return;  // stale effect — SceneManager never created, nothing to clean up

      // Build scene only for the surviving mount
      const sceneMgr     = new SceneManager(canvas);
      const buildingMgr  = new BuildingManager(sceneMgr.scene, apiRepos);
      const developerMgr = new DeveloperManager(sceneMgr.scene, apiWorkers);
      developerMgr.setBuildingManager(buildingMgr);
      developerMgr.setCamera(sceneMgr.camera); // Performance: Phase 5 - Enable frustum culling
      const effectsMgr   = new EffectsManager(sceneMgr.scene, buildingMgr, onToast, developerMgr, onActivity);
      const labelMgr     = new LabelManager(sceneMgr.scene);

      // Expose imperative API to App
      if (sceneRef) {
        sceneRef.current = { sceneMgr, buildingMgr, effectsMgr, developerMgr };
      }

      // ── Animation loop ──────────────────────────────────────────────
      const animate = () => {
        rafRef.current = requestAnimationFrame(animate);
        // Clamp delta to prevent teleportation when tab is inactive
        let delta = clockRef.current.getDelta();
        delta = Math.min(delta, 0.1); // Cap at 100ms to prevent large jumps
        sceneMgr.update(delta);   // Update scene animations (fountain, etc.)
        developerMgr.update(delta);
        effectsMgr.update(delta);
        sceneMgr.render();
      };
      
      // Handle tab visibility changes
      const handleVisibilityChange = () => {
        if (document.hidden) {
          clockRef.current.stop();
        } else {
          clockRef.current.start();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      clockRef.current.start();
      animate();

      // Store cleanup so the return fn can reach it even after async resolution
      canvas._cleanup = () => {
        cancelAnimationFrame(rafRef.current);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        labelMgr.dispose();
        effectsMgr.dispose();
        developerMgr.dispose();
        buildingMgr.dispose();
        sceneMgr.dispose();
        if (sceneRef) sceneRef.current = null;
      };
    });

    // ── Cleanup ────────────────────────────────────────────────────────
    return () => {
      cancelled = true;
      canvas._cleanup?.();
      canvas._cleanup = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  );
});
