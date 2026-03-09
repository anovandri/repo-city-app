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
 */
export const CityCanvas = React.memo(function CityCanvas({ sceneRef, onToast }) {
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
      const effectsMgr   = new EffectsManager(sceneMgr.scene, buildingMgr, onToast, developerMgr);
      const labelMgr     = new LabelManager(sceneMgr.scene);

      // Expose imperative API to App
      if (sceneRef) {
        sceneRef.current = { buildingMgr, effectsMgr, developerMgr };
      }

      // ── Animation loop ──────────────────────────────────────────────
      const animate = () => {
        rafRef.current = requestAnimationFrame(animate);
        const delta = clockRef.current.getDelta();
        developerMgr.update(delta);
        effectsMgr.update(delta);
        sceneMgr.render();
      };
      clockRef.current.start();
      animate();

      // Store cleanup so the return fn can reach it even after async resolution
      canvas._cleanup = () => {
        cancelAnimationFrame(rafRef.current);
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
