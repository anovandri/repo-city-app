import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { REPO_BY_ID } from '../constants/repos.js';

const MAT_CACHE = new Map();
function mat(color) {
  if (!MAT_CACHE.has(color)) {
    MAT_CACHE.set(color, new THREE.MeshLambertMaterial({ color }));
  }
  return MAT_CACHE.get(color);
}

/**
 * BuildingManager — creates all 18 repo buildings exactly as in the prototype.
 *
 * Each building is built with the exact geometry (box / cylinder / sphere)
 * and colours taken verbatim from docs/prototype/index.html.
 * A CSS2D label is attached to every building group.
 *
 * The public API (getGroup, getWindows, getBuildingTop, setFloors)
 * is unchanged so EffectsManager continues to work.
 */
export class BuildingManager {
  /**
   * @param {THREE.Scene} scene
   * @param {Array<{slug:string, name:string, icon:string, openMrCount:number, status:string}>} apiRepos
   *   Live repo data from GET /api/repos. Merged with local layout data (positions, geometry).
   *   Falls back to local constants if empty/not provided.
   */
  constructor(scene, apiRepos = []) {
    this._scene     = scene;
    /** @type {Map<string, THREE.Group>} */
    this._buildings = new Map();
    /** @type {Map<string, THREE.Mesh[]>} glow window meshes */
    this._windows   = new Map();
    /** @type {Map<string, number>} current floor count (roof Y ref) */
    this._roofY     = new Map();

    // Build a lookup: repoId → merged repo data (local layout + API overrides)
    // The API uses full slugs (e.g. "ms-partner-administration") as the key,
    // while local REPO_BY_ID uses short ids (e.g. "msp-admin").
    // We match by slug: local repo.name === api slug.
    const apiBySlug = new Map(apiRepos.map(r => [r.slug, r]));
    this._repoMeta = {};
    for (const [id, local] of Object.entries(REPO_BY_ID)) {
      const api = apiBySlug.get(local.name); // local.name is the full slug
      this._repoMeta[id] = {
        ...local,
        icon:   api?.icon   ?? local.icon,
        name:   api?.name   ?? local.name,
        status: api?.status ?? local.status ?? null,
      };
    }

    this._build();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  getGroup(repoName)   { return this._buildings.get(repoName); }
  getWindows(repoName) { return this._windows.get(repoName) ?? []; }
  getFloors(repoName)  { return this._roofY.get(repoName) ?? 0; }

  /**
   * World-space top-centre of a building (for beam + label placement).
   */
  getBuildingTop(repoId) {
    const repo = this._repoMeta[repoId];
    if (!repo) return new THREE.Vector3();
    const y = this._roofY.get(repoId) ?? repo.pos[1];
    return new THREE.Vector3(repo.pos[0], y, repo.pos[2]);
  }

  /** Dynamic floor update — rebuilds the building group. */
  setFloors(repoName, floors) {
    // For prototype parity we simply store the new height without a full rebuild.
    // A full rebuild is expensive for exact per-building geometry.
    this._roofY.set(repoName, floors);
  }

  dispose() {
    MAT_CACHE.forEach(m => m.dispose());
    MAT_CACHE.clear();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  _s(group) { return group; } // shorthand: just returns group for add calls

  _box(g, w, h, d, color, x, y, z, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }
  _cyl(g, rt, rb, h, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 16), mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  }
  _sphere(g, r, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  }
  _plane(g, w, d, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    g.add(m);
    return m;
  }
  _lamp(g, x, z) {
    this._cyl(g, 0.07, 0.09, 3.5, 0x555555, x, 1.75, z);
    this._box(g, 0.6, 0.07, 0.07, 0x555555, x + 0.3, 3.55, z);
    this._sphere(g, 0.18, 0xffffcc, x + 0.6, 3.55, z);
  }
  _tree(g, x, z, h = 1.8, r = 1.1) {
    this._cyl(g, 0.18, 0.22, h, 0x7a5230, x, h / 2, z);
    this._sphere(g, r, 0x2e9e2e, x, h + r * 0.7, z);
  }

  _label(group, repo, roofY) {
    const name = repo.name
      .replace('ms-partner-', '')
      .replace('ms-pip-', '')
      .replace('partner-', '')
      .replace(/-/g, ' ');
    const div = document.createElement('div');
    div.className = 'repo-label';
    if (repo.sunset)  div.classList.add('repo-label--sunset');
    if (repo.support) div.classList.add('repo-label--support');
    div.innerHTML = `<span>${repo.icon}</span>${name}`;
    const obj = new CSS2DObject(div);
    obj.position.set(0, roofY + 2, 0);
    group.add(obj);
  }

  // ── Build all buildings ───────────────────────────────────────────────────

  _build() {
    // Each helper creates a group, adds it to scene, stores in _buildings.
    this._buildAdministration();
    this._buildAtome();
    this._buildCallback();
    this._buildCallbackRateLimiter();
    this._buildCustomer();
    this._buildGateway();
    this._buildIntegration();
    this._buildRegistration();
    this._buildTransaction();
    this._buildWeb();
    this._buildPipCatalog();
    this._buildPipGateway();
    this._buildPipResource();
    this._buildPipTransaction();
    this._buildWebviewAutomation();
    this._buildPartnershipAutomation();
    this._buildGinpay();
    this._buildEOC();
  }

  _register(group, repoId, roofY) {
    const repo = this._repoMeta[repoId];
    if (!repo) { console.error(`BuildingManager: unknown repo id "${repoId}"`); return; }
    group.position.set(repo.pos[0], 0, repo.pos[2]);
    this._scene.add(group);
    this._buildings.set(repoId, group);
    this._roofY.set(repoId, roofY);
    this._windows.set(repoId, []);
    this._label(group, repo, roofY);
  }

  // ── ms-partner-administration (–48, 0, –8) ─────────────────────────────
  _buildAdministration() {
    const g = new THREE.Group();
    const bx = 0, bz = 0; // group positioned at (-48,0,-8)
    this._plane(g, 16, 14, 0x4a7a5a, bx, 0.04, bz);
    this._box(g, 12.0, 9.0, 9.0, 0x4a6a8a, bx, 4.5,  bz);
    this._box(g, 12.4, 0.5, 9.4, 0x334d66, bx, 9.25, bz);
    this._box(g, 12.0, 0.9, 9.0, 0x2a3d55, bx, 9.95, bz);
    const wins = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 4; col++) {
        wins.push(this._box(g, 1.8, 1.2, 0.2, 0xb8d8ff, -4.5 + col*3.0, 1.2 + row*1.7, -4.55));
      }
    }
    this._box(g, 2.5, 3.5, 0.2, 0x2a3d55, bx, 1.75, -4.55);
    this._box(g, 13.0, 0.3, 0.3, 0x4a6a8a, bx, 0.3, bz);
    this._lamp(g, 4, 4); this._lamp(g, -4, 4);
    this._tree(g, -6, -6, 3.5, 2.2); this._tree(g, 6, -6, 3.5, 2.2);
    this._register(g, 'msp-admin', 9.95 + 0.45);
    this._windows.set('msp-admin', wins);
  }

  // ── ms-partner-atome (–48, 0, –24) ──────────────────────────────────────
  _buildAtome() {
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x3a6a5e, 0, 0.04, 0);
    this._box(g, 9.0, 6.5, 7.5, 0x3a6a7a, 0, 3.25, 0);
    this._box(g, 9.4, 0.4, 7.9, 0x2a4a5a, 0, 6.7,  0);
    this._box(g, 9.0, 0.7, 7.5, 0x1e3a48, 0, 7.25, 0);
    const wins = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.6, 1.3, 0.2, 0xaadeee, -3.0 + col*3.0, 1.2 + row*1.9, 3.55));
      }
    }
    this._box(g, 2.0, 3.0, 0.2, 0x1e3a48, 0, 1.5, 3.55);
    this._lamp(g, -4, 3); this._lamp(g, 4, 3);
    this._tree(g, 5, -4, 3.0, 2.0);
    this._register(g, 'msp-atome', 7.25 + 0.35);
    this._windows.set('msp-atome', wins);
  }

  // ── ms-partner-callback (–32, 0, –36) ───────────────────────────────────
  _buildCallback() {
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x5a7a4e, 0, 0.04, 0);
    this._box(g, 8.5, 7.0, 7.0, 0x5a7a6a, 0, 3.5,  0);
    this._box(g, 8.9, 0.4, 7.4, 0x3a5a4a, 0, 7.2,  0);
    this._box(g, 8.5, 0.7, 7.0, 0x2a4a3a, 0, 7.75, 0);
    const wins = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 2; col++) {
        wins.push(this._box(g, 1.8, 1.2, 0.2, 0xc8f0d8, -2.5 + col*3.5, 1.3 + row*1.6, 3.55));
      }
    }
    this._box(g, 2.0, 3.0, 0.2, 0x2a4a3a, 0, 1.5, 3.55);
    this._lamp(g, -4, 4); this._lamp(g, 4, 4);
    this._register(g, 'msp-cb', 7.75 + 0.35);
    this._windows.set('msp-cb', wins);
  }

  // ── ms-partner-callback-rate-limiter (–48, 0, –40) ──────────────────────
  _buildCallbackRateLimiter() {
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x4a6a7a, 0, 0.04, 0);
    this._box(g, 8.0, 5.5, 7.5, 0x4a6a8a, 0, 2.75, 0);
    this._box(g, 8.4, 0.35, 7.9, 0x2a4a6a, 0, 5.67, 0);
    this._box(g, 8.0, 0.6, 7.5, 0x1a3a5a, 0, 6.1,  0);
    const wins = [];
    for (let row = 0; row < 3; row++) {
      this._box(g, 6.0, 0.15, 0.12, 0x6699cc, 0, 1.2 + row*1.6, 3.56);
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.4, 1.1, 0.2, 0x99ccff, -2.5 + col*2.8, 0.8 + row*1.6, 3.56));
      }
    }
    this._box(g, 2.0, 2.8, 0.2, 0x1a3a5a, 0, 1.4, 3.56);
    this._lamp(g, -4, 3); this._lamp(g, 4, 3);
    this._tree(g, -5, -4, 3.0, 2.0);
    this._register(g, 'msp-cbrl', 6.1 + 0.3);
    this._windows.set('msp-cbrl', wins);
  }

  // ── ms-partner-customer (–32, 0, –52) ───────────────────────────────────
  _buildCustomer() {
    const g = new THREE.Group();
    this._plane(g, 18, 14, 0x6a5a3e, 0, 0.04, 0);
    this._box(g, 13.0, 6.5, 9.5, 0x7a6a5a, 0, 3.25, 0);
    this._box(g, 13.4, 0.45, 9.9, 0x5a4a3a, 0, 6.72, 0);
    this._box(g, 13.0, 0.7, 9.5, 0x4a3a2a, 0, 7.27, 0);
    const wins = [];
    for (let col = 0; col < 5; col++) {
      wins.push(this._box(g, 1.8, 1.3, 0.2, 0xffe8cc, -3.6 + col*2.8, 2.0, 4.55));
      wins.push(this._box(g, 1.8, 1.3, 0.2, 0xffe8cc, -3.6 + col*2.8, 4.5, 4.55));
    }
    this._box(g, 2.5, 3.5, 0.2, 0x4a3a2a, 0, 1.75, 4.55);
    this._box(g, 14.0, 0.3, 0.3, 0x7a6a5a, 0, 0.3, 0);
    this._lamp(g, -6, 4); this._lamp(g, 6, 4);
    this._tree(g, -6, -5, 3.0, 2.0);
    this._register(g, 'msp-cust', 7.27 + 0.35);
    this._windows.set('msp-cust', wins);
  }

  // ── ms-partner-gateway (–16, 0, –52) ────────────────────────────────────
  _buildGateway() {
    const g = new THREE.Group();
    this._plane(g, 14, 14, 0x4a6e7a, 0, 0.04, 0);
    this._box(g, 9.0, 7.5, 8.0, 0x4a6a8a, 0, 3.75, 0);
    this._box(g, 9.4, 0.45, 8.4, 0x2a4a6a, 0, 7.72, 0);
    this._box(g, 9.0, 0.8, 8.0, 0x1a3a5a, 0, 8.35, 0);
    const wins = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.6, 1.2, 0.2, 0xb0d8ff, -2.5 + col*2.5, 1.3 + row*1.7, 4.05));
      }
    }
    this._box(g, 2.0, 3.0, 0.2, 0x1a3a5a, 0, 1.5, 4.05);
    // Satellite dishes on roof
    this._cyl(g, 0.08, 0.1, 0.7, 0x777777,  2.5, 8.8, 2.5);
    this._sphere(g, 0.5, 0xccddee, 2.5, 9.5, 2.5);
    this._cyl(g, 0.08, 0.1, 0.7, 0x777777, -2.5, 8.8, -2.5);
    this._sphere(g, 0.5, 0xccddee, -2.5, 9.5, -2.5);
    this._lamp(g, -4, 4); this._lamp(g, 4, 4);
    this._register(g, 'msp-gw', 8.35 + 0.4);
    this._windows.set('msp-gw', wins);
  }

  // ── ms-partner-integration-platform (–64, 0, –24) ───────────────────────
  _buildIntegration() {
    const g = new THREE.Group();
    this._plane(g, 16, 14, 0x3a5a7e, 0, 0.04, 0);
    this._box(g, 11.0, 8.5, 9.0, 0x3a5a7a, 0, 4.25, 0);
    this._box(g, 11.4, 0.5, 9.4, 0x2a4a6a, 0, 8.75, 0);
    this._box(g, 11.0, 0.9, 9.0, 0x1a3a5a, 0, 9.4,  0);
    const wins = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 2.0, 1.5, 0.2, 0x88ccff, -3.5 + col*3.5, 1.5 + row*1.9, 4.55));
      }
    }
    this._box(g, 2.5, 3.5, 0.2, 0x1a3a5a, 0, 1.75, 4.55);
    this._box(g, 12.0, 0.3, 0.3, 0x3a5a7a, 0, 0.3, 0);
    // Integration connectors on side
    for (let i = 0; i < 4; i++) {
      this._box(g, 0.4, 0.4, 1.5, 0x5599cc, -5.7, 2.5 + i*1.8, 0);
    }
    this._lamp(g, -4, 4); this._lamp(g, 4, 4);
    this._tree(g, -6, -6, 3.5, 2.2);
    this._register(g, 'msp-int', 9.4 + 0.45);
    this._windows.set('msp-int', wins);
  }

  // ── ms-partner-registration (–64, 0, –40) ───────────────────────────────
  _buildRegistration() {
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x6a7a4a, 0, 0.04, 0);
    this._box(g, 9.5, 6.0, 8.0, 0x6a7a6a, 0, 3.0,  0);
    this._box(g, 9.9, 0.4, 8.4, 0x4a5a4a, 0, 6.2,  0);
    this._box(g, 9.5, 0.7, 8.0, 0x3a4a3a, 0, 6.75, 0);
    const wins = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.8, 1.3, 0.2, 0xd8f0c8, -3.0 + col*3.0, 1.3 + row*1.8, 4.05));
      }
    }
    this._box(g, 2.2, 3.2, 0.2, 0x3a4a3a, 0, 1.6, 4.05);
    this._lamp(g, -4, 3); this._lamp(g, 4, 3);
    this._tree(g, -6, -4, 3.0, 2.0);
    this._register(g, 'msp-reg', 6.75 + 0.35);
    this._windows.set('msp-reg', wins);
  }

  // ── ms-partner-transaction (–48, 0, –56) — cylindrical tower ────────────
  _buildTransaction() {
    const g = new THREE.Group();
    this._plane(g, 14, 14, 0x4a6a4e, 0, 0.04, 0);
    this._cyl(g, 3.2, 3.4, 1.0, 0x778877, 0, 0.5,  0);
    this._cyl(g, 2.2, 2.4, 14.0, 0x5a7a5e, 0, 8.0,  0);
    this._cyl(g, 4.2, 4.2, 0.6, 0x3a5a3e, 0, 15.3, 0);
    this._cyl(g, 3.6, 3.6, 0.3, 0x4a6a4e, 0, 15.75, 0);
    this._cyl(g, 0.2, 0.2, 4.0, 0xaaaaaa, 0, 17.9, 0);
    this._sphere(g, 0.5, 0x44dd44, 0, 20.0, 0);
    [0, 1, 2, 3].forEach(i => {
      const angle = i * Math.PI / 2;
      const wx = Math.sin(angle) * 2.3;
      const wz = Math.cos(angle) * 2.3;
      this._box(g, 0.8, 0.55, 0.15, 0xaaffaa, wx, 3.5,  wz, angle);
      this._box(g, 0.8, 0.55, 0.15, 0xaaffaa, wx, 7.5,  wz, angle);
      this._box(g, 0.8, 0.55, 0.15, 0xaaffaa, wx, 11.5, wz, angle);
    });
    this._lamp(g, -5, 4); this._lamp(g, 5, 4);
    this._tree(g, 6, -5, 3.5, 2.2);
    this._register(g, 'msp-txn', 20.5);
    this._windows.set('msp-txn', []);
  }

  // ── ms-partner-web (–16, 0, –36) ────────────────────────────────────────
  _buildWeb() {
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x4a7a6a, 0, 0.04, 0);
    this._box(g, 9.0, 7.0, 7.5, 0x4a7a8a, 0, 3.5,  0);
    this._box(g, 9.4, 0.45, 7.9, 0x2a5a6a, 0, 7.22, 0);
    this._box(g, 9.0, 0.8, 7.5, 0x1a4a5a, 0, 7.87, 0);
    const wins = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.8, 1.4, 0.2, 0xb8eeff, -2.5 + col*3.0, 1.2 + row*1.7, 3.85));
      }
    }
    this._box(g, 2.2, 3.2, 0.2, 0x1a4a5a, 0, 1.6, 3.85);
    this._lamp(g, -4, 3); this._lamp(g, 4, 3);
    this._tree(g, 4, -6, 3.0, 2.0);
    this._register(g, 'msp-web', 7.87 + 0.4);
    this._windows.set('msp-web', wins);
  }

  // ── ms-pip-catalog (24, 0, –36) ─────────────────────────────────────────
  _buildPipCatalog() {
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x8a7a3e, 0, 0.04, 0);
    this._box(g, 9.5, 7.5, 8.0, 0x8a7a6a, 0, 3.75, 0);
    this._box(g, 9.9, 0.5, 8.4, 0x6a5a4a, 0, 7.75, 0);
    this._box(g, 9.5, 0.9, 8.0, 0x5a4a3a, 0, 8.4,  0);
    const wins = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.8, 1.3, 0.2, 0xffeebb, -2.5 + col*3.0, 1.4 + row*1.7, 4.0));
      }
    }
    this._box(g, 2.2, 3.2, 0.2, 0x5a4a3a, 0, 1.6, 4.0);
    // Decorative columns
    this._cyl(g, 0.35, 0.4, 7.6, 0x9a8a7a, -3.5, 3.8, 4.0);
    this._cyl(g, 0.35, 0.4, 7.6, 0x9a8a7a,  3.5, 3.8, 4.0);
    this._lamp(g, -4, 4); this._lamp(g, 4, 4);
    this._tree(g, 5, -6, 3.5, 2.2);
    this._register(g, 'pip-cat', 8.4 + 0.45);
    this._windows.set('pip-cat', wins);
  }

  // ── ms-pip-gateway (40, 0, –24) ─────────────────────────────────────────
  _buildPipGateway() {
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x7a6a3e, 0, 0.04, 0);
    this._box(g, 9.0, 6.5, 7.5, 0x7a6a5a, 0, 3.25, 0);
    this._box(g, 9.4, 0.4, 7.9, 0x5a4a3a, 0, 6.7,  0);
    this._box(g, 9.0, 0.7, 7.5, 0x4a3a2a, 0, 7.25, 0);
    const wins = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.7, 1.2, 0.2, 0xffd8aa, -2.8 + col*2.8, 1.2 + row*1.9, 3.8));
      }
    }
    this._box(g, 2.2, 3.0, 0.2, 0x4a3a2a, 0, 1.5, 3.8);
    // Gateway arch
    this._box(g, 0.5, 5.0, 0.5, 0x8a7a5a, -2.0, 2.5, 3.8);
    this._box(g, 0.5, 5.0, 0.5, 0x8a7a5a,  2.0, 2.5, 3.8);
    this._box(g, 5.0, 0.5, 0.5, 0x8a7a5a,  0.0, 5.2, 3.8);
    this._lamp(g, -4, 3); this._lamp(g, 4, 3);
    this._tree(g, -6, -5, 3.0, 2.0);
    this._register(g, 'pip-gw', 7.25 + 0.35);
    this._windows.set('pip-gw', wins);
  }

  // ── ms-pip-resource (40, 0, –40) ────────────────────────────────────────
  _buildPipResource() {
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x6a5a3e, 0, 0.04, 0);
    this._box(g, 10.0, 5.5, 8.5, 0x6a5a4a, 0, 2.75, 0);
    this._box(g, 10.4, 0.4, 8.9, 0x4a3a2a, 0, 5.7,  0);
    this._box(g, 10.0, 0.6, 8.5, 0x3a2a1a, 0, 6.1,  0);
    // Industrial bay doors
    this._box(g, 3.5, 4.5, 0.2, 0x2a1a0a, -3.0, 2.25, 4.35);
    this._box(g, 3.5, 4.5, 0.2, 0x2a1a0a,  3.0, 2.25, 4.35);
    for (let i = 0; i < 3; i++) {
      this._box(g, 3.3, 0.12, 0.12, 0x4a3a2a, -3.0, 0.6 + i*1.4, 4.35);
      this._box(g, 3.3, 0.12, 0.12, 0x4a3a2a,  3.0, 0.6 + i*1.4, 4.35);
    }
    this._box(g, 11.0, 0.3, 0.3, 0x6a5a4a, 0, 0.3, 0);
    this._lamp(g, -5, 4); this._lamp(g, 5, 4);
    this._register(g, 'pip-res', 6.1 + 0.3);
    this._windows.set('pip-res', []);
  }

  // ── ms-pip-transaction (24, 0, –52) — cylindrical tower ─────────────────
  _buildPipTransaction() {
    const g = new THREE.Group();
    this._plane(g, 14, 14, 0x7a6a3e, 0, 0.04, 0);
    this._cyl(g, 3.0, 3.2, 1.0, 0x998855, 0, 0.5,   0);
    this._cyl(g, 2.0, 2.2, 12.0, 0x7a6a4a, 0, 7.0,   0);
    this._cyl(g, 3.8, 3.8, 0.55, 0x5a4a2a, 0, 13.27, 0);
    this._cyl(g, 3.2, 3.2, 0.3,  0x6a5a3a, 0, 13.72, 0);
    this._cyl(g, 0.18, 0.18, 3.5, 0xaaaaaa, 0, 15.6,  0);
    this._sphere(g, 0.45, 0xffaa22, 0, 17.4, 0);
    [0, 1, 2, 3].forEach(i => {
      const angle = i * Math.PI / 2;
      const wx = Math.sin(angle) * 2.1;
      const wz = Math.cos(angle) * 2.1;
      this._box(g, 0.75, 0.5, 0.15, 0xffdd88, wx, 3.5,  wz, angle);
      this._box(g, 0.75, 0.5, 0.15, 0xffdd88, wx, 7.0,  wz, angle);
      this._box(g, 0.75, 0.5, 0.15, 0xffdd88, wx, 10.5, wz, angle);
    });
    this._lamp(g, -5, 4); this._lamp(g, 5, 4);
    this._tree(g, 6, -5, 3.5, 2.2);
    this._register(g, 'pip-txn', 17.85);
    this._windows.set('pip-txn', []);
  }

  // ── partner-webview-automation-test (24, 0, 20) ──────────────────────────
  _buildWebviewAutomation() {
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x6a6a3e, 0, 0.04, 0);
    this._box(g, 9.0, 5.5, 7.5, 0x6a6a5a, 0, 2.75, 0);
    this._box(g, 9.4, 0.4, 7.9, 0x4a4a3a, 0, 5.7,  0);
    this._box(g, 9.0, 0.7, 7.5, 0x3a3a2a, 0, 6.25, 0);
    const wins = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.6, 1.2, 0.2, 0xeeeebb, -2.5 + col*2.8, 1.2 + row*1.6, 3.8));
      }
    }
    this._box(g, 2.0, 3.0, 0.2, 0x3a3a2a, 0, 1.5, 3.8);
    // Test rig antennas
    this._cyl(g, 0.06, 0.08, 2.0, 0x888888, -2.0, 7.0, -2.0);
    this._cyl(g, 0.06, 0.08, 2.0, 0x888888,  2.0, 7.0, -2.0);
    this._sphere(g, 0.18, 0xff4444, -2.0, 8.15, -2.0);
    this._sphere(g, 0.18, 0x44ff44,  2.0, 8.15, -2.0);
    this._lamp(g, -4, -4); this._lamp(g, 4, -4);
    this._tree(g, -5, 5, 3.0, 2.0);
    this._register(g, 'webview-auto', 6.25 + 0.35);
    this._windows.set('webview-auto', wins);
  }

  // ── partnership-automation (40, 0, 20) ──────────────────────────────────
  _buildPartnershipAutomation() {
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x5a6a3e, 0, 0.04, 0);
    this._box(g, 9.0, 6.0, 7.5, 0x5a6a5a, 0, 3.0,  0);
    this._box(g, 9.4, 0.4, 7.9, 0x3a4a3a, 0, 6.2,  0);
    this._box(g, 9.0, 0.7, 7.5, 0x2a3a2a, 0, 6.75, 0);
    const wins = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.6, 1.2, 0.2, 0xccffcc, -2.5 + col*2.8, 1.2 + row*1.7, 3.8));
      }
    }
    this._box(g, 2.0, 3.2, 0.2, 0x2a3a2a, 0, 1.6, 3.8);
    // Robotic arm on roof
    this._cyl(g, 0.2, 0.25, 1.5, 0x668866, 0, 7.45, 0);
    this._box(g, 3.0, 0.3, 0.3, 0x558855, 0, 8.5, 0);
    this._sphere(g, 0.3, 0x77aa77, 1.5, 8.5, 0);
    this._lamp(g, -4, -4); this._lamp(g, 4, -4);
    this._register(g, 'partnership', 6.75 + 0.35);
    this._windows.set('partnership', wins);
  }

  // ── ms-ginpay (8, 0, –36) — sunset / maintenance ────────────────────────
  _buildGinpay() {
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x5a5a4a, 0, 0.04, 0);
    this._box(g, 8.5, 5.5, 7.0, 0x7a7060, 0, 2.75, 0);
    this._box(g, 8.9, 0.35, 7.4, 0x5a5248, 0, 5.67, 0);
    this._box(g, 8.5, 0.55, 7.0, 0x4a4840, 0, 6.12, 0);
    // Boarded-up windows
    this._box(g, 2.2, 1.5, 0.25, 0x3a2e22, -2.5, 2.5, 3.55);
    this._box(g, 2.2, 1.5, 0.25, 0x3a2e22,  2.5, 2.5, 3.55);
    this._box(g, 2.2, 1.5, 0.25, 0x3a2e22, -2.5, 4.5, 3.55);
    this._box(g, 2.2, 1.5, 0.25, 0x3a2e22,  2.5, 4.5, 3.55);
    // Cross planks
    this._box(g, 2.4, 0.12, 0.12, 0x2a2018, -2.5, 2.5, 3.62);
    this._box(g, 0.12, 1.6, 0.12, 0x2a2018, -2.5, 2.5, 3.62);
    this._box(g, 2.4, 0.12, 0.12, 0x2a2018,  2.5, 2.5, 3.62);
    this._box(g, 0.12, 1.6, 0.12, 0x2a2018,  2.5, 2.5, 3.62);
    // Bricked-up door
    this._box(g, 2.2, 3.2, 0.25, 0x4a4030, 0, 1.6, 3.55);
    // Hazard tape posts (using local coordinates: ginpay at 8,0,-36)
    const hazardPosts = [
      [-5,-5],[ 0,-5],[ 5,-5],
      [-5, 5],[ 0, 5],[ 5, 5],
      [-5,-2],[-5, 2],
      [ 5,-2],[ 5, 2],
    ];
    hazardPosts.forEach(([px, pz], idx) => {
      const col = idx % 2 === 0 ? 0xffcc00 : 0x222222;
      this._cyl(g, 0.09, 0.1, 1.2, col, px, 0.6, pz);
    });
    // Warning sign on roof
    this._cyl(g, 0.07, 0.09, 1.5, 0x555555, 0, 7.37, 0);
    this._box(g, 2.8, 0.7, 0.12, 0xcc4400, 0, 8.2, 0);
    this._box(g, 2.6, 0.5, 0.08, 0xffaa00, 0, 8.2, 0);
    // Crack marks
    this._box(g, 0.08, 1.8, 0.08, 0x2a2a2a, -1.0, 2.0, 3.62);
    this._box(g, 1.4, 0.08, 0.08, 0x2a2a2a,  1.5, 3.8, 3.62);
    this._register(g, 'ginpay', 8.7);
    this._windows.set('ginpay', []);
  }

  // ── production-support / EOC (20, 0, 0) ─────────────────────────────────
  _buildEOC() {
    const g = new THREE.Group();
    // Foundation
    this._plane(g, 16, 16, 0x888888, 0, 0.02, 0);
    // Security kerbs
    [[-8,0],[8,0],[0,-8],[0,8]].forEach(([kx,kz]) => {
      this._box(g, 16, 0.18, 0.25, 0xcc1111, kx, 0.09, kz);
    });
    // Main tower base (ground floor)
    this._box(g, 10, 4.5, 10, 0xdddddd, 0, 2.25, 0);
    this._box(g, 10.1, 0.55, 10.1, 0xcc1111, 0, 0.9, 0);
    // Second floor
    this._box(g, 8.5, 4.0, 8.5, 0xe8e8e8, 0, 6.5, 0);
    this._box(g, 9.0, 0.45, 9.0, 0xcc1111, 0, 4.73, 0);
    // Third floor — command deck
    this._box(g, 7.0, 3.0, 7.0, 0x1a3a5a, 0, 10.0, 0);
    // Command deck windows — 4 sides
    this._box(g, 6.0, 1.8, 0.12, 0x55aaff, 0,     10.1, -3.56);
    this._box(g, 6.0, 1.8, 0.12, 0x55aaff, 0,     10.1,  3.56);
    this._box(g, 0.12, 1.8, 6.0, 0x55aaff, -3.56, 10.1,  0);
    this._box(g, 0.12, 1.8, 6.0, 0x55aaff,  3.56, 10.1,  0);
    // Red roof cap
    this._box(g, 7.2, 0.4, 7.2, 0xcc1111, 0, 11.7, 0);
    // Mechanical penthouse
    this._box(g, 4.5, 1.8, 4.5, 0xaaaaaa, 0, 13.05, 0);
    // Antenna mast
    this._cyl(g, 0.12, 0.08, 6.5, 0x888888, 0, 15.15, 0);
    this._cyl(g, 0.06, 0.04, 1.8, 0xcc1111, 0, 18.25, 0);
    this._box(g, 5.0, 0.1, 0.1, 0x888888, 0, 14.2, 0);
    this._box(g, 0.1, 0.1, 5.0, 0x888888, 0, 14.2, 0);
    this._box(g, 4.0, 0.1, 0.1, 0x888888, 0, 15.8, 0);
    this._box(g, 0.1, 0.1, 4.0, 0x888888, 0, 15.8, 0);
    // Satellite dishes
    this._cyl(g, 0.07, 0.07, 0.8, 0xcccccc, -2.6, 13.2, -1.0);
    this._box(g, 1.4, 1.4, 0.15, 0xdddddd, -3.1, 13.6, -1.0);
    this._box(g, 0.3, 0.3, 0.08, 0xcc1111, -3.1, 13.6, -1.0);
    this._cyl(g, 0.07, 0.07, 0.8, 0xcccccc,  2.6, 13.2,  1.0);
    this._box(g, 1.4, 1.4, 0.15, 0xdddddd,  3.1, 13.6,  1.0);
    this._box(g, 0.3, 0.3, 0.08, 0xcc1111,  3.1, 13.6,  1.0);
    // Roof emergency cross
    this._box(g, 5.0, 0.35, 1.4, 0xee0000, 0, 12.12, 0);
    this._box(g, 1.4, 0.35, 5.0, 0xee0000, 0, 12.12, 0);
    this._box(g, 4.2, 0.36, 0.85, 0xffffff, 0, 12.14, 0);
    this._box(g, 0.85, 0.36, 4.2, 0xffffff, 0, 12.14, 0);
    // Alert beacons on roof corners
    [[-2.8,-2.8],[2.8,-2.8],[-2.8,2.8],[2.8,2.8]].forEach(([bx,bz]) => {
      this._cyl(g, 0.14, 0.14, 0.6, 0x333333, bx, 12.25, bz);
      this._cyl(g, 0.18, 0.18, 0.22, 0xff2200, bx, 12.75, bz);
    });
    // Ground floor windows (front face z=-5.06)
    const GF_Z = -5.06;
    this._box(g, 1.7, 1.9, 0.08, 0xffffff, -3.8, 2.4, GF_Z);
    this._box(g, 1.4, 1.6, 0.1,  0x55aaff, -3.8, 2.4, GF_Z);
    this._box(g, 1.7, 1.9, 0.08, 0xffffff, -1.5, 2.4, GF_Z);
    this._box(g, 1.4, 1.6, 0.1,  0x55aaff, -1.5, 2.4, GF_Z);
    this._box(g, 1.7, 1.9, 0.08, 0xffffff,  1.5, 2.4, GF_Z);
    this._box(g, 1.4, 1.6, 0.1,  0x55aaff,  1.5, 2.4, GF_Z);
    this._box(g, 1.7, 1.9, 0.08, 0xffffff,  3.8, 2.4, GF_Z);
    this._box(g, 1.4, 1.6, 0.1,  0x55aaff,  3.8, 2.4, GF_Z);
    // Central entry door
    this._box(g, 2.6, 3.4, 0.08, 0xffffff, 0, 1.7,    GF_Z);
    this._box(g, 2.2, 3.0, 0.1,  0x111111, 0, 1.6,    GF_Z);
    this._box(g, 0.9, 2.6, 0.11, 0x223355, -0.55, 1.6, GF_Z);
    this._box(g, 0.9, 2.6, 0.11, 0x223355,  0.55, 1.6, GF_Z);
    // Generator units (right side)
    this._box(g, 3.0, 1.4, 1.8, 0x555555, 7.0, 0.7, -2.0);
    this._box(g, 3.0, 1.4, 1.8, 0x555555, 7.0, 0.7,  2.0);
    this._cyl(g, 0.16, 0.14, 2.2, 0x555555, 8.8, 1.1, -1.0);
    this._cyl(g, 0.16, 0.14, 2.0, 0x555555, 8.8, 1.0,  1.0);
    // Security bollards
    [-3.5,-1.2,1.2,3.5].forEach(bx => {
      this._cyl(g, 0.18, 0.18, 1.1, 0xcc1111, bx, 0.55, -6.2);
      this._cyl(g, 0.22, 0.22, 0.18, 0xffcc00, bx, 1.2, -6.2);
    });
    this._register(g, 'prod-support', 19.15);
    this._windows.set('prod-support', []);
  }
}
