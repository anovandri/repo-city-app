import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { computeLayout } from './DistrictLayout.js';

// Visual floor scaling: converts API floor count to reasonable building height
// Formula: visualFloors = max(3, min(12, floors × 0.15))
// This keeps buildings between 3-12 visual floors regardless of actual commit count
const FLOOR_SCALE = 0.16;
const MIN_VISUAL_FLOORS = 3;
const MAX_VISUAL_FLOORS = 12;

const MAT_CACHE = new Map();
function mat(color) {
  if (!MAT_CACHE.has(color)) {
    MAT_CACHE.set(color, new THREE.MeshLambertMaterial({ color }));
  }
  return MAT_CACHE.get(color);
}

/**
 * BuildingManager — creates all repo buildings from live API data.
 *
 * Building positions come from DistrictLayout (computed from district).
 * Building heights come from api.floors (stored in the DB).
 * Icon, name, status come from api fields.
 *
 * Everything is keyed by slug (the full repo slug e.g. "ms-partner-gateway")
 * so it stays in sync with WebSocket events and EffectsManager without
 * any short-id translation layer.
 */
export class BuildingManager {
  /**
   * @param {THREE.Scene} scene
   * @param {Array<{slug:string, name:string, icon:string, openMrCount:number,
   *                status:string, district:string, floors:number}>} apiRepos
   *   Live repo data from GET /api/repos.
   */
  constructor(scene, apiRepos = []) {
    this._scene     = scene;
    /** @type {Map<string, THREE.Group>}  slug → group */
    this._buildings = new Map();
    /** @type {Map<string, THREE.Mesh[]>} slug → glow window meshes */
    this._windows   = new Map();
    /** @type {Map<string, number>}       slug → roof world-Y */
    this._roofY     = new Map();
    /** @type {Map<string, {multiplier: number, accessoryHeight: number}>} slug → height formula */
    this._buildingFormula = new Map();
    /** @type {Map<string, number>}       slug → initial floor count at creation */
    this._initialFloors = new Map();
    /** @type {Map<string, THREE.Group>}  slug → tree group (not scaled with building) */
    this._trees = new Map();

    // Compute [x, z] for every slug from district layout engine
    const layout = computeLayout(apiRepos);

    // Build a rich meta map: slug → { slug, name, icon, floors, status, x, z, sunset, support }
    this._repoMeta = {};
    for (const repo of apiRepos) {
      const [x, z] = layout.get(repo.slug) ?? [0, 0];
      this._repoMeta[repo.slug] = {
        slug:    repo.slug,
        name:    repo.name,
        icon:    repo.icon   ?? '🏢',
        floors:  repo.floors ?? 7,
        status:  repo.status ?? 'ACTIVE',
        sunset:  repo.status === 'MAINTENANCE',
        support: repo.slug   === 'production-support',
        x,
        z,
      };
    }

    this._build();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /** @returns {THREE.Group|undefined} */
  getGroup(slug)   { return this._buildings.get(slug); }
  getWindows(slug) { return this._windows.get(slug) ?? []; }
  getFloors(slug)  { return this._roofY.get(slug) ?? 0; }

  /**
   * World-space top-centre of a building (for beam + label placement).
   * @param {string} slug
   */
  getBuildingTop(slug) {
    const repo = this._repoMeta[slug];
    if (!repo) return null;
    const y = this._roofY.get(slug) ?? repo.floors;
    return new THREE.Vector3(repo.x, y, repo.z);
  }

  /** Dynamic floor update (called by live WebSocket events). */
  setFloors(slug, floors) {
    const building = this._buildings.get(slug);
    const formula = this._buildingFormula.get(slug);
    if (!building || !formula) {
      // No building or formula — fallback to raw floors
      this._roofY.set(slug, floors);
      return;
    }

    const { multiplier, accessoryHeight } = formula;
    const initialFloors = this._initialFloors.get(slug) || floors;
    
    // Scale floors to reasonable visual height (same as _scaleFloors)
    const visualFloors = this._scaleFloors(floors);
    const initialVisualFloors = this._scaleFloors(initialFloors);
    
    // Calculate new visual roof height using scaled floors
    const newRoofY = visualFloors * multiplier + accessoryHeight;
    this._roofY.set(slug, newRoofY);

    // Calculate scale ratio to grow/shrink the building
    const initialRoofY = initialVisualFloors * multiplier + accessoryHeight;
    const scaleY = newRoofY / initialRoofY;
    building.scale.y = scaleY;
  }

  dispose() {
    // Clean up tree groups
    this._trees.forEach(treeGroup => {
      this._scene.remove(treeGroup);
      treeGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
      });
    });
    this._trees.clear();
    
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
    // Trees are now added to a separate group stored in g.userData.trees
    // This prevents them from being scaled when the building scales
    if (!g.userData.trees) {
      g.userData.trees = [];
    }
    const treeData = { x, z, h, r };
    g.userData.trees.push(treeData);
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
    // The call order determines which geometry style each slug gets.
    // Slugs are matched by position in the ms-partner / ms-pip / standalone / special
    // order returned by GET /api/repos (sorted by openMrCount desc, then stable).
    // We look them up by slug name so the geometry assignment is explicit.
    const call = (slug, fn) => {
      if (this._repoMeta[slug]) fn.call(this, slug);
    };
    call('ms-partner-administration',        this._buildAdministration);
    call('ms-partner-atome',                 this._buildAtome);
    call('ms-partner-callback',              this._buildCallback);
    call('ms-partner-callback-rate-limiter', this._buildCallbackRateLimiter);
    call('ms-partner-customer',              this._buildCustomer);
    call('ms-partner-gateway',               this._buildGateway);
    call('ms-partner-integration-platform',  this._buildIntegration);
    call('ms-partner-registration',          this._buildRegistration);
    call('ms-partner-transaction',           this._buildTransaction);
    call('ms-partner-web',                   this._buildWeb);
    call('ms-pip-catalog',                   this._buildPipCatalog);
    call('ms-pip-gateway',                   this._buildPipGateway);
    call('ms-pip-resource',                  this._buildPipResource);
    call('ms-pip-transaction',               this._buildPipTransaction);
    call('partner-webview-automation-test',  this._buildWebviewAutomation);
    call('partnership-automation',           this._buildPartnershipAutomation);
    call('ms-ginpay',                        this._buildGinpay);
    call('production-support',               this._buildEOC);
  }

  /**
   * Scales down floor count to reasonable visual height.
   * Prevents buildings from becoming skyscrapers.
   * @param {number} floors - Raw floor count from API
   * @returns {number} Visual floor count (3-12 range)
   */
  _scaleFloors(floors) {
    return Math.max(MIN_VISUAL_FLOORS, Math.min(MAX_VISUAL_FLOORS, floors * FLOOR_SCALE));
  }

  /**
   * Registers a completed building group into scene and internal maps.
   * @param {THREE.Group} group
   * @param {string} slug  — full repo slug (the API key)
   * @param {number} roofY — world-space Y of the roof top
   * @param {number} multiplier — height multiplier per floor
   * @param {number} accessoryHeight — fixed height of roof accessories
   */
  _register(group, slug, roofY, multiplier = 1.0, accessoryHeight = 0) {
    const repo = this._repoMeta[slug];
    if (!repo) { console.error(`BuildingManager: unknown slug "${slug}"`); return; }
    group.position.set(repo.x, 0, repo.z);
    
    // Explicitly set initial scale to (1, 1, 1) to ensure consistent baseline
    group.scale.set(1, 1, 1);
    
    this._scene.add(group);
    this._buildings.set(slug, group);
    this._roofY.set(slug, roofY);
    this._windows.set(slug, []);
    this._buildingFormula.set(slug, { multiplier, accessoryHeight });
    this._initialFloors.set(slug, repo.floors);
    this._label(group, repo, roofY);
    
    // Create trees as separate group (not affected by building scaling)
    if (group.userData.trees && group.userData.trees.length > 0) {
      const treeGroup = new THREE.Group();
      treeGroup.position.set(repo.x, 0, repo.z);
      
      for (const treeData of group.userData.trees) {
        const { x, z, h, r } = treeData;
        // Create tree trunk (cylinder)
        const trunkGeom = new THREE.CylinderGeometry(0.18, 0.22, h, 8);
        const trunkMesh = new THREE.Mesh(trunkGeom, mat(0x7a5230));
        trunkMesh.position.set(x, h / 2, z);
        treeGroup.add(trunkMesh);
        
        // Create tree foliage (sphere)
        const foliageGeom = new THREE.SphereGeometry(r, 8, 6);
        const foliageMesh = new THREE.Mesh(foliageGeom, mat(0x2e9e2e));
        foliageMesh.position.set(x, h + r * 0.7, z);
        treeGroup.add(foliageMesh);
      }
      
      this._scene.add(treeGroup);
      this._trees.set(slug, treeGroup);
    }
  }

  // ── ms-partner-administration ────────────────────────────────────────────
  _buildAdministration(slug) {
    const { floors } = this._repoMeta[slug];
    const visualFloors = this._scaleFloors(floors);
    const h = visualFloors * 1.2;
    const g = new THREE.Group();
    this._plane(g, 16, 14, 0x66dd88, 0, 0.04, 0); // Bright green ground
    this._box(g, 12.0, h,       9.0, 0x5599dd, 0, h/2,       0); // Bright blue building
    this._box(g, 12.4, 0.5,    9.4, 0x4488cc, 0, h + 0.25,   0); // Accent band
    this._box(g, 12.0, 0.9,    9.0, 0x3377bb, 0, h + 0.7,    0); // Roof cap
    const wins = [];
    const rows = Math.max(2, Math.floor(floors * 0.6));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 4; col++) {
        wins.push(this._box(g, 1.8, 1.2, 0.2, 0xffeeaa, -4.5 + col*3.0, 1.2 + row*(h/rows), -4.55)); // Bright yellow windows
      }
    }
    this._box(g, 2.5, 3.5, 0.2, 0x2a3d55, 0, 1.75, -4.55);
    this._box(g, 13.0, 0.3, 0.3, 0x5599dd, 0, 0.3, 0);
    this._lamp(g, 4, 4); this._lamp(g, -4, 4);
    this._tree(g, -6, -6, 3.5, 2.2); this._tree(g, 6, -6, 3.5, 2.2);
    this._register(g, slug, h + 0.9 + 0.45, 1.2, 0.9 + 0.45); // multiplier=1.2, accessories=1.35
    this._windows.set(slug, wins);
  }

  // ── ms-partner-atome ─────────────────────────────────────────────────────
  _buildAtome(slug) {
    const { floors } = this._repoMeta[slug];
    const visualFloors = this._scaleFloors(floors);
    const h = visualFloors * 1.1;
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x55ddaa, 0, 0.04, 0); // Bright teal ground
    this._box(g, 9.0, h,    7.5, 0x44aadd, 0, h/2,     0); // Bright cyan building
    this._box(g, 9.4, 0.4,  7.9, 0x3399cc, 0, h + 0.2, 0); // Accent band
    this._box(g, 9.0, 0.7,  7.5, 0x2288bb, 0, h + 0.75,0); // Roof cap
    const wins = [];
    const rows = Math.max(2, Math.floor(floors * 0.45));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.6, 1.3, 0.2, 0xffffcc, -3.0 + col*3.0, 1.2 + row*(h/rows), 3.55)); // Bright cream windows
      }
    }
    this._box(g, 2.0, 3.0, 0.2, 0x1e3a48, 0, 1.5, 3.55);
    this._lamp(g, -4, 3); this._lamp(g, 4, 3);
    this._tree(g, 5, -4, 3.0, 2.0);
    this._register(g, slug, h + 0.75 + 0.35, 1.1, 0.75 + 0.35); // multiplier=1.1, accessories=1.1
    this._windows.set(slug, wins);
  }

  // ── ms-partner-callback ──────────────────────────────────────────────────
  _buildCallback(slug) {
    const { floors } = this._repoMeta[slug];
    const visualFloors = this._scaleFloors(floors);
    const h = visualFloors * 1.1;
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x88dd66, 0, 0.04, 0); // Bright lime ground
    this._box(g, 8.5, h,    7.0, 0x66bb55, 0, h/2,      0); // Bright green building
    this._box(g, 8.9, 0.4,  7.4, 0x55aa44, 0, h + 0.2,  0); // Accent band
    this._box(g, 8.5, 0.7,  7.0, 0x449933, 0, h + 0.75, 0); // Roof cap
    const wins = [];
    const rows = Math.max(2, Math.floor(floors * 0.55));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 2; col++) {
        wins.push(this._box(g, 1.8, 1.2, 0.2, 0xc8f0d8, -2.5 + col*3.5, 1.3 + row*(h/rows), 3.55));
      }
    }
    this._box(g, 2.0, 3.0, 0.2, 0x2a4a3a, 0, 1.5, 3.55);
    this._lamp(g, -4, 4); this._lamp(g, 4, 4);
    this._register(g, slug, h + 0.75 + 0.35, 1.1, 1.1); // Callback: multiplier=1.1, accessories=1.1
    this._windows.set(slug, wins);
  }

  // ── ms-partner-callback-rate-limiter ─────────────────────────────────────
  _buildCallbackRateLimiter(slug) {
    const { floors } = this._repoMeta[slug];
    const visualFloors = this._scaleFloors(floors);
    const h = visualFloors * 1.0;
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x4a6a7a, 0, 0.04, 0);
    this._box(g, 8.0, h,    7.5, 0x4a6a8a, 0, h/2,      0);
    this._box(g, 8.4, 0.35, 7.9, 0x2a4a6a, 0, h + 0.17, 0);
    this._box(g, 8.0, 0.6,  7.5, 0x1a3a5a, 0, h + 0.6,  0);
    const wins = [];
    const rows = Math.max(2, Math.floor(floors * 0.45));
    for (let row = 0; row < rows; row++) {
      this._box(g, 6.0, 0.15, 0.12, 0x6699cc, 0, 1.2 + row*(h/rows), 3.56);
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.4, 1.1, 0.2, 0x99ccff, -2.5 + col*2.8, 0.8 + row*(h/rows), 3.56));
      }
    }
    this._box(g, 2.0, 2.8, 0.2, 0x1a3a5a, 0, 1.4, 3.56);
    this._lamp(g, -4, 3); this._lamp(g, 4, 3);
    this._tree(g, -5, -4, 3.0, 2.0);
    this._register(g, slug, h + 0.6 + 0.3, 1.0, 0.9); // CallbackRateLimiter: multiplier=1.0, accessories=0.9
    this._windows.set(slug, wins);
  }

  // ── ms-partner-customer ──────────────────────────────────────────────────
  _buildCustomer(slug) {
    const { floors } = this._repoMeta[slug];
    const visualFloors = this._scaleFloors(floors);
    const h = visualFloors * 1.1;
    const g = new THREE.Group();
    this._plane(g, 18, 14, 0x6a5a3e, 0, 0.04, 0);
    this._box(g, 13.0, h,    9.5, 0x7a6a5a, 0, h/2,      0);
    this._box(g, 13.4, 0.45, 9.9, 0x5a4a3a, 0, h + 0.22, 0);
    this._box(g, 13.0, 0.7,  9.5, 0x4a3a2a, 0, h + 0.77, 0);
    const wins = [];
    const rows = Math.max(2, Math.floor(floors * 0.3));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 5; col++) {
        wins.push(this._box(g, 1.8, 1.3, 0.2, 0xffe8cc, -3.6 + col*2.8, 2.0 + row*(h*0.4), 4.55));
      }
    }
    this._box(g, 2.5, 3.5, 0.2, 0x4a3a2a, 0, 1.75, 4.55);
    this._box(g, 14.0, 0.3, 0.3, 0x7a6a5a, 0, 0.3, 0);
    this._lamp(g, -6, 4); this._lamp(g, 6, 4);
    this._tree(g, -6, -5, 3.0, 2.0);
    this._register(g, slug, h + 0.77 + 0.35, 1.1, 1.12); // Customer: multiplier=1.1, accessories=1.12
    this._windows.set(slug, wins);
  }

  // ── ms-partner-gateway ───────────────────────────────────────────────────
  _buildGateway(slug) {
    const { floors } = this._repoMeta[slug];
    const visualFloors = this._scaleFloors(floors);
    const h = visualFloors * 1.2;
    const g = new THREE.Group();
    this._plane(g, 14, 14, 0x66bbee, 0, 0.04, 0); // Bright sky blue ground
    this._box(g, 9.0, h,    8.0, 0x5588dd, 0, h/2,      0); // Bright purple-blue building
    this._box(g, 9.4, 0.45, 8.4, 0x4477cc, 0, h + 0.22, 0); // Accent band
    this._box(g, 9.0, 0.8,  8.0, 0x3366bb, 0, h + 0.85, 0); // Roof cap
    const wins = [];
    const rows = Math.max(2, Math.floor(floors * 0.55));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.6, 1.2, 0.2, 0xffffaa, -2.5 + col*2.5, 1.3 + row*(h/rows), 4.05)); // Bright yellow windows
      }
    }
    this._box(g, 2.0, 3.0, 0.2, 0x3366bb, 0, 1.5, 4.05);
    this._cyl(g, 0.08, 0.1, 0.7, 0xcccccc,  2.5, h + 0.45, 2.5);
    this._sphere(g, 0.5, 0xffeeaa, 2.5, h + 1.15, 2.5); // Bright cream sphere
    this._cyl(g, 0.08, 0.1, 0.7, 0xcccccc, -2.5, h + 0.45, -2.5);
    this._sphere(g, 0.5, 0xffeeaa, -2.5, h + 1.15, -2.5); // Bright cream sphere
    this._lamp(g, -4, 4); this._lamp(g, 4, 4);
    this._register(g, slug, h + 0.85 + 0.4, 1.2, 1.25); // Gateway: multiplier=1.2, accessories=1.25
    this._windows.set(slug, wins);
  }

  // ── ms-partner-integration-platform ──────────────────────────────────────
  _buildIntegration(slug) {
    const { floors } = this._repoMeta[slug];
    const visualFloors = this._scaleFloors(floors);
    const h = visualFloors * 1.2;
    const g = new THREE.Group();
    this._plane(g, 16, 14, 0x3a5a7e, 0, 0.04, 0);
    this._box(g, 11.0, h,    9.0, 0x3a5a7a, 0, h/2,      0);
    this._box(g, 11.4, 0.5,  9.4, 0x2a4a6a, 0, h + 0.25, 0);
    this._box(g, 11.0, 0.9,  9.0, 0x1a3a5a, 0, h + 0.95, 0);
    const wins = [];
    const rows = Math.max(2, Math.floor(floors * 0.55));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 2.0, 1.5, 0.2, 0x88ccff, -3.5 + col*3.5, 1.5 + row*(h/rows), 4.55));
      }
    }
    this._box(g, 2.5, 3.5, 0.2, 0x1a3a5a, 0, 1.75, 4.55);
    this._box(g, 12.0, 0.3, 0.3, 0x3a5a7a, 0, 0.3, 0);
    for (let i = 0; i < 4; i++) {
      this._box(g, 0.4, 0.4, 1.5, 0x5599cc, -5.7, 2.5 + i*(h/5), 0);
    }
    this._lamp(g, -4, 4); this._lamp(g, 4, 4);
    this._tree(g, -6, -6, 3.5, 2.2);
    this._register(g, slug, h + 0.95 + 0.45, 1.2, 1.4); // Integration: multiplier=1.2, accessories=1.4
    this._windows.set(slug, wins);
  }

  // ── ms-partner-registration ──────────────────────────────────────────────
  _buildRegistration(slug) {
    const { floors } = this._repoMeta[slug];
    const visualFloors = this._scaleFloors(floors);
    const h = visualFloors * 1.0;
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x6a7a4a, 0, 0.04, 0);
    this._box(g, 9.5, h,    8.0, 0x6a7a6a, 0, h/2,      0);
    this._box(g, 9.9, 0.4,  8.4, 0x4a5a4a, 0, h + 0.2,  0);
    this._box(g, 9.5, 0.7,  8.0, 0x3a4a3a, 0, h + 0.75, 0);
    const wins = [];
    const rows = Math.max(2, Math.floor(floors * 0.45));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.8, 1.3, 0.2, 0xd8f0c8, -3.0 + col*3.0, 1.3 + row*(h/rows), 4.05));
      }
    }
    this._box(g, 2.2, 3.2, 0.2, 0x3a4a3a, 0, 1.6, 4.05);
    this._lamp(g, -4, 3); this._lamp(g, 4, 3);
    this._tree(g, -6, -4, 3.0, 2.0);
    this._register(g, slug, h + 0.75 + 0.35, 1.0, 1.1); // Registration: multiplier=1.0, accessories=1.1
    this._windows.set(slug, wins);
  }

  // ── ms-partner-transaction — cylindrical tower ───────────────────────────
  _buildTransaction(slug) {
    const { floors } = this._repoMeta[slug];
    const visualFloors = this._scaleFloors(floors);
    const h = visualFloors * 1.2;
    const g = new THREE.Group();
    
    // Bright green ground plane for visibility
    this._plane(g, 14, 14, 0x66ee88, 0, 0.04, 0);
    
    // Main building structure - bright teal/green building
    this._box(g, 9.5, h, 8.5, 0x44ccaa, 0, h/2, 0); // Bright teal body
    this._box(g, 9.9, 0.45, 8.9, 0x33bb99, 0, h + 0.22, 0); // Accent band
    this._box(g, 9.5, 0.8, 8.5, 0x22aa88, 0, h + 0.85, 0); // Roof cap
    
    // Windows with bright yellow glow
    const wins = [];
    const rows = Math.max(2, Math.floor(floors * 0.5));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.8, 1.3, 0.2, 0xffffaa, -3.0 + col*3.0, 1.3 + row*(h/rows), 4.3));
      }
    }
    
    // Entrance door
    this._box(g, 2.2, 3.2, 0.2, 0x22aa88, 0, 1.6, 4.3);
    
    // Corner accent pillars
    this._box(g, 0.6, h, 0.6, 0x55ddbb, -4.5, h/2, -4.0);
    this._box(g, 0.6, h, 0.6, 0x55ddbb, 4.5, h/2, -4.0);
    this._box(g, 0.6, h, 0.6, 0x55ddbb, -4.5, h/2, 4.0);
    this._box(g, 0.6, h, 0.6, 0x55ddbb, 4.5, h/2, 4.0);
    
    // Rooftop decorations
    this._box(g, 2.0, 0.8, 2.0, 0x55ddbb, 0, h + 1.25, 0);
    
    this._lamp(g, -5, 5); this._lamp(g, 5, 5);
    this._tree(g, 6, -5, 3.5, 2.2);
    this._register(g, slug, h + 1.65, 1.2, 1.65); // Transaction: multiplier=1.2, accessories=1.65
    this._windows.set(slug, wins);
  }

  // ── ms-partner-web ───────────────────────────────────────────────────────
  _buildWeb(slug) {
    const { floors } = this._repoMeta[slug];
    const visualFloors = this._scaleFloors(floors);
    const h = visualFloors * 1.1;
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x4a7a6a, 0, 0.04, 0);
    this._box(g, 9.0, h,    7.5, 0x4a7a8a, 0, h/2,      0);
    this._box(g, 9.4, 0.45, 7.9, 0x2a5a6a, 0, h + 0.22, 0);
    this._box(g, 9.0, 0.8,  7.5, 0x1a4a5a, 0, h + 0.87, 0);
    const wins = [];
    const rows = Math.max(2, Math.floor(floors * 0.55));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.8, 1.4, 0.2, 0xb8eeff, -2.5 + col*3.0, 1.2 + row*(h/rows), 3.85));
      }
    }
    this._box(g, 2.2, 3.2, 0.2, 0x1a4a5a, 0, 1.6, 3.85);
    this._lamp(g, -4, 3); this._lamp(g, 4, 3);
    this._tree(g, 4, -6, 3.0, 2.0);
    this._register(g, slug, h + 0.87 + 0.4, 1.1, 1.27); // Web: multiplier=1.1, accessories=1.27
    this._windows.set(slug, wins);
  }

  // ── ms-pip-catalog ───────────────────────────────────────────────────────
  _buildPipCatalog(slug) {
    const { floors } = this._repoMeta[slug];
    const visualFloors = this._scaleFloors(floors);
    const h = visualFloors * 1.2;
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x8a7a3e, 0, 0.04, 0);
    this._box(g, 9.5, h,    8.0, 0x8a7a6a, 0, h/2,      0);
    this._box(g, 9.9, 0.5,  8.4, 0x6a5a4a, 0, h + 0.25, 0);
    this._box(g, 9.5, 0.9,  8.0, 0x5a4a3a, 0, h + 0.95, 0);
    const wins = [];
    const rows = Math.max(2, Math.floor(floors * 0.55));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.8, 1.3, 0.2, 0xffeebb, -2.5 + col*3.0, 1.4 + row*(h/rows), 4.0));
      }
    }
    this._box(g, 2.2, 3.2, 0.2, 0x5a4a3a, 0, 1.6, 4.0);
    this._cyl(g, 0.35, 0.4, h, 0x9a8a7a, -3.5, h/2, 4.0);
    this._cyl(g, 0.35, 0.4, h, 0x9a8a7a,  3.5, h/2, 4.0);
    this._lamp(g, -4, 4); this._lamp(g, 4, 4);
    this._tree(g, 5, -6, 3.5, 2.2);
    this._register(g, slug, h + 0.95 + 0.45, 1.2, 1.4); // PipCatalog: multiplier=1.2, accessories=1.4
    this._windows.set(slug, wins);
  }

  // ── ms-pip-gateway ───────────────────────────────────────────────────────
  _buildPipGateway(slug) {
    const { floors } = this._repoMeta[slug];
    const visualFloors = this._scaleFloors(floors);
    const h = visualFloors * 1.1;
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x7a6a3e, 0, 0.04, 0);
    this._box(g, 9.0, h,    7.5, 0x7a6a5a, 0, h/2,      0);
    this._box(g, 9.4, 0.4,  7.9, 0x5a4a3a, 0, h + 0.2,  0);
    this._box(g, 9.0, 0.7,  7.5, 0x4a3a2a, 0, h + 0.75, 0);
    const wins = [];
    const rows = Math.max(2, Math.floor(floors * 0.45));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.7, 1.2, 0.2, 0xffd8aa, -2.8 + col*2.8, 1.2 + row*(h/rows), 3.8));
      }
    }
    this._box(g, 2.2, 3.0, 0.2, 0x4a3a2a, 0, 1.5, 3.8);
    this._box(g, 0.5, 5.0, 0.5, 0x8a7a5a, -2.0, 2.5, 3.8);
    this._box(g, 0.5, 5.0, 0.5, 0x8a7a5a,  2.0, 2.5, 3.8);
    this._box(g, 5.0, 0.5, 0.5, 0x8a7a5a,  0.0, 5.2, 3.8);
    this._lamp(g, -4, 3); this._lamp(g, 4, 3);
    this._tree(g, -6, -5, 3.0, 2.0);
    this._register(g, slug, h + 0.75 + 0.35, 1.1, 1.1); // PipGateway: multiplier=1.1, accessories=1.1
    this._windows.set(slug, wins);
  }

  // ── ms-pip-resource ──────────────────────────────────────────────────────
  _buildPipResource(slug) {
    const { floors } = this._repoMeta[slug];
    const visualFloors = this._scaleFloors(floors);
    const h = visualFloors * 1.0;
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x6a5a3e, 0, 0.04, 0);
    this._box(g, 10.0, h,    8.5, 0x6a5a4a, 0, h/2,      0);
    this._box(g, 10.4, 0.4,  8.9, 0x4a3a2a, 0, h + 0.2,  0);
    this._box(g, 10.0, 0.6,  8.5, 0x3a2a1a, 0, h + 0.7,  0);
    this._box(g, 3.5, 4.5, 0.2, 0x2a1a0a, -3.0, 2.25, 4.35);
    this._box(g, 3.5, 4.5, 0.2, 0x2a1a0a,  3.0, 2.25, 4.35);
    for (let i = 0; i < 3; i++) {
      this._box(g, 3.3, 0.12, 0.12, 0x4a3a2a, -3.0, 0.6 + i*1.4, 4.35);
      this._box(g, 3.3, 0.12, 0.12, 0x4a3a2a,  3.0, 0.6 + i*1.4, 4.35);
    }
    this._box(g, 11.0, 0.3, 0.3, 0x6a5a4a, 0, 0.3, 0);
    this._lamp(g, -5, 4); this._lamp(g, 5, 4);
    this._register(g, slug, h + 0.7 + 0.3, 1.0, 1.0); // PipResource: multiplier=1.0, accessories=1.0
    this._windows.set(slug, []);
  }

  // ── ms-pip-transaction — cylindrical tower ───────────────────────────────
  _buildPipTransaction(slug) {
    const { floors } = this._repoMeta[slug];
    const visualFloors = this._scaleFloors(floors);
    const h = visualFloors * 1.2;
    const g = new THREE.Group();
    
    // Bright golden ground plane for visibility
    this._plane(g, 14, 14, 0xffdd77, 0, 0.04, 0);
    
    // Main building structure - bright amber/gold building
    this._box(g, 9.0, h, 8.0, 0xddaa55, 0, h/2, 0); // Bright amber body
    this._box(g, 9.4, 0.45, 8.4, 0xcc9944, 0, h + 0.22, 0); // Accent band
    this._box(g, 9.0, 0.8, 8.0, 0xbb8833, 0, h + 0.85, 0); // Roof cap
    
    // Windows with bright orange glow
    const wins = [];
    const rows = Math.max(2, Math.floor(floors * 0.5));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.7, 1.3, 0.2, 0xffddaa, -2.8 + col*2.8, 1.3 + row*(h/rows), 4.05));
      }
    }
    
    // Entrance door
    this._box(g, 2.0, 3.0, 0.2, 0xbb8833, 0, 1.5, 4.05);
    
    // Corner accent columns
    this._box(g, 0.5, h, 0.5, 0xeecc66, -4.2, h/2, -3.7);
    this._box(g, 0.5, h, 0.5, 0xeecc66, 4.2, h/2, -3.7);
    this._box(g, 0.5, h, 0.5, 0xeecc66, -4.2, h/2, 3.7);
    this._box(g, 0.5, h, 0.5, 0xeecc66, 4.2, h/2, 3.7);
    
    // Rooftop feature
    this._box(g, 2.5, 1.0, 2.5, 0xeecc66, 0, h + 1.35, 0);
    this._sphere(g, 0.5, 0xffaa22, 0, h + 2.0, 0);
    
    this._lamp(g, -5, 5); this._lamp(g, 5, 5);
    this._tree(g, 6, -5, 3.5, 2.2);
    this._register(g, slug, h + 2.2, 1.2, 2.2); // PipTransaction: multiplier=1.2, accessories=2.2
    this._windows.set(slug, wins);
  }

  // ── partner-webview-automation-test ──────────────────────────────────────
  _buildWebviewAutomation(slug) {
    const { floors } = this._repoMeta[slug];
    const visualFloors = this._scaleFloors(floors);
    const h = visualFloors * 1.0;
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x6a6a3e, 0, 0.04, 0);
    this._box(g, 9.0, h,    7.5, 0x6a6a5a, 0, h/2,      0);
    this._box(g, 9.4, 0.4,  7.9, 0x4a4a3a, 0, h + 0.2,  0);
    this._box(g, 9.0, 0.7,  7.5, 0x3a3a2a, 0, h + 0.75, 0);
    const wins = [];
    const rows = Math.max(2, Math.floor(floors * 0.45));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.6, 1.2, 0.2, 0xeeeebb, -2.5 + col*2.8, 1.2 + row*(h/rows), 3.8));
      }
    }
    this._box(g, 2.0, 3.0, 0.2, 0x3a3a2a, 0, 1.5, 3.8);
    this._cyl(g, 0.06, 0.08, 2.0, 0x888888, -2.0, h + 1.0, -2.0);
    this._cyl(g, 0.06, 0.08, 2.0, 0x888888,  2.0, h + 1.0, -2.0);
    this._sphere(g, 0.18, 0xff4444, -2.0, h + 2.15, -2.0);
    this._sphere(g, 0.18, 0x44ff44,  2.0, h + 2.15, -2.0);
    this._lamp(g, -4, -4); this._lamp(g, 4, -4);
    this._tree(g, -5, 5, 3.0, 2.0);
    this._register(g, slug, h + 0.75 + 0.35, 1.0, 1.1); // WebviewAutomation: multiplier=1.0, accessories=1.1
    this._windows.set(slug, wins);
  }

  // ── partnership-automation ───────────────────────────────────────────────
  _buildPartnershipAutomation(slug) {
    const { floors } = this._repoMeta[slug];
    const visualFloors = this._scaleFloors(floors);
    const h = visualFloors * 1.0;
    const g = new THREE.Group();
    this._plane(g, 14, 12, 0x5a6a3e, 0, 0.04, 0);
    this._box(g, 9.0, h,    7.5, 0x5a6a5a, 0, h/2,      0);
    this._box(g, 9.4, 0.4,  7.9, 0x3a4a3a, 0, h + 0.2,  0);
    this._box(g, 9.0, 0.7,  7.5, 0x2a3a2a, 0, h + 0.75, 0);
    const wins = [];
    const rows = Math.max(2, Math.floor(floors * 0.45));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 3; col++) {
        wins.push(this._box(g, 1.6, 1.2, 0.2, 0xccffcc, -2.5 + col*2.8, 1.2 + row*(h/rows), 3.8));
      }
    }
    this._box(g, 2.0, 3.2, 0.2, 0x2a3a2a, 0, 1.6, 3.8);
    this._cyl(g, 0.2, 0.25, 1.5, 0x668866, 0, h + 0.75, 0);
    this._box(g, 3.0, 0.3, 0.3, 0x558855, 0, h + 1.8, 0);
    this._sphere(g, 0.3, 0x77aa77, 1.5, h + 1.8, 0);
    this._lamp(g, -4, -4); this._lamp(g, 4, -4);
    this._register(g, slug, h + 0.75 + 0.35, 1.0, 1.1); // PartnershipAutomation: multiplier=1.0, accessories=1.1
    this._windows.set(slug, wins);
  }

  // ── ms-ginpay — sunset / maintenance ─────────────────────────────────────
  _buildGinpay(slug) {
    const { floors } = this._repoMeta[slug];
    const visualFloors = this._scaleFloors(floors);
    const h = visualFloors * 1.0;
    const g = new THREE.Group();
    
    // Bright yellow-orange ground plane for high visibility
    this._plane(g, 14, 12, 0xffdd33, 0, 0.04, 0);
    
    // Main building structure - bright orange/yellow for maintenance visibility
    this._box(g, 8.5, h, 7.0, 0xff9933, 0, h/2, 0); // Bright orange main body
    this._box(g, 8.9, 0.35, 7.4, 0xffaa44, 0, h + 0.17, 0); // Bright accent band
    this._box(g, 8.5, 0.55, 7.0, 0xff8800, 0, h + 0.62, 0); // Bright roof cap
    
    // Warning stripes on corners - black & yellow for caution
    this._box(g, 0.5, h, 0.5, 0xffcc00, -4.0, h/2, -3.25);
    this._box(g, 0.5, h, 0.5, 0x000000, -4.0, h/2 + 0.5, -3.25);
    this._box(g, 0.5, h, 0.5, 0xffcc00,  4.0, h/2,  3.25);
    this._box(g, 0.5, h, 0.5, 0x000000,  4.0, h/2 + 0.5,  3.25);
    
    // Large warning signs - bright red with yellow borders
    this._box(g, 3.5, 2.5, 0.25, 0xff0000, -2.0, h/2, 3.55);
    this._box(g, 3.2, 2.2, 0.25, 0xffcc00, -2.0, h/2, 3.58);
    this._box(g, 3.5, 2.5, 0.25, 0xff0000,  2.0, h/2, 3.55);
    this._box(g, 3.2, 2.2, 0.25, 0xffcc00,  2.0, h/2, 3.58);
    
    // Hazard barrier posts around perimeter - highly visible
    const hazardPosts = [
      [-5,-5],[ 0,-5],[ 5,-5],
      [-5, 5],[ 0, 5],[ 5, 5],
      [-5,-2],[-5, 2],
      [ 5,-2],[ 5, 2],
    ];
    hazardPosts.forEach(([px, pz], idx) => {
      this._cyl(g, 0.12, 0.14, 1.5, idx % 2 === 0 ? 0xffcc00 : 0x222222, px, 0.75, pz);
    });
    
    // "MAINTENANCE ONLY" sign attached to building front - compact yellow/red sign
    this._box(g, 4.0, 1.2, 0.12, 0xffcc00, 0, h * 0.7, 3.56); // Yellow background
    this._box(g, 3.8, 1.0, 0.14, 0xff0000, 0, h * 0.7, 3.58); // Red inner panel
    
    // Add CSS2D text label for "MAINTENANCE ONLY" - smaller and attached to building
    const maintenanceDiv = document.createElement('div');
    maintenanceDiv.style.cssText = `
      background: #ffcc00;
      color: #000;
      padding: 4px 10px;
      border: 2px solid #ff0000;
      border-radius: 3px;
      font-family: 'Arial Black', sans-serif;
      font-weight: 900;
      font-size: 10px;
      text-align: center;
      letter-spacing: 0.5px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.5);
      pointer-events: none;
      user-select: none;
    `;
    maintenanceDiv.textContent = 'MAINTENANCE ONLY';
    const maintenanceLabel = new CSS2DObject(maintenanceDiv);
    maintenanceLabel.position.set(0, h * 0.7, 3.7); // Attached to front of building
    g.add(maintenanceLabel);
    
    this._register(g, slug, h + 0.62, 1.0, 0.62);
    this._windows.set(slug, []);
  }

  // ── production-support / EOC ─────────────────────────────────────────────
  // EOC always uses its fixed floors (14) — the building geometry is hand-crafted.
  _buildEOC(slug) {
    const g = new THREE.Group();
    this._plane(g, 16, 16, 0x888888, 0, 0.02, 0);
    [[-8,0],[8,0],[0,-8],[0,8]].forEach(([kx,kz]) => {
      this._box(g, 16, 0.18, 0.25, 0xcc1111, kx, 0.09, kz);
    });
    this._box(g, 10, 4.5, 10, 0xdddddd, 0, 2.25, 0);
    this._box(g, 10.1, 0.55, 10.1, 0xcc1111, 0, 0.9, 0);
    this._box(g, 8.5, 4.0, 8.5, 0xe8e8e8, 0, 6.5, 0);
    this._box(g, 9.0, 0.45, 9.0, 0xcc1111, 0, 4.73, 0);
    this._box(g, 7.0, 3.0, 7.0, 0x1a3a5a, 0, 10.0, 0);
    this._box(g, 6.0, 1.8, 0.12, 0x55aaff, 0,     10.1, -3.56);
    this._box(g, 6.0, 1.8, 0.12, 0x55aaff, 0,     10.1,  3.56);
    this._box(g, 0.12, 1.8, 6.0, 0x55aaff, -3.56, 10.1,  0);
    this._box(g, 0.12, 1.8, 6.0, 0x55aaff,  3.56, 10.1,  0);
    this._box(g, 7.2, 0.4, 7.2, 0xcc1111, 0, 11.7, 0);
    this._box(g, 4.5, 1.8, 4.5, 0xaaaaaa, 0, 13.05, 0);
    this._cyl(g, 0.12, 0.08, 6.5, 0x888888, 0, 15.15, 0);
    this._cyl(g, 0.06, 0.04, 1.8, 0xcc1111, 0, 18.25, 0);
    this._box(g, 5.0, 0.1, 0.1, 0x888888, 0, 14.2, 0);
    this._box(g, 0.1, 0.1, 5.0, 0x888888, 0, 14.2, 0);
    this._box(g, 4.0, 0.1, 0.1, 0x888888, 0, 15.8, 0);
    this._box(g, 0.1, 0.1, 4.0, 0x888888, 0, 15.8, 0);
    this._cyl(g, 0.07, 0.07, 0.8, 0xcccccc, -2.6, 13.2, -1.0);
    this._box(g, 1.4, 1.4, 0.15, 0xdddddd, -3.1, 13.6, -1.0);
    this._box(g, 0.3, 0.3, 0.08, 0xcc1111, -3.1, 13.6, -1.0);
    this._cyl(g, 0.07, 0.07, 0.8, 0xcccccc,  2.6, 13.2,  1.0);
    this._box(g, 1.4, 1.4, 0.15, 0xdddddd,  3.1, 13.6,  1.0);
    this._box(g, 0.3, 0.3, 0.08, 0xcc1111,  3.1, 13.6,  1.0);
    this._box(g, 5.0, 0.35, 1.4, 0xee0000, 0, 12.12, 0);
    this._box(g, 1.4, 0.35, 5.0, 0xee0000, 0, 12.12, 0);
    this._box(g, 4.2, 0.36, 0.85, 0xffffff, 0, 12.14, 0);
    this._box(g, 0.85, 0.36, 4.2, 0xffffff, 0, 12.14, 0);
    [[-2.8,-2.8],[2.8,-2.8],[-2.8,2.8],[2.8,2.8]].forEach(([bx,bz]) => {
      this._cyl(g, 0.14, 0.14, 0.6, 0x333333, bx, 12.25, bz);
      this._cyl(g, 0.18, 0.18, 0.22, 0xff2200, bx, 12.75, bz);
    });
    const GF_Z = -5.06;
    this._box(g, 1.7, 1.9, 0.08, 0xffffff, -3.8, 2.4, GF_Z);
    this._box(g, 1.4, 1.6, 0.1,  0x55aaff, -3.8, 2.4, GF_Z);
    this._box(g, 1.7, 1.9, 0.08, 0xffffff, -1.5, 2.4, GF_Z);
    this._box(g, 1.4, 1.6, 0.1,  0x55aaff, -1.5, 2.4, GF_Z);
    this._box(g, 1.7, 1.9, 0.08, 0xffffff,  1.5, 2.4, GF_Z);
    this._box(g, 1.4, 1.6, 0.1,  0x55aaff,  1.5, 2.4, GF_Z);
    this._box(g, 1.7, 1.9, 0.08, 0xffffff,  3.8, 2.4, GF_Z);
    this._box(g, 1.4, 1.6, 0.1,  0x55aaff,  3.8, 2.4, GF_Z);
    this._box(g, 2.6, 3.4, 0.08, 0xffffff, 0, 1.7,    GF_Z);
    this._box(g, 2.2, 3.0, 0.1,  0x111111, 0, 1.6,    GF_Z);
    this._box(g, 0.9, 2.6, 0.11, 0x223355, -0.55, 1.6, GF_Z);
    this._box(g, 0.9, 2.6, 0.11, 0x223355,  0.55, 1.6, GF_Z);
    this._box(g, 3.0, 1.4, 1.8, 0x555555, 7.0, 0.7, -2.0);
    this._box(g, 3.0, 1.4, 1.8, 0x555555, 7.0, 0.7,  2.0);
    this._cyl(g, 0.16, 0.14, 2.2, 0x555555, 8.8, 1.1, -1.0);
    this._cyl(g, 0.16, 0.14, 2.0, 0x555555, 8.8, 1.0,  1.0);
    [-3.5,-1.2,1.2,3.5].forEach(bx => {
      this._cyl(g, 0.18, 0.18, 1.1, 0xcc1111, bx, 0.55, -6.2);
      this._cyl(g, 0.22, 0.22, 0.18, 0xffcc00, bx, 1.2, -6.2);
    });
    this._register(g, slug, 19.15, 0.01, 19.15); // EOC: fixed height building
    this._windows.set(slug, []);
  }
}
