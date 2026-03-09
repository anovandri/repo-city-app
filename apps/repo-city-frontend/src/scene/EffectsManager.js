import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/**
 * AnimationHint values — must match CityMutation.AnimationHint enum on the backend.
 */
export const HINT = {
  COMMIT_BEAM:      'COMMIT_BEAM',
  MR_OPENED_BEAM:   'MR_OPENED_BEAM',
  MERGE_SUCCESS:    'MERGE_SUCCESS',
  PIPELINE_RUNNING: 'PIPELINE_RUNNING',
  PIPELINE_SUCCESS: 'PIPELINE_SUCCESS',
  PIPELINE_FAILED:  'PIPELINE_FAILED',
};

const BEAM_COLORS = {
  [HINT.COMMIT_BEAM]:      0x44ddff,
  [HINT.MR_OPENED_BEAM]:   0xcc44ff,
  [HINT.MERGE_SUCCESS]:    0x66ff88,
  [HINT.PIPELINE_RUNNING]: 0x66ddff,
  [HINT.PIPELINE_SUCCESS]: 0x44ffaa,
  [HINT.PIPELINE_FAILED]:  0xff4444,
};

const EVENT_ICONS = {
  [HINT.COMMIT_BEAM]:      '🔨',
  [HINT.MR_OPENED_BEAM]:   '🔀',
  [HINT.MERGE_SUCCESS]:    '✅',
  [HINT.PIPELINE_RUNNING]: '⚙️',
  [HINT.PIPELINE_SUCCESS]: '🟢',
  [HINT.PIPELINE_FAILED]:  '🔴',
};

