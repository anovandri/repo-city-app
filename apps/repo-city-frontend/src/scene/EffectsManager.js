import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { REPOS } from '../constants/repos.js';

/**
 * AnimationHint values from the backend CityMutationMessage.
 */
export const HINT = {
  COMMIT_BEAM:    'COMMIT_BEAM',
  MR_BEAM:        'MR_BEAM',
  MERGE_SUCCESS:  'MERGE_SUCCESS',
  PIPELINE_BEAM:  'PIPELINE_BEAM',
};

const BEAM_COLORS = {
  [HINT.COMMIT_BEAM]:   0x44ddff,
  [HINT.MR_BEAM]:       0xcc44ff,
  [HINT.MERGE_SUCCESS]: 0x66ff88,
  [HINT.PIPELINE_BEAM]: 0x66ddff,
};

const EVENT_ICONS = {
  [HINT.COMMIT_BEAM]:   '🔨',
  [HINT.MR_BEAM]:       '🔀',
  [HINT.MERGE_SUCCESS]: '✅',
  [HINT.PIPELINE_BEAM]: '⚙️',
};

const EFFECT_DURATION = {
  [HINT.COMMIT_BEAM]:   7.0,
  [HINT.MR_BEAM]:       8.5,
  [HINT.MERGE_SUCCESS]: 4.0,
  [HINT.PIPELINE_BEAM]: 5.0,
};

/**
 * EffectsManager — spawns transient visual effects for each city mutation.
 *
 * Resource optimization:
 *  - Effects are pooled in a fixed-size array; old effects auto-expire
 *  - Geometries and materials are created per effect then disposed on expiry
 *  - At most MAX_ACTIVE effects live simultaneously
 */
export class EffectsManager {
  static MAX_ACTIVE = 24;

  /**
   * @param {THREE.Scene} scene
   * @param {import('./BuildingManager').BuildingManager} buildingManager
   * @param {(msg: string, type: string) => void} onToast
   */
  constructor(scene, buildingManager, onToast) {
    this._scene          = scene;
    this._buildingMgr    = buildingManager;
    this._onToast        = onToast;
    this._activeEffects  = [];
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Trigger a visual effect for a CityMutationMessage.
   * @param {{ type: string, repoSlug: string, actorDisplayName: string,
   *           animationHint: string, repoIcon: string }} mutation
   */
  trigger(mutation) {
    const hint   = mutation.animationHint || mutation.type;
    const repo   = REPOS.find(r => r.name === mutation.repoSlug);
    if (!repo) return;

    const top    = this._buildingMgr.getBuildingTop(repo.id);
    const color  = BEAM_COLORS[hint]     ?? 0xffffff;
    const icon   = EVENT_ICONS[hint]     ?? '⚡';
    const dur    = EFFECT_DURATION[hint] ?? 5.0;

    // Evict oldest if at capacity
    if (this._activeEffects.length >= EffectsManager.MAX_ACTIVE) {
      const oldest = this._activeEffects.shift();
      this._disposeEffect(oldest);
    }

    const effect = { age: 0, duration: dur, meshes: [], lights: [], labels: [] };

    // Vertical beam
    const beamGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 6, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.copy(top);
    beam.position.y += 0.5;
    this._scene.add(beam);
    effect.meshes.push({ mesh: beam, mat: beamMat, role: 'beam' });

    // Point light at building top
    const light = new THREE.PointLight(color, 0, 18);
    light.position.copy(top);
    this._scene.add(light);
    effect.lights.push(light);

    // Floating icon label
    const div = document.createElement('div');
    div.className = 'event-indicator';
    div.classList.add(`event-${hint.toLowerCase().replace('_beam', '').replace('_success', '')}`);
    div.textContent = icon;
    const label = new CSS2DObject(div);
    label.position.copy(top);
    label.position.y += 3;
    this._scene.add(label);
    effect.labels.push({ label, div });

    // Merge burst sphere
    if (hint === HINT.MERGE_SUCCESS) {
      const burstGeo = new THREE.SphereGeometry(0.8, 8, 6);
      const burstMat = new THREE.MeshBasicMaterial({
        color: 0x66ff88, transparent: true, opacity: 0.6, wireframe: true,
      });
      const burst = new THREE.Mesh(burstGeo, burstMat);
      burst.position.copy(top);
      this._scene.add(burst);
      effect.meshes.push({ mesh: burst, mat: burstMat, role: 'burst' });
    }

    // Glow 4 windows
    const windows = this._buildingMgr.getWindows(repo.id);
    windows.slice(0, 4).forEach(w => {
      if (w.material) {
        w.material = new THREE.MeshBasicMaterial({
          color, emissive: color, emissiveIntensity: 1,
        });
        effect.meshes.push({ mesh: w, mat: w.material, role: 'window', origMat: w.material });
      }
    });

    // Toast notification
    const actorName = mutation.actorDisplayName ?? 'Someone';
    const messages = {
      [HINT.COMMIT_BEAM]:   `${icon} ${actorName} committed to ${repo.icon} ${repo.id}`,
      [HINT.MR_BEAM]:       `${icon} ${actorName} opened MR on ${repo.icon} ${repo.id}`,
      [HINT.MERGE_SUCCESS]: `${icon} ${actorName} merged to ${repo.icon} ${repo.id}`,
      [HINT.PIPELINE_BEAM]: `${icon} Pipeline ${mutation.type === 'PIPELINE_FAILED' ? 'failed' : 'passed'} on ${repo.icon} ${repo.id}`,
    };
    this._onToast?.(messages[hint] ?? `${icon} Activity on ${repo.id}`, hint);

    this._activeEffects.push(effect);
  }

  /**
   * Update all active effects. Call once per animation frame.
   * @param {number} delta  seconds since last frame
   */
  update(delta) {
    const expired = [];
    this._activeEffects.forEach(eff => {
      eff.age += delta;
      const t  = eff.age / eff.duration;  // 0 → 1
      const fade = Math.max(0, 1 - t);

      eff.lights.forEach(l => {
        // Ramp up to peak at t=0.2, then fade
        l.intensity = t < 0.2
          ? (t / 0.2) * 3.5
          : fade * 3.5;
      });

      eff.meshes.forEach(({ mat, role }) => {
        if (role === 'beam') {
          mat.opacity = fade * 0.85;
        } else if (role === 'burst') {
          mat.opacity = fade * 0.6;
        }
      });

      // Scale burst sphere outward
      const burst = eff.meshes.find(m => m.role === 'burst');
      if (burst) {
        const s = 1 + t * 5;
        burst.mesh.scale.setScalar(s);
      }

      // Scale beam height
      const beam = eff.meshes.find(m => m.role === 'beam');
      if (beam) {
        beam.mesh.scale.y = 1 + t * 20;
        beam.mesh.position.y += delta * 4;
      }

      if (eff.age >= eff.duration) {
        expired.push(eff);
      }
    });

    expired.forEach(eff => {
      this._activeEffects.splice(this._activeEffects.indexOf(eff), 1);
      this._disposeEffect(eff);
    });
  }

  dispose() {
    this._activeEffects.forEach(eff => this._disposeEffect(eff));
    this._activeEffects = [];
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  _disposeEffect(eff) {
    eff.meshes.forEach(({ mesh, mat, role }) => {
      if (role !== 'window') {
        this._scene.remove(mesh);
        mesh.geometry?.dispose();
        mat?.dispose();
      }
    });
    eff.lights.forEach(l => {
      this._scene.remove(l);
    });
    eff.labels.forEach(({ label }) => {
      this._scene.remove(label);
    });
  }
}
