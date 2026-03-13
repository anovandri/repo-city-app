import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { WeatherManager } from './WeatherManager.js';

/**
 * SceneManager — owns the Three.js renderer, camera, CSS2D renderer,
 * lights, fog, orbit controls and all static scene geometry.
 * All values are taken directly from the prototype (docs/prototype/index.html).
 */
export class SceneManager {
  constructor(canvas) {
    this._canvas = canvas;
    this._isNightMode = false;
    this._initScene();
    this._initRenderers(canvas);
    this._initCamera();
    this._initLights();
    this._initEnvironment();
    this._initControls();
    this._initWeather();
    this._bindResize();
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get scene()    { return this._scene; }
  get camera()   { return this._camera; }
  get renderer() { return this._renderer; }
  get css2d()    { return this._css2d; }
  get controls() { return this._controls; }
  get isNightMode() { return this._isNightMode; }
  get weatherManager() { return this._weatherManager; }
  get cameraMode() { return this._cameraMode; }

  // ── Init ─────────────────────────────────────────────────────────────────

  _initScene() {
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x87ceeb);
    this._scene.fog = new THREE.Fog(0x87ceeb, 80, 220);
  }

  _initRenderers(canvas) {
    this._renderer = new THREE.WebGLRenderer({ 
      canvas, 
      antialias: true,
      powerPreference: 'high-performance', // Performance: GPU optimization
      stencil: false, // Performance: disable stencil buffer (not used)
    });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.0;

    // CSS2D renderer for floating labels — overlaid on the WebGL canvas
    this._css2d = new CSS2DRenderer();
    this._css2d.setSize(canvas.clientWidth, canvas.clientHeight);
    this._css2d.domElement.style.position = 'absolute';
    this._css2d.domElement.style.top = '0';
    this._css2d.domElement.style.left = '0';
    this._css2d.domElement.style.pointerEvents = 'none';
    canvas.parentElement.appendChild(this._css2d.domElement);
  }

  _initCamera() {
    const w = this._canvas.clientWidth;
    const h = this._canvas.clientHeight;
    this._camera = new THREE.PerspectiveCamera(60, w / h, 0.5, 600);
    this._camera.position.set(55, 30, 65);
  }

  _initLights() {
    // Ambient fill — prototype: AmbientLight(0xffffff, 0.6)
    this._ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this._scene.add(this._ambient);

    // Sun — prototype: DirectionalLight(0xfffbe0, 1.2) at (15,25,15)
    this._sun = new THREE.DirectionalLight(0xfffbe0, 1.2);
    this._sun.position.set(15, 25, 15);
    this._sun.castShadow = true;
    this._sun.shadow.mapSize.set(2048, 2048);
    this._sun.shadow.camera.near = 1;
    this._sun.shadow.camera.far = 300;
    this._sun.shadow.camera.left = -120;
    this._sun.shadow.camera.right = 120;
    this._sun.shadow.camera.top = 120;
    this._sun.shadow.camera.bottom = -120;
    this._sun.shadow.bias = -0.001;
    this._scene.add(this._sun);
    
    // Collect all lamp lights for night mode toggling
    this._lampLights = [];
  }