const EFFECT_DURATION = {
  [HINT.COMMIT_BEAM]:      7.0,
  [HINT.MR_OPENED_BEAM]:   8.5,
  [HINT.MERGE_SUCCESS]:    4.0,
  [HINT.PIPELINE_RUNNING]: 5.0,
  [HINT.PIPELINE_SUCCESS]: 4.0,
  [HINT.PIPELINE_FAILED]:  6.0,
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
   * @param {import('./DeveloperManager').DeveloperManager} [developerManager]
   * @param {(action: string, data: any) => void} [onActivity]
   */
  constructor(scene, buildingManager, onToast, developerManager, onActivity) {
    this._scene          = scene;
    this._buildingMgr    = buildingManager;
    this._onToast        = onToast;
    this._developerMgr   = developerManager ?? null;
    this._onActivity     = onActivity ?? null;
    this._activeEffects  = [];
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Trigger a visual effect for a CityMutationMessage.
   * Phase 1 (immediate): a floating icon appears above the building.
   * Phase 2 (on arrival): icon is removed, beam + light fire — exactly like the prototype.
   * @param {{ type: string, repoSlug: string, actorDisplayName: string,
   *           actorGitlabUsername: string|null,
   *           animationHint: string, repoIcon: string }} mutation
   */
  trigger(mutation) {
    const hint = mutation.animationHint || mutation.type;
    const top  = this._buildingMgr.getBuildingTop(mutation.repoSlug);
    if (!top) return;

    const color = BEAM_COLORS[hint]     ?? 0xffffff;
    const icon  = EVENT_ICONS[hint]     ?? '⚡';
    const dur   = EFFECT_DURATION[hint] ?? 5.0;

    // Build the toast message now (before any async delay)
    // null actorGitlabUsername (pipeline/bot) → dispatch picks a random dev
    const actorUsername = mutation.actorGitlabUsername || null;
    const actorLabel    = mutation.actorDisplayName || 'Pipeline';
    const repoIcon  = mutation.repoIcon ?? '🏢';
    const repoSlug  = mutation.repoSlug ?? '';
    const messages = {
      [HINT.COMMIT_BEAM]:      `${icon} ${actorLabel} committed to ${repoIcon} ${repoSlug}`,
      [HINT.MR_OPENED_BEAM]:   `${icon} ${actorLabel} opened MR on ${repoIcon} ${repoSlug}`,
      [HINT.MERGE_SUCCESS]:    `${icon} ${actorLabel} merged to ${repoIcon} ${repoSlug}`,
      [HINT.PIPELINE_RUNNING]: `${icon} Pipeline running on ${repoIcon} ${repoSlug}`,
      [HINT.PIPELINE_SUCCESS]: `${icon} Pipeline passed on ${repoIcon} ${repoSlug}`,
      [HINT.PIPELINE_FAILED]:  `${icon} Pipeline FAILED on ${repoIcon} ${repoSlug}`,
    };
    const toastMsg = messages[hint] ?? `${icon} Activity on ${repoSlug}`;

    // ── Activity Feed — Phase 1: push entry immediately ──────────────────
    const feedId = (Date.now() * 1000 + Math.trunc(Math.random() * 1000));
    this._onActivity?.('push', {
      id: feedId,
      actorDisplayName: actorLabel,
      hint,
      repoSlug,
      repoIcon,
    });

    // ── Phase 1: Show waiting icon above the building immediately ────────
    const waitDiv = document.createElement('div');
    waitDiv.className = 'event-indicator';
    waitDiv.classList.add(`event-${hint.toLowerCase().replace(/_beam$/, '').replace(/_success$/, '')}`);
    waitDiv.textContent = icon;
    const waitLabel = new CSS2DObject(waitDiv);
    waitLabel.position.set(top.x, top.y + 3, top.z);
    this._scene.add(waitLabel);

    // ── Phase 2: On arrival — remove waiting icon, fire beam + light ─────
    const fireBeam = () => {
      this._scene.remove(waitLabel);
      // Activity Feed — Phase 2: mark entry as complete (beam fired)
      this._onActivity?.('complete', feedId);
      this._spawnBeamEffect(mutation, top, color, icon, dur, toastMsg);
    };

    if (this._developerMgr) {
      this._developerMgr.dispatch(actorUsername, repoSlug, fireBeam);
    } else {
      // No developer manager — fire immediately (fallback)
      fireBeam();
    }
  }

  // ── Internal: spawn the beam + light + label + toast ────────────────────

  _spawnBeamEffect(mutation, top, color, icon, dur, toastMsg) {
    const hint = mutation.animationHint || mutation.type;

    // Evict oldest if at capacity
    if (this._activeEffects.length >= EffectsManager.MAX_ACTIVE) {
      const oldest = this._activeEffects.shift();
      this._disposeEffect(oldest);
    }

    const effect = { age: 0, duration: dur, meshes: [], lights: [], labels: [] };

    // ── Vertical light beam ──────────────────────────────────────────────
    // Tall tapered cone (narrow top, wide base) rising from the rooftop.
    // AdditiveBlending makes it glow brightly without darkening surroundings.
    const BEAM_H  = 100;
    const beamGeo = new THREE.CylinderGeometry(0.3, 2.5, BEAM_H, 10, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity:     0,           // fades in via update()
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
      side:        THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(top.x, top.y + BEAM_H / 2, top.z);
    beam.renderOrder = 1;
    this._scene.add(beam);
    effect.meshes.push({ mesh: beam, mat: beamMat, role: 'beam' });

    // Point light at building top — visible citywide
    const light = new THREE.PointLight(color, 0, 28, 1.4);
    light.position.copy(top);
    this._scene.add(light);
    effect.lights.push(light);

    // Floating icon label anchored above building (shown while beam is active)
    const div = document.createElement('div');
    div.className = 'event-indicator';
    div.classList.add(`event-${hint.toLowerCase().replace(/_beam$/, '').replace(/_success$/, '')}`);
    div.textContent = icon;
    const label = new CSS2DObject(div);
    label.position.copy(top);
    label.position.y += 3;
    this._scene.add(label);
    effect.labels.push({ label, div });

    // Merge burst sphere — expands outward from the rooftop
    if (hint === HINT.MERGE_SUCCESS) {
      const burstGeo = new THREE.SphereGeometry(2.0, 10, 8);
      const burstMat = new THREE.MeshBasicMaterial({
        color: 0x66ff88, transparent: true, opacity: 0.5,
        depthWrite: false, blending: THREE.AdditiveBlending, wireframe: true,
      });
      const burst = new THREE.Mesh(burstGeo, burstMat);
      burst.position.copy(top);
      this._scene.add(burst);
      effect.meshes.push({ mesh: burst, mat: burstMat, role: 'burst' });
    }

    // Glow windows
    const windows = this._buildingMgr.getWindows(mutation.repoSlug);
    windows.slice(0, 4).forEach(w => {
      if (w.material) {
        w.material = new THREE.MeshBasicMaterial({
          color, emissive: color, emissiveIntensity: 1,
        });
        effect.meshes.push({ mesh: w, mat: w.material, role: 'window', origMat: w.material });
      }
    });

    // Toast notification
    this._onToast?.(toastMsg, hint);

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
          // Fade in quickly (first 15% of duration), then hold, then fade out
          const beamOpacity = t < 0.15
            ? (t / 0.15) * 0.72
            : fade * 0.72;
          mat.opacity = beamOpacity;
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
