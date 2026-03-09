import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/**
 * LabelManager — adds persistent CSS2D labels to the scene:
 *   - District area labels
 *
 * Developer name labels are handled inside DeveloperManager.
 * Building name labels are handled inside BuildingManager.
 * The clan label above the plaza statue is handled inside SceneManager.
 */
export class LabelManager {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this._scene  = scene;
    this._labels = [];

    this._addDistrictLabels();
  }

  dispose() {
    this._labels.forEach(l => this._scene.remove(l));
    this._labels = [];
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  _addDistrictLabels() {
    const districts = [
      { text: '🏙 ms-partner',  x: -40, y: 1.5, z: -10 },
      { text: '🏙 ms-pip',      x:  32, y: 1.5, z: -10 },
      { text: '🔬 standalone',  x:  32, y: 1.5, z:  10  },
    ];
    districts.forEach(({ text, x, y, z }) => {
      const div = document.createElement('div');
      div.className = 'district-label';
      div.textContent = text;
      const label = new CSS2DObject(div);
      label.position.set(x, y, z);
      this._scene.add(label);
      this._labels.push(label);
    });
  }
}
