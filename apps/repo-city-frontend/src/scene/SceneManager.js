import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/**
 * SceneManager — owns the Three.js renderer, camera, CSS2D renderer,
 * lights, fog, orbit controls and all static scene geometry.
 * All values are taken directly from the prototype (docs/prototype/index.html).
 */
export class SceneManager {
  constructor(canvas) {
    this._canvas = canvas;
    this._initScene();
    this._initRenderers(canvas);
    this._initCamera();
    this._initLights();
    this._initEnvironment();
    this._initControls();
    this._bindResize();
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get scene()    { return this._scene; }
  get camera()   { return this._camera; }
  get renderer() { return this._renderer; }
  get css2d()    { return this._css2d; }
  get controls() { return this._controls; }

  // ── Init ─────────────────────────────────────────────────────────────────

  _initScene() {
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x87ceeb);
    this._scene.fog = new THREE.Fog(0x87ceeb, 80, 220);
  }

  _initRenderers(canvas) {
    this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this._scene.add(ambient);

    // Sun — prototype: DirectionalLight(0xfffbe0, 1.2) at (15,25,15)
    const sun = new THREE.DirectionalLight(0xfffbe0, 1.2);
    sun.position.set(15, 25, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 300;
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    sun.shadow.bias = -0.001;
    this._scene.add(sun);
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
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 16), mat(color));
      m.position.set(x, y, z);
      m.castShadow = true;
      s.add(m);
      return m;
    };
    const sphere = (r, color, x, y, z) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat(color));
      m.position.set(x, y, z);
      m.castShadow = true;
      s.add(m);
      return m;
    };
    const tree = (x, z, h = 1.8, r = 1.1) => {
      cyl(0.18, 0.22, h, 0x7a5230, x, h / 2, z);
      sphere(r, 0x2e9e2e, x, h + r * 0.7, z);
    };
    const bush = (x, z) => {
      sphere(0.55, 0x3aaa3a, x, 0.4, z);
      sphere(0.4,  0x2e8c2e, x + 0.4, 0.5, z + 0.1);
      sphere(0.38, 0x36a036, x - 0.35, 0.45, z - 0.1);
    };
    const bench = (x, z, ry = 0) => {
      const g = new THREE.Group();
      // seat
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.18), mat(0x8b6914));
      seat.position.set(0, 0.18, 0);
      g.add(seat);
      // backrest
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.04), mat(0x8b6914));
      back.position.set(0, 0.28, 0.08);
      g.add(back);
      // legs
      [[-0.28, 0], [0.28, 0]].forEach(([lx]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.18), mat(0x666655));
        leg.position.set(lx, 0.09, 0);
        g.add(leg);
      });
      g.rotation.y = ry;
      g.position.set(x, 0, z);
      s.add(g);
    };
    const lamp = (x, z) => {
      cyl(0.07, 0.09, 3.5, 0x555555, x, 1.75, z);
      box(0.6, 0.07, 0.07, 0x555555, x + 0.3, 3.55, z);
      sphere(0.18, 0xffffcc, x + 0.6, 3.55, z);
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

    // Lamp posts along paths
    lamp(-38,  8); lamp(-38, 32);
    lamp(-22, 20); lamp(-54, 20);
    lamp(-28, 20); lamp(-48, 20);

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
    parkDiv.className = 'clan-label';
    parkDiv.innerHTML = '<span class="clan-icon">🌳</span>City Park';
    parkAnchor.add(new CSS2DObject(parkDiv));
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

  // ── Render ───────────────────────────────────────────────────────────────

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
    this._scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}
