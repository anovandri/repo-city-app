import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { WAYPOINTS, ROAD_GRAPH, SLUG_TO_WP } from '../constants/waypoints.js';

const PI = Math.PI;

// Engineer shirt colours (15-entry palette from prototype)
const ENG_SHIRTS = [
  0xff4444, 0x44aaff, 0xffaa00, 0x44cc66, 0xcc44cc,
  0xff8800, 0x00ccaa, 0xee3366, 0x99cc00, 0x5588ff,
  0xff6655, 0x33bbdd, 0xdd8800, 0x55dd77, 0xbb55bb,
];

// Hat colours for engineers (10-entry palette)
const HAT_COLORS = [
  0xffdd00, 0xffffff, 0xff6600, 0x00dddd, 0xff88cc,
  0xaaffaa, 0xff99ff, 0xffcc44, 0x44ffee, 0xccccff,
];

// Caretakers only patrol between plaza (0) and EOC approach (53)
const CARETAKER_WPS = [0, 53];

export class DeveloperManager {
  /**
   * @param {THREE.Scene} scene
   * @param {Array<{displayName:string, role:string, gender:string}>} workers
   *   Live worker data from GET /api/workers. If empty, no developers are spawned.
   */
  constructor(scene, workers = []) {
    this._scene    = scene;
    this._devs     = [];
    this._geoCache = new Map();

    // Normalise from API format to internal format.
    // API: { displayName, role: 'ENGINEER', gender: 'MALE' }
    // Internal: { name, role: 'engineer', gender: 'male' }
    const source = workers.map(w => ({
      name:   w.displayName,
      gitlab: w.displayName,
      role:   (w.role   ?? '').toLowerCase(),
      gender: (w.gender ?? 'male').toLowerCase(),
    }));

    this._buildAll(source);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /** Call once per animation frame. @param {number} delta seconds */
  update(delta) {
    this._devs.forEach(dev => {
      if (dev.role === 'leader') return;
      this._walkDev(dev, delta);
      this._animateLimbs(dev, delta);
    });
  }

  /** Find dev by name (case-insensitive partial). */
  findByName(name) {
    const lower = name.toLowerCase();
    return this._devs.find(d => d.data.name.toLowerCase().includes(lower));
  }

  /**
   * Dispatch a developer toward a building entrance, then invoke onArrived.
   * Matches the prototype's fireCommitEvent / fireMREvent → arrive → activate pattern.
   *
   * @param {string}   actorName  displayName from mutation (partial match OK)
   * @param {string}   repoSlug   slug string used to look up entrance waypoint
   * @param {()=>void} onArrived  callback fired once the dev reaches the entrance
   */
  dispatch(actorName, repoSlug, onArrived) {
    const wpIdx = SLUG_TO_WP[repoSlug];
    if (wpIdx === undefined) {
      // Unknown repo — fire immediately so the beam still appears
      onArrived?.();
      return;
    }

    // Find the dev by name, or fall back to a random non-leader non-working dev
    let dev = actorName ? this.findByName(actorName) : null;
    if (!dev || dev.role === 'leader' || dev._dispatched) {
      const eligible = this._devs.filter(d => d.role !== 'leader' && !d._dispatched && !d._working);
      dev = eligible.length > 0
        ? eligible[Math.floor(Math.random() * eligible.length)]
        : null;
    }
    if (!dev) {
      onArrived?.();
      return;
    }

    // BFS full path from current waypoint to destination
    const path = this._bfsPath(dev.wpIdx, wpIdx);
    if (!path || path.length < 2) {
      // Already there or unreachable — fire immediately
      onArrived?.();
      return;
    }

    // Show task bubble above the dev's head while walking
    this._showTaskBubble(dev, hint);

    // Mark as dispatched so they won't be double-dispatched by another event
    dev._dispatched   = true;
    dev._onArrived    = onArrived;
    dev._destWpIdx    = wpIdx;
    dev._path         = path.slice(1); // remaining hops (excluding current wp)
    dev.nextWpIdx     = dev._path.shift();
  }

  dispose() {
    // Remove every developer group (and their CSS2D labels) from the scene
    this._devs.forEach(dev => {
      // Remove CSS2DObject labels so their DOM elements are detached
      dev.group.traverse(child => {
        if (child.isCSS2DObject) {
          child.element?.remove();
          child.parent?.remove(child);
        }
      });
      this._scene.remove(dev.group);
    });
    this._devs = [];
    this._geoCache.forEach(g => g.dispose());
    this._geoCache.clear();
  }

  // ── Geometry cache ───────────────────────────────────────────────────────

  _geo(w, h, d) {
    const key = `${w}:${h}:${d}`;
    if (!this._geoCache.has(key)) {
      this._geoCache.set(key, new THREE.BoxGeometry(w, h, d));
    }
    return this._geoCache.get(key);
  }

  _cylGeo(rt, rb, h, segs = 6) {
    const key = `cyl:${rt}:${rb}:${h}:${segs}`;
    if (!this._geoCache.has(key)) {
      this._geoCache.set(key, new THREE.CylinderGeometry(rt, rb, h, segs));
    }
    return this._geoCache.get(key);
  }

  _mat(color, emissive = 0, emissiveIntensity = 0) {
    return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity });
  }

  // ── Spawn all developers ─────────────────────────────────────────────────

  _buildAll(people) {
    let engIdx = 0; // separate counter for engineer shirt/hat cycling

    people.forEach((person, idx) => {
      const isLeader    = person.role === 'leader';
      const isCaretaker = person.role === 'caretaker';
      const isEngineer  = !isLeader && !isCaretaker;
      const isFemale    = person.gender === 'female';

      const scale = isLeader ? 1.25 : 1.0;

      // Determine shirt/hat/leg/skin colours
      let shirtColor, legColor, hatColor;
      const skinColor = isFemale ? 0xf7c8a0 : 0xf5c07a;

      if (isLeader) {
        shirtColor = 0xddaa00;
        legColor   = 0x222255;
        hatColor   = 0xffcc00;
      } else if (isCaretaker) {
        shirtColor = isFemale ? 0x44bb66 : 0x228844;
        legColor   = isFemale ? 0xdd8888 : 0x2255cc;
        hatColor   = 0x88dd88;
      } else {
        shirtColor = ENG_SHIRTS[engIdx % 15];
        legColor   = isFemale ? 0xdd8888 : 0x2255cc;
        hatColor   = HAT_COLORS[engIdx % 10];
        engIdx++;
      }

      const group = isFemale
        ? this._makeFemale(person, scale, skinColor, shirtColor, legColor, hatColor, isLeader)
        : this._makeMale  (person, scale, skinColor, shirtColor, legColor, hatColor, isLeader, isCaretaker);

      group.scale.setScalar(scale);

      // Navigation state
      let startWp;
      if (isLeader) {
        startWp = 0;
      } else if (isCaretaker) {
        startWp = CARETAKER_WPS[idx % 2];
      } else {
        startWp = Math.floor(Math.random() * WAYPOINTS.length);
      }

      const speed = isLeader ? 0
        : isCaretaker ? (0.020 + (idx % 3) * 0.001)
        : (0.032 + (engIdx % 8) * 0.002);

      const dev = {
        data:      person,
        role:      person.role,
        group,
        wpIdx:     startWp,
        nextWpIdx: null,
        speed,
        limbTime:  Math.random() * PI * 2,
      };

      if (isLeader) {
        // Seated on south bench facing north
        group.position.set(0, 0.18, -6);
        group.rotation.y = PI;
        // Bend leader legs forward
        const { legL, legR, armL, armR } = group.userData;
        if (legL) { legL.rotation.x = -PI / 2; legL.position.set(-0.05, 0.0, 0.09); }
        if (legR) { legR.rotation.x = -PI / 2; legR.position.set( 0.05, 0.0, 0.09); }
        if (armL) armL.rotation.x = 0.5;
        if (armR) armR.rotation.x = 0.5;
      } else {
        const wp = WAYPOINTS[startWp];
        group.position.set(wp.x, 0, wp.z);
        dev.nextWpIdx = this._pickNext(dev);
      }

      this._scene.add(group);
      this._devs.push(dev);
    });
  }

  // ── Character construction ───────────────────────────────────────────────

  _makeMale(person, scale, skinColor, shirtColor, legColor, hatColor, isLeader, isCaretaker) {
    const g = new THREE.Group();

    // Legs
    const legMat  = this._mat(legColor);
    const legGeom = this._geo(0.09, 0.18, 0.09);
    const lL = new THREE.Mesh(legGeom, legMat);
    lL.position.set(-0.05, 0.09, 0);
    lL.castShadow = true;
    const lR = new THREE.Mesh(legGeom, legMat);
    lR.position.set( 0.05, 0.09, 0);
    lR.castShadow = true;
    g.add(lL, lR);

    // Torso
    const torsoW = isLeader ? 0.23 : 0.2;
    const torsoH = isLeader ? 0.22 : 0.2;
    const torso = new THREE.Mesh(this._geo(torsoW, torsoH, 0.11), this._mat(shirtColor));
    torso.position.set(0, 0.28, 0);
    torso.castShadow = true;
    g.add(torso);

    // Arms
    const armMat  = this._mat(shirtColor);
    const armGeom = this._geo(0.07, 0.17, 0.07);
    const aL = new THREE.Mesh(armGeom, armMat);
    aL.position.set(-0.14, 0.27, 0);
    aL.castShadow = true;
    const aR = new THREE.Mesh(armGeom, armMat);
    aR.position.set( 0.14, 0.27, 0);
    aR.castShadow = true;
    g.add(aL, aR);

    // Head
    const head = new THREE.Mesh(this._geo(0.17, 0.17, 0.17), this._mat(skinColor));
    head.position.set(0, 0.46, 0);
    head.castShadow = true;
    g.add(head);

    // Hat / crown
    if (isLeader) {
      const brim = new THREE.Mesh(this._geo(0.23, 0.05, 0.23), this._mat(hatColor));
      brim.position.set(0, 0.565, 0);
      g.add(brim);
      const spike = this._geo(0.05, 0.10, 0.05);
      const spikeMat = this._mat(hatColor);
      [-0.07, 0, 0.07].forEach(sx => {
        const s = new THREE.Mesh(spike, spikeMat);
        s.position.set(sx, 0.635, 0);
        g.add(s);
      });
      const gem = new THREE.Mesh(this._geo(0.04, 0.04, 0.04), this._mat(0xff4444));
      gem.position.set(0, 0.695, -0.06);
      g.add(gem);
    } else {
      const cap  = new THREE.Mesh(this._geo(0.2, 0.07, 0.2), this._mat(hatColor));
      cap.position.set(0, 0.565, 0);
      g.add(cap);
      const brim = new THREE.Mesh(this._geo(0.24, 0.03, 0.12), this._mat(hatColor));
      brim.position.set(0, 0.538, -0.06);
      g.add(brim);
    }

    // Store limb refs for animation
    g.userData.legL = lL;
    g.userData.legR = lR;
    g.userData.armL = aL;
    g.userData.armR = aR;

    this._attachLabel(g, person, isLeader, false, scale);
    return g;
  }

  _makeFemale(person, scale, skinColor, shirtColor, legColor, hatColor, isLeader) {
    const g = new THREE.Group();

    // Skirt / dress bottom
    const skirt = new THREE.Mesh(this._geo(0.22, 0.2, 0.14), this._mat(legColor));
    skirt.position.set(0, 0.1, 0);
    skirt.castShadow = true;
    g.add(skirt);

    // Shoes
    const shoeMat  = this._mat(0x4a3010);
    const shoeGeom = this._geo(0.07, 0.06, 0.09);
    const shL = new THREE.Mesh(shoeGeom, shoeMat);
    shL.position.set(-0.05, 0.03, 0);
    const shR = new THREE.Mesh(shoeGeom, shoeMat);
    shR.position.set( 0.05, 0.03, 0);
    g.add(shL, shR);

    // Torso
    const torso = new THREE.Mesh(this._geo(0.19, 0.18, 0.10), this._mat(shirtColor));
    torso.position.set(0, 0.29, 0);
    torso.castShadow = true;
    g.add(torso);

    // Arms
    const armMat  = this._mat(shirtColor);
    const armGeom = this._geo(0.06, 0.15, 0.06);
    const aL = new THREE.Mesh(armGeom, armMat);
    aL.position.set(-0.13, 0.28, 0);
    aL.castShadow = true;
    const aR = new THREE.Mesh(armGeom, armMat);
    aR.position.set( 0.13, 0.28, 0);
    aR.castShadow = true;
    g.add(aL, aR);

    // Head
    const head = new THREE.Mesh(this._geo(0.16, 0.16, 0.16), this._mat(skinColor));
    head.position.set(0, 0.46, 0);
    head.castShadow = true;
    g.add(head);

    // Hair bun + band
    const bun = new THREE.Mesh(this._geo(0.09, 0.09, 0.09), this._mat(0x3a2010));
    bun.position.set(0, 0.57, -0.03);
    g.add(bun);
    const band = new THREE.Mesh(this._geo(0.17, 0.04, 0.04), this._mat(0xee6699));
    band.position.set(0, 0.545, -0.03);
    g.add(band);

    // Dummy leg refs (skirt is static, no walking bend needed but keep symmetry)
    g.userData.legL = null;
    g.userData.legR = null;
    g.userData.armL = aL;
    g.userData.armR = aR;

    this._attachLabel(g, person, isLeader, true, scale);
    return g;
  }

  _attachLabel(group, person, isLeader, isFemale, scale) {
    const labelY = isLeader ? 0.88 : isFemale ? 0.78 : 0.72;
    const prefix = isLeader ? '👑 ' : '';
    const div = document.createElement('div');
    div.className = 'dev-label';
    div.classList.add(`role-${person.role}`);
    if (isFemale) div.classList.add('gender-female');
    div.textContent = prefix + person.name;
    const label = new CSS2DObject(div);
    // position is in un-scaled local space; divide by scale so CSS2D ends up at right world height
    label.position.set(0, labelY / scale, 0);
    group.add(label);
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  _pickNext(dev) {
    if (dev.role === 'caretaker') {
      return dev.wpIdx === CARETAKER_WPS[0] ? CARETAKER_WPS[1] : CARETAKER_WPS[0];
    }
    const neighbours = ROAD_GRAPH[dev.wpIdx];
    if (!neighbours || neighbours.length === 0) return dev.wpIdx;
    return neighbours[Math.floor(Math.random() * neighbours.length)];
  }

  _walkDev(dev, delta) {
    if (dev._working) return;       // freeze at building while in typing pose
    if (dev.nextWpIdx === null) return;

    const target = WAYPOINTS[dev.nextWpIdx];
    if (!target) return;

    // Direction vector from current position toward target (Y ignored)
    const dx = target.x - dev.group.position.x;
    const dz = target.z - dev.group.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.25) {
      // Snap to waypoint
      dev.group.position.set(target.x, 0, target.z);
      dev.wpIdx = dev.nextWpIdx;

      // ── Dispatched arrival check ──────────────────────────────
      if (dev._dispatched && dev.wpIdx === dev._destWpIdx) {
        dev._dispatched = false;
        dev._path       = null;
        const cb = dev._onArrived;
        dev._onArrived = null;
        dev._destWpIdx = null;

        // Strike a brief "working" pose (arms raised), then release after 7 s
        this._setWorking(dev);
        setTimeout(() => this._releaseWorking(dev), 7000);

        // Fire the beam callback immediately on arrival
        cb?.();
      } else if (dev._dispatched && dev._path && dev._path.length > 0) {
        // Follow pre-computed BFS path hop by hop
        dev.nextWpIdx = dev._path.shift();
      } else if (dev._dispatched) {
        // Path exhausted but not at dest yet — re-route (fallback)
        dev.nextWpIdx = this._routeToward(dev.wpIdx, dev._destWpIdx);
      } else {
        dev.nextWpIdx = this._pickNext(dev);
      }
    } else {
      // Move dev.speed world-units per frame (prototype uses raw speed per frame
      // with requestAnimationFrame ~60fps; we scale by delta*60 to stay frame-rate
      // independent at the same perceived speed)
      const step = dev.speed * delta * 60;
      const inv  = step / dist;
      dev.group.position.x += dx * inv;
      dev.group.position.z += dz * inv;
      dev.group.rotation.y  = Math.atan2(dx, dz);
    }
  }

  _animateLimbs(dev, delta) {
    // If working (arrived at building), do typing-tap animation
    if (dev._working) {
      dev.limbTime += delta * 8;
      const tap = Math.sin(dev.limbTime) * 0.12;
      const { armL, armR, legL, legR } = dev.group.userData;
      if (armL) armL.rotation.x = -0.6 + tap;
      if (armR) armR.rotation.x = -0.6 - tap;
      if (legL) legL.rotation.x = 0;
      if (legR) legR.rotation.x = 0;
      return;
    }
    dev.limbTime += delta * 6; // matches prototype's sin(t * 6 + phase)
    const swing = Math.sin(dev.limbTime) * 0.4;
    const { armL, armR, legL, legR } = dev.group.userData;
    if (legL) legL.rotation.x =  swing;
    if (legR) legR.rotation.x = -swing;
    if (armL) armL.rotation.x = -swing * 0.75;
    if (armR) armR.rotation.x =  swing * 0.75;
  }

  /** Freeze limbs in "typing at desk" pose */
  _setWorking(dev) {
    dev._working = true;
    const { armL, armR, legL, legR } = dev.group.userData;
    if (armL) armL.rotation.x = -0.6;
    if (armR) armR.rotation.x = -0.6;
    if (legL) legL.rotation.x = 0;
    if (legR) legR.rotation.x = 0;
  }

  /** Release working state and resume normal walking */
  _releaseWorking(dev) {
    dev._working = false;
    dev.nextWpIdx = this._pickNext(dev);
  }

  /**
   * BFS shortest path from startIdx to destIdx.
   * Returns the full array of waypoint indices [startIdx, …, destIdx],
   * or null if unreachable.
   */
  _bfsPath(startIdx, destIdx) {
    if (startIdx === destIdx) return [startIdx];
    const visited = new Set([startIdx]);
    const queue   = [[startIdx]];   // each entry is a path array
    while (queue.length > 0) {
      const path = queue.shift();
      const node = path[path.length - 1];
      for (const neighbour of (ROAD_GRAPH[node] ?? [])) {
        if (visited.has(neighbour)) continue;
        const newPath = [...path, neighbour];
        if (neighbour === destIdx) return newPath;
        visited.add(neighbour);
        queue.push(newPath);
      }
    }
    return null; // unreachable
  }

  /**
   * Greedy one-hop fallback (used only if BFS path is exhausted unexpectedly).
   */
  _routeToward(fromIdx, destIdx) {
    const neighbours = ROAD_GRAPH[fromIdx];
    if (!neighbours || neighbours.length === 0) return fromIdx;
    const dest = WAYPOINTS[destIdx];
    let best = neighbours[0];
    let bestDist = WAYPOINTS[best].distanceTo(dest);
    for (let i = 1; i < neighbours.length; i++) {
      const d = WAYPOINTS[neighbours[i]].distanceTo(dest);
      if (d < bestDist) { bestDist = d; best = neighbours[i]; }
    }
    return best;
  }
}