  _initEnvironment() {
    const s = this._scene;

    // ── Helpers matching prototype ──────────────────────────────
    const mat   = c => new THREE.MeshLambertMaterial({ color: c });
    const plane = (w, d, color, x, y, z, ry = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = ry;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      s.add(m);
      return m;
    };
    const box = (w, h, d, color, x, y, z, ry = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.castShadow = true;
      m.receiveShadow = true;
      s.add(m);
      return m;
    };
    const cyl = (rt, rb, h, color, x, y, z) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 8), mat(color)); // Performance: 16→8 segments
      m.position.set(x, y, z);
      m.castShadow = false; // Performance: decorations don't need shadows
      s.add(m);
      return m;
    };
    const sphere = (r, color, x, y, z) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat(color)); // Performance: 12,8→8,6 segments
      m.position.set(x, y, z);
      m.castShadow = false; // Performance: decorations don't need shadows
      s.add(m);
      return m;
    };

    // ── Phase 2: Instanced Meshes - Data Collection ──────────────
    // Collect instance data for trees, benches, lamps
    const treeInstances = [];
    const benchInstances = [];
    const lampInstances = [];
    
    const tree = (x, z, h = 1.8, r = 1.1) => {
      treeInstances.push({ x, z, h, r });
    };
    const bush = (x, z) => {
      sphere(0.55, 0x3aaa3a, x, 0.4, z);
      sphere(0.4,  0x2e8c2e, x + 0.4, 0.5, z + 0.1);
      sphere(0.38, 0x36a036, x - 0.35, 0.45, z - 0.1);
    };
    const bench = (x, z, ry = 0) => {
      benchInstances.push({ x, z, ry });
    };
    const lamp = (x, z) => {
      lampInstances.push({ x, z });
    };
    const coffeeCart = (x, z, ry = 0) => {
      const g = new THREE.Group();
      // Cart base
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.7), mat(0x8b4513));
      base.position.set(0, 0.45, 0);
      base.castShadow = false; // Performance: small decorations don't need shadows
      g.add(base);
      // Counter top
      const counter = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.75), mat(0xa0522d));
      counter.position.set(0, 0.94, 0);
      counter.castShadow = false; // Performance: small decorations don't need shadows
      g.add(counter);
      // Canopy
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.9), mat(0xff6b6b));
      canopy.position.set(0, 1.4, 0);
      canopy.castShadow = false; // Performance: small decorations don't need shadows
      g.add(canopy);
      // Canopy poles
      [[-0.55, 0.4], [0.55, 0.4], [-0.55, -0.4], [0.55, -0.4]].forEach(([px, pz]) => {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5), mat(0x666666));
        pole.position.set(px, 1.15, pz);
        g.add(pole);
      });
      // Coffee machine (decorative box)
      const machine = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.3), mat(0x333333));
      machine.position.set(-0.3, 1.18, 0);
      g.add(machine);
      // Coffee cups (small cylinders)
      [[-0.15, 0.05], [0.15, 0.05], [0.15, -0.15]].forEach(([cx, cz]) => {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.08), mat(0xffffff));
        cup.position.set(cx, 1.02, cz);
        g.add(cup);
      });
      // Sign board
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.02), mat(0xf4e4c1));
      sign.position.set(0, 1.15, -0.38);
      g.add(sign);
      // Wheels
      [[-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]].forEach(([wx, wz]) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05), mat(0x222222));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.08, wz);
        g.add(wheel);
      });
      g.rotation.y = ry;
      g.position.set(x, 0, z);
      s.add(g);
    };
    const fountain = (x, z) => {
      // Base platform
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.15), mat(0x999999));
      base.position.set(x, 0.08, z);
      base.castShadow = false; // Performance: fountain decorations don't need shadows
      s.add(base);
      // Water basin
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.9, 0.25), mat(0x8899aa));
      basin.position.set(x, 0.23, z);
      basin.castShadow = false; // Performance: fountain decorations don't need shadows
      s.add(basin);
      // Water surface (animated via rotation)
      const waterMat = new THREE.MeshLambertMaterial({ 
        color: 0x5599cc, 
        transparent: true, 
        opacity: 0.7 
      });
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.02), waterMat);
      water.position.set(x, 0.36, z);
      water.userData.isWater = true; // Mark for animation
      s.add(water);
      // Center pillar
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.4), mat(0xaaaaaa));
      pillar.position.set(x, 0.55, z);
      pillar.castShadow = false; // Performance: fountain decorations don't need shadows
      s.add(pillar);
      // Top ornament
      const ornament = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(0xcccccc));
      ornament.position.set(x, 0.82, z);
      ornament.castShadow = false; // Performance: fountain decorations don't need shadows
      s.add(ornament);
      // Water jets (small spheres for visual effect)
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const jetX = x + Math.cos(angle) * 0.5;
        const jetZ = z + Math.sin(angle) * 0.5;
        const jet = new THREE.Mesh(new THREE.SphereGeometry(0.05), waterMat);
        jet.position.set(jetX, 0.4, jetZ);
        s.add(jet);
      }
    };
    const flower = (x, z, color = 0xff69b4) => {
      // Stem
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.15), 
        mat(0x2d5016)
      );
      stem.position.set(x, 0.08, z);
      s.add(stem);
      // Flower head (small sphere)
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), mat(color));
      head.position.set(x, 0.17, z);
      s.add(head);
    };
    const rock = (x, z, scale = 1) => {
      const rockGeo = new THREE.DodecahedronGeometry(0.15 * scale, 0);
      const rock = new THREE.Mesh(rockGeo, mat(0x777777));
      rock.position.set(x, 0.08 * scale, z);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = false; // Performance: small decorations don't need shadows
      s.add(rock);
    };

    // ── Ground — prototype: plane(200,200,0x5aaa3c,0,0,0) ──────
    plane(200, 200, 0x5aaa3c, 0, 0, 0);

    // ── District ground tiles ────────────────────────────────────
    // ms-partner: plane(72,60,0x3d7a5e,-44,0.01,-34)
    plane(72, 60, 0x3d7a5e, -44, 0.01, -34);
    // ms-pip: plane(32,56,0x3a6a9a,36,0.01,-42)  — expanded for 3 rows
    plane(32, 56, 0x3a6a9a, 36, 0.01, -42);
    // SW park district ground
    plane(52, 36, 0x4ab84a, -38, 0.01, 20);

    // ── Park grid — 16-unit tiles, LINE_W=0.12 ──────────────────
    const TILE = 16, HALF = 80, LINE_W = 0.12, LINE_H = 0.012;
    for (let x = -HALF; x <= HALF; x += TILE) {
      box(LINE_W, LINE_H, HALF * 2, 0x4a9430, x, LINE_H / 2, 0);
    }
    for (let z = -HALF; z <= HALF; z += TILE) {
      box(HALF * 2, LINE_H, LINE_W, 0x4a9430, 0, LINE_H / 2, z);
    }

    // ── Cross + ring roads (tan 0xc8a97a) ───────────────────────
    plane(4, 75, 0xc8a97a, 0, 0.03, 0);          // N–S
    plane(75, 4, 0xc8a97a, 0, 0.03, 0);          // E–W
    // Diagonal paths to corner zones
    [[17, 0.03, 17], [-17, 0.03, 17], [17, 0.03, -17], [-17, 0.03, -17]].forEach(([x, y, z]) => {
      const ang = Math.atan2(z, x);
      plane(3, 16, 0xc8a97a, x * 0.5, y, z * 0.5, -ang + Math.PI / 2);
    });
    // Ring road
    plane(4, 30, 0xc8a97a, -20, 0.03, 0);
    plane(4, 30, 0xc8a97a,  20, 0.03, 0);
    plane(30, 4, 0xc8a97a,   0, 0.03, -20);
    plane(30, 4, 0xc8a97a,   0, 0.03,  20);

    // ── Campus road network (grey 0xc0bdb5) ──────────────────────
    // Main N–S spine
    plane(3.2, 80, 0xc0bdb5,   0, 0.035, -30);
    // ms-partner N–S lanes
    plane(3.2, 70, 0xc0bdb5, -16, 0.035, -32);
    plane(3.2, 70, 0xc0bdb5, -32, 0.035, -32);
    plane(3.2, 70, 0xc0bdb5, -48, 0.035, -32);
    plane(3.2, 70, 0xc0bdb5, -64, 0.035, -32);
    // ms-partner E–W lanes
    plane(80, 3.2, 0xc0bdb5, -36, 0.035,  -8);
    plane(80, 3.2, 0xc0bdb5, -36, 0.035, -24);
    plane(80, 3.2, 0xc0bdb5, -36, 0.035, -40);
    plane(80, 3.2, 0xc0bdb5, -36, 0.035, -56);
    // ms-pip N–S lanes
    plane(3.2, 36, 0xc0bdb5,  24, 0.035, -38);
    plane(3.2, 36, 0xc0bdb5,  40, 0.035, -38);
    // ms-pip E–W lanes
    plane(40, 3.2, 0xc0bdb5,  32, 0.035, -24);
    plane(40, 3.2, 0xc0bdb5,  32, 0.035, -40);
    plane(40, 3.2, 0xc0bdb5,  32, 0.035, -56);
    // Standalone approach road
    plane(28, 3.2, 0xc0bdb5,  36, 0.035,  12);
    // Path to SW City Park (tan/beige footpath)
    plane(3.2, 18, 0xd4c090, -12, 0.032,   8);  // From plaza southwest
    plane(3.2, 14, 0xd4c090, -24, 0.032,  14);  // Continue southwest
    plane(3.2, 8,  0xd4c090, -14, 0.032,  20);  // East park entrance
    plane(3.2, 10, 0xd4c090, -20, 0.032,  24);  // From east gate to coffee cart
    // Intersection pads (0xb8b5ad)
    [[-16,-8],[-32,-8],[-48,-8],[-64,-8],
     [-16,-24],[-32,-24],[-48,-24],[-64,-24],
     [-16,-40],[-32,-40],[-48,-40],[-64,-40],
     [-16,-56],[-32,-56],[-48,-56],[-64,-56],
     [24,-24],[40,-24],[24,-40],[40,-40],[24,-56],[40,-56]
    ].forEach(([x, z]) => plane(4, 4, 0xb8b5ad, x, 0.036, z));

    // ── Central plaza ────────────────────────────────────────────
    // Stone circle: cyl(4,4,0.08,0xd4c8a8,0,0.04,0)
    cyl(4, 4, 0.08, 0xd4c8a8, 0, 0.04, 0);

    // Pedestal base slab
    cyl(0.55, 0.6,  0.18, 0xb8b0a0, 0, 0.09,  0);
    // Pedestal column
    cyl(0.32, 0.36, 0.55, 0xa0998a, 0, 0.45,  0);
    // Pedestal cap
    cyl(0.42, 0.42, 0.10, 0xb8b0a0, 0, 0.75,  0);

    // Statue figure — bronze
    box(0.09, 0.22, 0.09, 0x8a7a5a, -0.05, 0.97, 0);   // leg L
    box(0.09, 0.22, 0.09, 0x8a7a5a,  0.05, 0.97, 0);   // leg R
    box(0.22, 0.24, 0.12, 0x7a6a4a,  0.0,  1.23, 0);   // torso
    box(0.07, 0.20, 0.07, 0x7a6a4a, -0.15, 1.22, 0);   // arm L (down)
    // arm R (raised) — rotate -0.6 rad
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.20, 0.07), mat(0x7a6a4a));
    armR.position.set(0.15, 1.32, 0);
    armR.rotation.z = -0.6;
    s.add(armR);
    box(0.18, 0.18, 0.18, 0x9a8a6a, 0.0,  1.52, 0);    // head
    box(0.22, 0.07, 0.22, 0x6a5a3a, 0.0,  1.64, 0);    // hat brim
    cyl(0.08, 0.10, 0.14, 0x6a5a3a, 0.0,  1.75, 0);    // hat crown

    // Clan label above statue
    const clanAnchor = new THREE.Object3D();
    clanAnchor.position.set(0, 2.3, 0);
    s.add(clanAnchor);
    const clanDiv = document.createElement('div');
    clanDiv.className = 'clan-label';
    clanDiv.innerHTML = '<span class="clan-icon">⚔️</span>Partnership';
    clanAnchor.add(new CSS2DObject(clanDiv));

    // ── Plaza lamp posts ─────────────────────────────────────────
    [[9,0],[-9,0],[0,9],[0,-9]].forEach(([x,z]) => lamp(x, z));

    // ── Plaza benches ────────────────────────────────────────────
    bench(  6, 0,    Math.PI / 2);
    bench( -6, 0,   -Math.PI / 2);
    bench(  0,  6,   0);
    bench(  0, -6,   Math.PI);

    // ── Plaza trees ──────────────────────────────────────────────
    tree( 14, -14); tree(-14, -14); tree( 14,  14); tree(-14,  14);
    tree(  0,  30); tree( 30,   0); tree(  0, -30);

    // ── Bushes around plaza ──────────────────────────────────────
    [[ 14,-14],[-14,-14],[ 14, 14],[-14, 14],
     [  7,  0],[  -7,  0],[  0,  7],[   0, -7]].forEach(([x,z]) => bush(x, z));

    // ── Zone district signs ──────────────────────────────────────
    const ZONES = [
      { label: '🤝 ms-partner', color: 0x2a5a6a, x:  -8, z: -10 },
      { label: '📦 ms-pip',     color: 0x8a6a2a, x:  12, z: -10 },
      { label: '🌳 City Park',  color: 0x2a6a2a, x: -12, z:  10 },
    ];
    ZONES.forEach(zone => {
      cyl(0.07, 0.09, 2.2, 0x5a3a1a, zone.x, 1.1, zone.z);
      box(2.5, 0.55, 0.12, zone.color, zone.x, 2.45, zone.z);
    });

    // ── City parks ───────────────────────────────────────────────
    const parkPad = (x, z, w, d) => plane(w, d, 0x4ab84a, x, 0.015, z);

    // Park A: ms-partner NE corner
    parkPad(-24, -16, 9, 7);
    tree(-26, -14, 1.9, 1.1); tree(-22, -18, 2.1, 1.3); tree(-27, -19, 1.7, 1.0);
    bush(-21, -14); bush(-28, -16);
    bench(-24, -15, 0); bench(-24, -18, Math.PI);

    // Park B: ms-partner mid block
    parkPad(-40, -16, 8, 7);
    tree(-42, -14, 2.0, 1.2); tree(-38, -19, 1.8, 1.1);
    bush(-43, -18); bush(-37, -14);
    bench(-40, -16, 0);

    // Park C: ms-partner inner block
    parkPad(-24, -48, 8, 6);
    tree(-26, -46, 1.9, 1.1); tree(-22, -50, 2.0, 1.2);
    bush(-27, -50); bush(-22, -46);
    bench(-24, -47, 0); bench(-24, -50, Math.PI);

    // Park D: ms-partner far-west pocket
    parkPad(-60, -16, 6, 7);
    tree(-61, -14, 1.7, 1.0); tree(-58, -19, 1.9, 1.1);
    bush(-62, -18);
    bench(-60, -16, Math.PI / 2);

    // Park E: ms-pip inner courtyard
    parkPad(32, -32, 7, 6);
    tree(30, -30, 2.0, 1.2); tree(34, -34, 1.9, 1.1); tree(31, -34, 1.7, 1.0);
    bush(34, -30); bush(29, -33);
    bench(32, -31, 0); bench(32, -34, Math.PI);

    // Park F: ms-pip inner courtyard (expanded for 3-col grid)
    parkPad(32, -44, 7, 6);
    tree(30, -42, 2.0, 1.2); tree(34, -46, 1.9, 1.1); tree(31, -46, 1.7, 1.0);
    bush(34, -42); bush(29, -45);
    bench(32, -43, 0); bench(32, -46, Math.PI);

    // ── SW City Park ─────────────────────────────────────────────
    // Large grass pad
    parkPad(-38, 20, 48, 32);

    // Pond (blue ellipse, slightly raised)
    {
      const pondMat = new THREE.MeshLambertMaterial({ color: 0x3a8fbf });
      const pond = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.06, 32), pondMat);
      pond.scale.set(1.6, 1, 1.0);
      pond.position.set(-38, 0.04, 20);
      s.add(pond);
      // Pond rim
      cyl(5.8, 5.8, 0.12, 0xb0a070, -38, 0.06, 20);
    }

    // Footpath through the park (N–S and E–W)
    plane(2, 30, 0xd4c090, -38, 0.02, 20);   // N–S path
    plane(44, 2, 0xd4c090, -38, 0.02, 20);   // E–W path

    // Tree grove — perimeter and scattered
    // West edge
    tree(-58, 10, 2.4, 1.5); tree(-58, 16, 2.2, 1.4); tree(-58, 22, 2.6, 1.6);
    tree(-58, 28, 2.3, 1.5); tree(-58, 34, 2.1, 1.3);
    // East edge
    tree(-18, 10, 2.2, 1.4); tree(-18, 16, 2.4, 1.5); tree(-18, 28, 2.3, 1.4);
    tree(-18, 34, 2.0, 1.3);
    // North edge
    tree(-28,  8, 2.3, 1.4); tree(-38,  8, 2.5, 1.5); tree(-48,  8, 2.2, 1.3);
    // South edge
    tree(-28, 34, 2.1, 1.3); tree(-38, 34, 2.4, 1.5); tree(-48, 34, 2.2, 1.4);
    tree(-58, 34, 2.0, 1.3);
    // Pond-side cluster
    tree(-30, 14, 1.9, 1.1); tree(-46, 14, 2.0, 1.2);
    tree(-30, 26, 1.8, 1.0); tree(-46, 26, 2.1, 1.2);

    // Bushes along paths and pond
    bush(-28, 20); bush(-48, 20);
    bush(-38, 10); bush(-38, 30);
    bush(-32, 16); bush(-44, 16); bush(-32, 24); bush(-44, 24);

    // Benches facing the pond
    bench(-28, 18,  Math.PI / 2);   // east side, facing west
    bench(-48, 18, -Math.PI / 2);   // west side, facing east
    bench(-38, 12,  0);             // north side, facing south
    bench(-38, 28,  Math.PI);       // south side, facing north
    bench(-28, 30,  Math.PI / 4);   // SE corner
    bench(-48, 30, -Math.PI / 4);   // SW corner
    
    // Additional benches along paths for social gathering
    bench(-34, 20,  Math.PI / 2);   // E path, facing center
    bench(-42, 20, -Math.PI / 2);   // W path, facing center
    bench(-38, 16,  0);             // N path, facing south
    bench(-38, 24,  Math.PI);       // S path, facing north
    bench(-24, 14,  Math.PI / 4);   // NE area
    bench(-52, 14, -Math.PI / 4);   // NW area
    bench(-24, 26,  Math.PI * 3/4); // SE area
    bench(-52, 26,  Math.PI * 5/4); // SW area

    // Lamp posts along paths
    lamp(-38,  8); lamp(-38, 32);
    lamp(-22, 20); lamp(-54, 20);
    lamp(-28, 20); lamp(-48, 20);
    
    // Additional park lamp posts for night ambiance
    lamp(-32, 12); lamp(-44, 12);   // north path sides
    lamp(-32, 28); lamp(-44, 28);   // south path sides
    lamp(-24, 20); lamp(-52, 20);   // east/west ends
    lamp(-38, 14); lamp(-38, 26);   // near center intersection

    // Coffee cart — social gathering point in SE corner
    coffeeCart(-26, 28, Math.PI / 4);

    // Central fountain — decorative centerpiece with subtle animation
    fountain(-38, 20);

    // Decorative flowers scattered around the park
    // Pink flowers near benches
    flower(-29, 18, 0xff69b4); flower(-29.3, 18.2, 0xff1493);
    flower(-47, 18, 0xff69b4); flower(-47.3, 18.2, 0xffc0cb);
    flower(-38.2, 12.5, 0xff69b4); flower(-37.8, 12.5, 0xff1493);
    flower(-38.2, 27.5, 0xff69b4); flower(-37.8, 27.5, 0xffc0cb);
    // Yellow flowers near paths
    flower(-34.5, 20.5, 0xffff00); flower(-34.5, 19.5, 0xffd700);
    flower(-41.5, 20.5, 0xffff00); flower(-41.5, 19.5, 0xffd700);
    flower(-38.5, 16.5, 0xffff00); flower(-37.5, 16.5, 0xffd700);
    flower(-38.5, 23.5, 0xffff00); flower(-37.5, 23.5, 0xffd700);
    // Purple/blue flowers near pond
    flower(-40, 21, 0x9370db); flower(-40, 19, 0x8a2be2);
    flower(-36, 21, 0x9370db); flower(-36, 19, 0x8a2be2);
    // Red flowers in corners
    flower(-24.5, 14.5, 0xff0000); flower(-24.5, 13.5, 0xdc143c);
    flower(-51.5, 14.5, 0xff0000); flower(-51.5, 13.5, 0xdc143c);
    flower(-24.5, 25.5, 0xff0000); flower(-24.5, 26.5, 0xdc143c);
    flower(-51.5, 25.5, 0xff0000); flower(-51.5, 26.5, 0xdc143c);
    // Orange flowers near coffee cart
    flower(-25, 27, 0xff8c00); flower(-25.5, 27.5, 0xffa500);
    flower(-27, 29, 0xff8c00); flower(-27.5, 29.5, 0xffa500);

    // Decorative rocks scattered naturally
    rock(-30, 16, 1.0); rock(-46, 16, 0.8);
    rock(-30, 24, 0.9); rock(-46, 24, 1.1);
    rock(-34, 14, 0.7); rock(-42, 14, 0.8);
    rock(-34, 26, 1.0); rock(-42, 26, 0.9);
    rock(-26, 16, 0.6); rock(-50, 16, 0.7);
    rock(-26, 24, 0.8); rock(-50, 24, 0.6);
    rock(-40, 18, 0.7); rock(-36, 22, 0.8);
    rock(-40, 22, 0.6); rock(-36, 18, 0.7);
    // Rock clusters near trees
    rock(-58.5, 10.5, 0.9); rock(-57.5, 10.8, 0.6);
    rock(-18.5, 10.5, 0.8); rock(-17.5, 10.8, 0.7);
    rock(-28.5, 8.5, 0.9); rock(-48.5, 8.5, 1.0);
    rock(-28.5, 33.5, 0.8); rock(-48.5, 33.5, 0.9);

    // Additional bushes for more natural feel
    bush(-25, 15); bush(-25, 25);  // near coffee cart area
    bush(-51, 15); bush(-51, 25);  // west side
    bush(-35, 13); bush(-41, 13);  // north side clusters
    bush(-35, 27); bush(-41, 27);  // south side clusters
    bush(-33, 20); bush(-43, 20);  // along main E-W path
    bush(-38, 17); bush(-38, 23);  // along main N-S path
    // Bush pairs near benches
    bush(-29.5, 19); bush(-46.5, 19);
    bush(-37.5, 13); bush(-37.5, 29);
    // Corner decorative bushes
    bush(-23, 13); bush(-53, 13);
    bush(-23, 27); bush(-53, 27);

    // Park entrance gate posts
    box(0.4, 2.4, 0.4, 0x888877, -14, 1.2, 20);   // east post
    box(0.4, 2.4, 0.4, 0x888877, -14, 1.2, 18);   // east post pair
    // Gate arch lintel
    box(0.6, 0.2, 2.8, 0x888877, -14, 2.5, 19);
    // Gate sign
    const parkAnchor = new THREE.Object3D();
    parkAnchor.position.set(-22, 3.2, 20);
    s.add(parkAnchor);
    const parkDiv = document.createElement('div');
    parkAnchor.add(new CSS2DObject(parkDiv));

    // ── Phase 2: Create Instanced Meshes ─────────────────────────
    this._createInstancedTrees(treeInstances);
    this._createInstancedBenches(benchInstances);
    this._createInstancedLamps(lampInstances);
  }

  /**
   * Performance: Phase 2 - Create instanced tree meshes
   * Trees consist of trunk (cylinder) + foliage (sphere)
   */
  _createInstancedTrees(instances) {
    if (instances.length === 0) return;

    const s = this._scene;
    const mat = c => new THREE.MeshLambertMaterial({ color: c });

    // Create trunk instanced mesh
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.22, 1, 8); // Height=1, will scale per instance
    const trunkMat = mat(0x7a5230);
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, instances.length);
    trunkMesh.castShadow = false;
    trunkMesh.receiveShadow = true;

    // Create foliage instanced mesh
    const foliageGeo = new THREE.SphereGeometry(1, 8, 6); // Radius=1, will scale per instance
    const foliageMat = mat(0x2e9e2e);
    const foliageMesh = new THREE.InstancedMesh(foliageGeo, foliageMat, instances.length);
    foliageMesh.castShadow = false;
    foliageMesh.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    instances.forEach((inst, i) => {
      const { x, z, h, r } = inst;

      // Trunk: scale height, position at half height
      position.set(x, h / 2, z);
      rotation.set(0, 0, 0, 1);
      scale.set(1, h, 1);
      matrix.compose(position, rotation, scale);
      trunkMesh.setMatrixAt(i, matrix);

      // Foliage: scale radius, position at top of trunk + offset
      position.set(x, h + r * 0.7, z);
      scale.set(r, r, r);
      matrix.compose(position, rotation, scale);
      foliageMesh.setMatrixAt(i, matrix);
    });

    trunkMesh.instanceMatrix.needsUpdate = true;
    foliageMesh.instanceMatrix.needsUpdate = true;

    s.add(trunkMesh);
    s.add(foliageMesh);

    console.log(`[SceneManager] Created ${instances.length} instanced trees (${instances.length * 2} meshes → 2 InstancedMeshes)`);
  }

  /**
   * Performance: Phase 2 - Create instanced bench meshes
   * Benches consist of seat, backrest, and 2 legs
   */
  _createInstancedBenches(instances) {
    if (instances.length === 0) return;

    const s = this._scene;
    const mat = c => new THREE.MeshLambertMaterial({ color: c });

    // Create instanced meshes for each bench part
    const seatGeo = new THREE.BoxGeometry(0.7, 0.05, 0.18);
    const seatMat = mat(0x8b6914);
    const seatMesh = new THREE.InstancedMesh(seatGeo, seatMat, instances.length);
    seatMesh.castShadow = false;
    seatMesh.receiveShadow = true;

    const backGeo = new THREE.BoxGeometry(0.7, 0.16, 0.04);
    const backMat = mat(0x8b6914);
    const backMesh = new THREE.InstancedMesh(backGeo, backMat, instances.length);
    backMesh.castShadow = false;
    backMesh.receiveShadow = true;

    const legGeo = new THREE.BoxGeometry(0.05, 0.18, 0.18);
    const legMat = mat(0x666655);
    const legMeshL = new THREE.InstancedMesh(legGeo, legMat, instances.length);
    const legMeshR = new THREE.InstancedMesh(legGeo, legMat, instances.length);
    legMeshL.castShadow = false;
    legMeshL.receiveShadow = true;
    legMeshR.castShadow = false;
    legMeshR.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);

    instances.forEach((inst, i) => {
      const { x, z, ry } = inst;
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);

      // Seat: position at y=0.18, rotated by ry
      const seatPos = new THREE.Vector3(0, 0.18, 0);
      seatPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      position.set(x + seatPos.x, seatPos.y, z + seatPos.z);
      matrix.compose(position, rotation, scale);
      seatMesh.setMatrixAt(i, matrix);

      // Backrest: position at y=0.28, z=0.08 (local), rotated by ry
      const backPos = new THREE.Vector3(0, 0.28, 0.08);
      backPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      position.set(x + backPos.x, backPos.y, z + backPos.z);
      matrix.compose(position, rotation, scale);
      backMesh.setMatrixAt(i, matrix);

      // Left leg: position at y=0.09, x=-0.28 (local), rotated by ry
      const legLPos = new THREE.Vector3(-0.28, 0.09, 0);
      legLPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      position.set(x + legLPos.x, legLPos.y, z + legLPos.z);
      matrix.compose(position, rotation, scale);
      legMeshL.setMatrixAt(i, matrix);

      // Right leg: position at y=0.09, x=0.28 (local), rotated by ry
      const legRPos = new THREE.Vector3(0.28, 0.09, 0);
      legRPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      position.set(x + legRPos.x, legRPos.y, z + legRPos.z);
      matrix.compose(position, rotation, scale);
      legMeshR.setMatrixAt(i, matrix);
    });

    seatMesh.instanceMatrix.needsUpdate = true;
    backMesh.instanceMatrix.needsUpdate = true;
    legMeshL.instanceMatrix.needsUpdate = true;
    legMeshR.instanceMatrix.needsUpdate = true;

    s.add(seatMesh);
    s.add(backMesh);
    s.add(legMeshL);
    s.add(legMeshR);

    console.log(`[SceneManager] Created ${instances.length} instanced benches (${instances.length * 4} meshes → 4 InstancedMeshes)`);
  }

  /**
   * Performance: Phase 2 - Create instanced lamp meshes
   * Lamps consist of pole, arm, bulb. Lights are created separately for individual control.
   */
  _createInstancedLamps(instances) {
    if (instances.length === 0) return;

    const s = this._scene;
    const mat = c => new THREE.MeshLambertMaterial({ color: c });

    // Create instanced meshes for lamp parts
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 3.5, 8);
    const poleMat = mat(0x555555);
    const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, instances.length);
    poleMesh.castShadow = false;
    poleMesh.receiveShadow = true;

    const armGeo = new THREE.BoxGeometry(0.6, 0.07, 0.07);
    const armMat = mat(0x555555);
    const armMesh = new THREE.InstancedMesh(armGeo, armMat, instances.length);
    armMesh.castShadow = false;
    armMesh.receiveShadow = true;

    const bulbGeo = new THREE.SphereGeometry(0.18, 8, 6);
    const bulbMat = mat(0xffffcc);
    const bulbMesh = new THREE.InstancedMesh(bulbGeo, bulbMat, instances.length);
    bulbMesh.castShadow = false;
    bulbMesh.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);

    instances.forEach((inst, i) => {
      const { x, z } = inst;

      // Pole: position at y=1.75 (half height of 3.5)
      position.set(x, 1.75, z);
      rotation.set(0, 0, 0, 1);
      matrix.compose(position, rotation, scale);
      poleMesh.setMatrixAt(i, matrix);

      // Arm: position at y=3.55, x offset by 0.3
      position.set(x + 0.3, 3.55, z);
      matrix.compose(position, rotation, scale);
      armMesh.setMatrixAt(i, matrix);

      // Bulb: position at y=3.55, x offset by 0.6
      position.set(x + 0.6, 3.55, z);
      matrix.compose(position, rotation, scale);
      bulbMesh.setMatrixAt(i, matrix);

      // Create individual point light for night mode control
      const light = new THREE.PointLight(0xffd580, 0, 8, 2);
      light.position.set(x + 0.6, 3.55, z);
      light.castShadow = false;
      light.userData.isLampLight = true;
      s.add(light);
      this._lampLights.push(light);
    });

    poleMesh.instanceMatrix.needsUpdate = true;
    armMesh.instanceMatrix.needsUpdate = true;
    bulbMesh.instanceMatrix.needsUpdate = true;

    s.add(poleMesh);
    s.add(armMesh);
    s.add(bulbMesh);

    console.log(`[SceneManager] Created ${instances.length} instanced lamps (${instances.length * 3} meshes → 3 InstancedMeshes)`);
  }

  _initControls() {
    this._controls = new OrbitControls(this._camera, this._renderer.domElement);
    this._controls.target.set(0, 1, 0);
    this._controls.maxPolarAngle = Math.PI / 2.05;
    this._controls.minDistance = 8;
    this._controls.maxDistance = 200;
    this._controls.enableDamping = true;
    this._controls.dampingFactor = 0.07;
  }

  _initWeather() {
    this._weatherManager = new WeatherManager(this._scene, this._camera);
    
    // Camera follow system
    this._cameraMode = 'free'; // 'free', 'follow', 'drone'
    this._followTarget = null; // Developer group to follow
    this._followOffset = new THREE.Vector3(5, 8, 5); // Offset behind developer
    this._cameraLerpSpeed = 0.05; // Smooth interpolation speed
  }

  _bindResize() {
    this._onResize = () => {
      const w = this._canvas.clientWidth;
      const h = this._canvas.clientHeight;
      this._camera.aspect = w / h;
      this._camera.updateProjectionMatrix();
      this._renderer.setSize(w, h);
      this._css2d.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);
  }

  // ── Day/Night Cycle ──────────────────────────────────────────────────────

  /**
   * Toggle between day and night modes with smooth transitions.
   * @param {boolean} isNight - true for night mode, false for day mode
   */
  setDayNightMode(isNight) {
    if (this._isNightMode === isNight) return; // Already in this mode
    this._isNightMode = isNight;

    const duration = 2000; // 2 seconds transition
    const startTime = Date.now();

    // Day mode colors
    const daySkyColor = new THREE.Color(0x87ceeb);
    const dayFogColor = new THREE.Color(0x87ceeb);
    const dayAmbientIntensity = 0.6;
    const daySunIntensity = 1.2;
    const dayLampIntensity = 0;

    // Night mode colors
    const nightSkyColor = new THREE.Color(0x1a2332);
    const nightFogColor = new THREE.Color(0x1a2332);
    const nightAmbientIntensity = 0.35;
    const nightSunIntensity = 0.15;
    const nightLampIntensity = 0.8;

    // Start values
    const startSky = this._scene.background.clone();
    const startFog = this._scene.fog.color.clone();
    const startAmbient = this._ambient.intensity;
    const startSun = this._sun.intensity;
    const startLamp = this._lampLights.length > 0 ? this._lampLights[0].intensity : 0;

    // Target values
    const targetSky = isNight ? nightSkyColor : daySkyColor;
    const targetFog = isNight ? nightFogColor : dayFogColor;
    const targetAmbient = isNight ? nightAmbientIntensity : dayAmbientIntensity;
    const targetSun = isNight ? nightSunIntensity : daySunIntensity;
    const targetLamp = isNight ? nightLampIntensity : dayLampIntensity;

    // Animate transition
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = this._easeInOutCubic(progress);

      // Interpolate colors
      this._scene.background.lerpColors(startSky, targetSky, eased);
      this._scene.fog.color.lerpColors(startFog, targetFog, eased);

      // Interpolate light intensities
      this._ambient.intensity = startAmbient + (targetAmbient - startAmbient) * eased;
      this._sun.intensity = startSun + (targetSun - startSun) * eased;

      // Update all lamp lights
      this._lampLights.forEach(light => {
        light.intensity = startLamp + (targetLamp - startLamp) * eased;
      });

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  /**
   * Easing function for smooth transitions
   */
  _easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ── Camera Follow System ─────────────────────────────────────────────────

  /**
   * Set camera mode
   * @param {'free' | 'follow' | 'drone'} mode
   */
  setCameraMode(mode) {
    if (!['free', 'follow', 'drone'].includes(mode)) {
      console.warn(`[SceneManager] Invalid camera mode: ${mode}`);
      return;
    }
    
    this._cameraMode = mode;
    
    // Enable/disable OrbitControls based on mode
    if (mode === 'free') {
      this._controls.enabled = true;
      this._followTarget = null;
    } else if (mode === 'follow') {
      this._controls.enabled = false; // Disable manual control when following
    } else if (mode === 'drone') {
      this._controls.enabled = false;
      // TODO: Implement cinematic drone camera
    }
    
    console.log(`[SceneManager] Camera mode: ${mode}`);
  }

  /**
   * Set target developer to follow
   * @param {THREE.Group} developerGroup - The developer's group object
   */
  setFollowTarget(developerGroup) {
    if (!developerGroup) {
      console.warn('[SceneManager] Invalid follow target');
      return;
    }
    
    this._followTarget = developerGroup;
    this._cameraMode = 'follow';
    this._controls.enabled = false;
    
    console.log(`[SceneManager] Following developer at (${developerGroup.position.x.toFixed(1)}, ${developerGroup.position.z.toFixed(1)})`);
  }

  /**
   * Stop following and return to free camera
   */
  stopFollowing() {
    this._cameraMode = 'free';
    this._followTarget = null;
    this._controls.enabled = true;
    
    console.log('[SceneManager] Stopped following, returned to free camera');
  }

  /**
   * Update camera position for follow mode
   * Called in update() loop
   */
  _updateFollowCamera() {
    if (this._cameraMode !== 'follow' || !this._followTarget) return;
    
    const target = this._followTarget;
    const targetPos = target.position;
    const targetRot = target.rotation.y;
    
    // Calculate camera position: behind and above the developer
    const offset = this._followOffset.clone();
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), targetRot);
    
    const desiredCameraPos = new THREE.Vector3(
      targetPos.x + offset.x,
      targetPos.y + offset.y,
      targetPos.z + offset.z
    );
    
    // Smooth camera movement using lerp
    this._camera.position.lerp(desiredCameraPos, this._cameraLerpSpeed);
    
    // Camera looks at developer (slightly ahead for better view)
    const lookAtPos = new THREE.Vector3(
      targetPos.x,
      targetPos.y + 1.0, // Look at head height
      targetPos.z
    );
    this._camera.lookAt(lookAtPos);
    
    // Update controls target for smooth transition back to free mode
    this._controls.target.copy(lookAtPos);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  update(delta) {
    // Animate fountain water with gentle rotation
    this._scene.traverse(obj => {
      if (obj.userData.isWater) {
        obj.rotation.y += delta * 0.3; // Slow rotation for water effect
      }
    });
    
    // Update weather effects
    if (this._weatherManager) {
      this._weatherManager.update(delta);
    }
    
    // Update camera for follow mode
    this._updateFollowCamera();
  }

  render() {
    this._controls.update();
    this._renderer.render(this._scene, this._camera);
    this._css2d.render(this._scene, this._camera);
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this._controls.dispose();
    this._renderer.dispose();
    if (this._css2d.domElement.parentElement) {
      this._css2d.domElement.parentElement.removeChild(this._css2d.domElement);
    }
    if (this._weatherManager) {
      this._weatherManager.dispose();
    }
    this._scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}
