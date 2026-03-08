# GitLab City — Frontend Visualization Design

> **Version:** 1.0  
> **Date:** March 6, 2026

---

## 1. Frontend Architecture Overview

```
src/
├── main.tsx                    ← React app entry point
├── App.tsx                     ← Root component, socket setup
│
├── store/                      ← Zustand state management
│   ├── cityStore.ts            ← Main city state
│   ├── uiStore.ts              ← UI panels, selected district
│   └── replayStore.ts          ← Time-travel replay state
│
├── hooks/
│   ├── useCitySocket.ts        ← WebSocket event handling
│   ├── useCityMutations.ts     ← Apply mutations to store
│   └── useAnimationQueue.ts    ← Sequence animations
│
├── scene/                      ← Three.js / R3F components
│   ├── CityScene.tsx           ← Root R3F Canvas
│   ├── camera/
│   │   └── IsometricCamera.tsx ← Isometric camera rig
│   ├── environment/
│   │   ├── Ground.tsx          ← City ground plane
│   │   ├── Grid.tsx            ← District grid lines
│   │   ├── Sky.tsx             ← Day/night sky
│   │   └── Fog.tsx             ← Distance fog
│   ├── district/
│   │   ├── DistrictMesh.tsx    ← District zone visualization
│   │   └── DistrictLabel.tsx   ← Floating repo name label
│   ├── building/
│   │   ├── Building.tsx        ← Animated building mesh
│   │   ├── BuildingFloor.tsx   ← Individual floor component
│   │   ├── Crane.tsx           ← Construction crane
│   │   └── IssueSign.tsx       ← Warning sign for issues
│   ├── worker/
│   │   ├── WorkerAvatar.tsx    ← Worker character mesh
│   │   ├── WorkerPath.tsx      ← Walking path animation
│   │   └── Blueprint.tsx       ← MR blueprint prop
│   └── effects/
│       ├── PipelineGlow.tsx    ← Building glow effect
│       ├── SmokeParticles.tsx  ← Pipeline failure smoke
│       ├── Fireworks.tsx       ← Release celebration
│       └── ConstructionDust.tsx← Commit construction dust
│
└── ui/                         ← React 2D overlay
    ├── HUD.tsx                 ← Main HUD container
    ├── ActivityFeed.tsx        ← Live event feed
    ├── DistrictPanel.tsx       ← District info on click
    ├── WorkerCard.tsx          ← Developer info on click
    ├── TimeControls.tsx        ← Replay slider
    ├── Leaderboard.tsx         ← Top developers
    └── Legend.tsx              ← City element legend
```

---

## 2. City State Store (Zustand)

```typescript
// src/store/cityStore.ts

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { 
  CityState, CityMutation, District, Worker, Building
} from '../types/city';

interface CityStore {
  // Data
  cityState: CityState | null;
  pendingMutations: CityMutation[];
  
  // Connection
  isConnected: boolean;
  
  // Actions
  setCitySnapshot: (state: CityState) => void;
  applyMutation: (mutation: CityMutation) => void;
  applyMutationBatch: (mutations: CityMutation[]) => void;
  setConnected: (connected: boolean) => void;
  
  // Selectors
  getDistrict: (id: string) => District | undefined;
  getWorker: (id: string) => Worker | undefined;
  getBuilding: (districtId: string, buildingId: string) => Building | undefined;
}

export const useCityStore = create<CityStore>()(
  immer((set, get) => ({
    cityState: null,
    pendingMutations: [],
    isConnected: false,

    setCitySnapshot: (state) => set(store => {
      store.cityState = state;
    }),

    applyMutation: (mutation) => set(store => {
      if (!store.cityState) return;
      applyMutationToState(store.cityState, mutation);
    }),

    applyMutationBatch: (mutations) => set(store => {
      if (!store.cityState) return;
      mutations.forEach(m => applyMutationToState(store.cityState!, m));
    }),

    setConnected: (connected) => set(store => {
      store.isConnected = connected;
    }),

    getDistrict: (id) => get().cityState?.districts.find(d => d.id === id),
    getWorker: (id) => get().cityState?.workers.find(w => w.id === id),
    getBuilding: (districtId, buildingId) => 
      get().cityState?.districts
        .find(d => d.id === districtId)
        ?.buildings.find(b => b.id === buildingId),
  }))
);

// Pure mutation reducer
function applyMutationToState(state: CityState, mutation: CityMutation): void {
  switch (mutation.type) {
    case 'building.floor_added': {
      const district = state.districts.find(d => d.id === mutation.districtId);
      const building = district?.buildings.find(b => b.id === mutation.buildingId);
      if (building) {
        building.floors = mutation.newFloorCount;
        building.underConstruction = true;
      }
      break;
    }
    
    case 'building.upgraded': {
      const district = state.districts.find(d => d.id === mutation.districtId);
      const building = district?.buildings.find(b => b.id === mutation.buildingId);
      if (building) {
        // Upgrades add a visual style bump
        building.floors += 3;
      }
      break;
    }
    
    case 'worker.spawned': {
      state.workers.push(mutation.worker);
      break;
    }
    
    case 'worker.moved': {
      const worker = state.workers.find(w => w.id === mutation.workerId);
      if (worker) {
        worker.position = mutation.toPosition;
        worker.currentDistrictId = mutation.targetDistrictId;
        worker.currentBuildingId = mutation.targetBuildingId;
      }
      break;
    }
    
    case 'worker.animation_changed': {
      const worker = state.workers.find(w => w.id === mutation.workerId);
      if (worker) worker.animationState = mutation.animation;
      break;
    }
    
    case 'pipeline.status_changed': {
      const district = state.districts.find(d => d.id === mutation.districtId);
      if (district) {
        district.pipelineStatus = mutation.newStatus;
        district.visualState.glowColor = getGlowColor(mutation.newStatus);
        district.visualState.hasSmoke = mutation.newStatus === 'failed';
      }
      break;
    }
    
    case 'district.added': {
      state.districts.push(mutation.district);
      break;
    }
    
    case 'fireworks.triggered': {
      const district = state.districts.find(d => d.id === mutation.districtId);
      if (district) district.visualState.hasFireworks = true;
      // Auto-clear after animation duration
      setTimeout(() => {
        useCityStore.getState().applyMutation({
          ...mutation,
          type: 'fireworks.triggered',
        });
      }, mutation.duration);
      break;
    }
  }
}

function getGlowColor(status: string): string {
  const colors: Record<string, string> = {
    running: '#FFA500',
    success: '#00FF88',
    failed:  '#FF3333',
    idle:    '#334455',
    canceled: '#888888',
  };
  return colors[status] ?? '#334455';
}
```

---

## 3. WebSocket Integration Hook

```typescript
// src/hooks/useCitySocket.ts

import { useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useCityStore } from '../store/cityStore';
import { useAnimationQueue } from './useAnimationQueue';

let socket: Socket | null = null;

export function useCitySocket(orgId: string) {
  const { setCitySnapshot, applyMutationBatch, setConnected } = useCityStore();
  const { enqueueAnimations } = useAnimationQueue();

  const connect = useCallback(() => {
    if (socket?.connected) return;

    socket = io(import.meta.env.VITE_WS_URL ?? 'ws://localhost:3002', {
      query: { orgId },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    socket.on('connect', () => {
      console.log('[CitySocket] Connected');
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('[CitySocket] Disconnected');
      setConnected(false);
    });

    // Full city state on connect
    socket.on('city:snapshot', (cityState) => {
      console.log('[CitySocket] Received city snapshot');
      setCitySnapshot(cityState);
    });

    // Real-time city mutations
    socket.on('city:mutations', ({ mutations, timestamp }) => {
      // Update store state (data layer)
      applyMutationBatch(mutations);
      
      // Queue animations (visual layer)
      enqueueAnimations(mutations);
    });

  }, [orgId, setCitySnapshot, applyMutationBatch, setConnected, enqueueAnimations]);

  useEffect(() => {
    connect();
    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [connect]);

  const requestReplay = useCallback((fromDate: string, toDate: string) => {
    socket?.emit('city:replay', { orgId, fromDate, toDate });
  }, [orgId]);

  return { requestReplay, isConnected: !!socket?.connected };
}
```

---

## 4. City Scene — Root Three.js Canvas

```tsx
// src/scene/CityScene.tsx

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Stars } from '@react-three/drei';
import { Suspense } from 'react';
import { IsometricCamera } from './camera/IsometricCamera';
import { Ground } from './environment/Ground';
import { Grid } from './environment/Grid';
import { Sky } from './environment/Sky';
import { DistrictMesh } from './district/DistrictMesh';
import { WorkerAvatar } from './worker/WorkerAvatar';
import { useCityStore } from '../store/cityStore';
import { EffectComposer, Bloom, SMAA } from '@react-three/postprocessing';

export function CityScene() {
  const cityState = useCityStore(s => s.cityState);

  return (
    <Canvas
      shadows
      gl={{ antialias: false, alpha: false }}
      dpr={[1, 1.5]}   // Limit pixel ratio for performance
      camera={{ fov: 45 }}
      style={{ background: '#0a1628' }}
    >
      <Suspense fallback={null}>
        {/* Camera */}
        <IsometricCamera />

        {/* Lighting */}
        <ambientLight intensity={0.4} color="#b0c8ff" />
        <directionalLight
          position={[50, 80, 30]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={200}
          shadow-camera-left={-100}
          shadow-camera-right={100}
          shadow-camera-top={100}
          shadow-camera-bottom={-100}
          color="#fff8e0"
        />

        {/* Environment */}
        <Ground />
        <Grid />
        <Sky />
        <Stars radius={100} depth={50} count={3000} fade />
        <fog attach="fog" args={['#0a1628', 80, 200]} />

        {/* City content */}
        {cityState?.districts.map(district => (
          <DistrictMesh key={district.id} district={district} />
        ))}

        {cityState?.workers.map(worker => (
          <WorkerAvatar key={worker.id} worker={worker} />
        ))}

        {/* Post-processing */}
        <EffectComposer multisampling={0}>
          <Bloom 
            luminanceThreshold={0.8}
            luminanceSmoothing={0.3}
            intensity={0.6}
          />
          <SMAA />
        </EffectComposer>
      </Suspense>
    </Canvas>
  );
}
```

---

## 5. Isometric Camera

```tsx
// src/scene/camera/IsometricCamera.tsx

import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3, MathUtils } from 'three';
import { useUIStore } from '../../store/uiStore';
import gsap from 'gsap';

export function IsometricCamera() {
  const { camera } = useThree();
  const targetRef = useRef(new Vector3(0, 0, 0));
  const focusedDistrict = useUIStore(s => s.focusedDistrictId);

  useEffect(() => {
    // Isometric-style camera: elevated at 45°, looking down-forward
    camera.position.set(60, 60, 60);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  // Smooth pan to focused district
  useEffect(() => {
    if (!focusedDistrict) return;
    // Animate camera to district position
    gsap.to(camera.position, {
      x: targetRef.current.x + 20,
      y: 30,
      z: targetRef.current.z + 20,
      duration: 1.5,
      ease: 'power3.inOut',
    });
  }, [focusedDistrict, camera]);

  return null;
}
```

---

## 6. Building Component (Core Visual Element)

```tsx
// src/scene/building/Building.tsx

import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshStandardMaterial, BoxGeometry, Group } from 'three';
import { Text } from '@react-three/drei';
import gsap from 'gsap';
import { Crane } from './Crane';
import { IssueSign } from './IssueSign';
import { PipelineGlow } from '../effects/PipelineGlow';
import type { Building as BuildingData, District } from '../../types/city';

const FLOOR_HEIGHT = 0.8;
const FLOOR_WIDTH = 3;
const FLOOR_DEPTH = 3;

// Memoized geometry per floor — performance optimization
const floorGeometry = new BoxGeometry(FLOOR_WIDTH, FLOOR_HEIGHT, FLOOR_DEPTH);

// Style → color mapping
const STYLE_COLORS: Record<string, string> = {
  office:      '#334466',
  factory:     '#445544',
  tower:       '#334455',
  warehouse:   '#554433',
  lab:         '#443355',
  residential: '#554444',
};

const WINDOW_COLORS: Record<string, string> = {
  office:      '#88AAFF',
  factory:     '#AAFFAA',
  tower:       '#FFDDAA',
  warehouse:   '#FFAAAA',
  lab:         '#DDAAFF',
  residential: '#AAFFDD',
};

interface BuildingProps {
  building: BuildingData;
  district: District;
}

export function Building({ building, district }: BuildingProps) {
  const groupRef = useRef<Group>(null!);
  const previousFloors = useRef(building.floors);

  // Animate new floors appearing
  useEffect(() => {
    const addedFloors = building.floors - previousFloors.current;
    if (addedFloors <= 0) return;

    // Animate each new floor rising from below
    for (let i = previousFloors.current; i < building.floors; i++) {
      const floorY = i * FLOOR_HEIGHT;
      
      // Find the floor mesh and animate it
      const floorMesh = groupRef.current?.children[i];
      if (floorMesh) {
        // Start invisible and below, rise into place
        floorMesh.scale.set(1, 0.01, 1);
        gsap.to(floorMesh.scale, {
          y: 1,
          duration: 0.4,
          delay: (i - previousFloors.current) * 0.1,
          ease: 'back.out(1.5)',
        });

        // Flash the floor bright on appearance
        const mat = (floorMesh as any).material;
        if (mat) {
          gsap.fromTo(mat, 
            { emissiveIntensity: 2 },
            { emissiveIntensity: 0, duration: 0.8, delay: (i - previousFloors.current) * 0.1 + 0.3 }
          );
        }
      }
    }

    previousFloors.current = building.floors;
  }, [building.floors]);

  // Generate floor meshes
  const floors = useMemo(() => {
    return Array.from({ length: building.floors }, (_, i) => i);
  }, [building.floors]);

  const bodyColor = STYLE_COLORS[building.style] ?? '#334455';
  const windowColor = WINDOW_COLORS[building.style] ?? '#88AAFF';

  return (
    <group
      ref={groupRef}
      position={[
        district.position.x + building.position.x,
        0,
        district.position.z + building.position.z,
      ]}
    >
      {/* Floor stack */}
      {floors.map(i => (
        <BuildingFloor
          key={i}
          index={i}
          bodyColor={bodyColor}
          windowColor={windowColor}
          isTopFloor={i === building.floors - 1}
          underConstruction={building.underConstruction && i === building.floors - 1}
        />
      ))}

      {/* Rooftop details on top floor */}
      <RooftopDetails 
        floors={building.floors} 
        style={building.style}
      />

      {/* Cranes (one per active pipeline job) */}
      {Array.from({ length: building.activeCranes }, (_, i) => (
        <Crane 
          key={i}
          index={i}
          buildingHeight={building.floors * FLOOR_HEIGHT}
          active={true}
        />
      ))}

      {/* Issue warning signs */}
      {building.underConstruction && (
        <ConstructionDustParticles height={building.floors * FLOOR_HEIGHT} />
      )}

      {/* Pipeline glow */}
      {district.pipelineStatus !== 'idle' && (
        <PipelineGlow 
          status={district.pipelineStatus}
          height={building.floors * FLOOR_HEIGHT}
        />
      )}

      {/* Building name label */}
      <Text
        position={[0, building.floors * FLOOR_HEIGHT + 1.5, 0]}
        fontSize={0.5}
        color="white"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.05}
        outlineColor="#000000"
        renderOrder={100}
        depthOffset={-1}
      >
        {building.name}
      </Text>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface BuildingFloorProps {
  index: number;
  bodyColor: string;
  windowColor: string;
  isTopFloor: boolean;
  underConstruction: boolean;
}

function BuildingFloor({
  index,
  bodyColor,
  windowColor,
  isTopFloor,
  underConstruction,
}: BuildingFloorProps) {
  const meshRef = useRef<any>(null!);

  // Subtle pulse on under-construction top floor
  useFrame((state) => {
    if (!underConstruction || !isTopFloor || !meshRef.current) return;
    const t = state.clock.getElapsedTime();
    meshRef.current.material.emissiveIntensity = 0.2 + Math.sin(t * 3) * 0.15;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={floorGeometry}
      position={[0, index * FLOOR_HEIGHT + FLOOR_HEIGHT / 2, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={bodyColor}
        emissive={underConstruction && isTopFloor ? '#FFAA00' : '#000000'}
        emissiveIntensity={0}
        roughness={0.8}
        metalness={0.1}
      />
      {/* Window grid texture overlay would go here in production */}
    </mesh>
  );
}

function RooftopDetails({ floors, style }: { floors: number; style: string }) {
  const y = floors * FLOOR_HEIGHT;
  return (
    <group position={[0, y, 0]}>
      {/* Antenna */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 1, 6]} />
        <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Rooftop units */}
      <mesh position={[0.8, 0.2, 0.8]} castShadow>
        <boxGeometry args={[0.6, 0.4, 0.6]} />
        <meshStandardMaterial color="#556677" roughness={0.9} />
      </mesh>
    </group>
  );
}

function ConstructionDustParticles({ height }: { height: number }) {
  // Simple particle system — in production use @react-three/fiber particles
  return null; // Placeholder
}
```

---

## 7. Worker Avatar Component

```tsx
// src/scene/worker/WorkerAvatar.tsx

import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Vector3, CatmullRomCurve3 } from 'three';
import { Text, Billboard } from '@react-three/drei';
import gsap from 'gsap';
import type { Worker } from '../../types/city';

const WORKER_SCALE = 0.8;

interface WorkerAvatarProps {
  worker: Worker;
}

export function WorkerAvatar({ worker }: WorkerAvatarProps) {
  const groupRef = useRef<Group>(null!);
  const bodyRef = useRef<any>(null!);
  const armRef = useRef<any>(null!);
  const [showName, setShowName] = useState(false);

  // Body colors from worker appearance
  const vestColor = worker.appearance.vestColor;
  const hardHatColor = worker.appearance.hardHatColor;

  // Walking animation — update position along path
  useEffect(() => {
    if (!groupRef.current) return;

    const target = new Vector3(
      worker.position.x,
      worker.position.y,
      worker.position.z
    );

    // Animate movement
    gsap.to(groupRef.current.position, {
      x: target.x,
      y: target.y,
      z: target.z,
      duration: 2.5,
      ease: 'power1.inOut',
    });
  }, [worker.position]);

  // Per-frame animation based on state
  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    switch (worker.animationState) {
      case 'walking': {
        // Bounce body while walking
        if (bodyRef.current) {
          bodyRef.current.position.y = 0.8 + Math.abs(Math.sin(t * 6)) * 0.1;
        }
        // Swing arms
        if (armRef.current) {
          armRef.current.rotation.x = Math.sin(t * 6) * 0.5;
        }
        break;
      }
      case 'constructing': {
        // Hammer motion
        if (armRef.current) {
          armRef.current.rotation.x = Math.sin(t * 8) * 0.8;
        }
        break;
      }
      case 'celebrating': {
        // Arms up, jumping
        if (bodyRef.current) {
          bodyRef.current.position.y = 0.8 + Math.abs(Math.sin(t * 4)) * 0.3;
        }
        if (armRef.current) {
          armRef.current.rotation.z = Math.sin(t * 4) * 0.5 + 0.5;
        }
        break;
      }
      case 'idle': {
        // Gentle breathing
        if (bodyRef.current) {
          bodyRef.current.scale.y = 1 + Math.sin(t * 1.5) * 0.02;
        }
        break;
      }
      case 'resting': {
        // Slow, slumped breathing
        if (bodyRef.current) {
          bodyRef.current.rotation.x = 0.3; // leaning forward
          bodyRef.current.scale.y = 1 + Math.sin(t * 0.8) * 0.01;
        }
        break;
      }
    }
  });

  return (
    <group
      ref={groupRef}
      position={[worker.position.x, worker.position.y, worker.position.z]}
      onPointerEnter={() => setShowName(true)}
      onPointerLeave={() => setShowName(false)}
    >
      {/* Feet */}
      <mesh position={[-0.12, 0.15, 0]} castShadow>
        <boxGeometry args={[0.15, 0.3, 0.2]} />
        <meshStandardMaterial color="#222222" />
      </mesh>
      <mesh position={[0.12, 0.15, 0]} castShadow>
        <boxGeometry args={[0.15, 0.3, 0.2]} />
        <meshStandardMaterial color="#222222" />
      </mesh>

      {/* Body / vest */}
      <mesh ref={bodyRef} position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[0.4, 0.6, 0.3]} />
        <meshStandardMaterial color={vestColor} roughness={0.9} />
      </mesh>

      {/* Arms */}
      <group ref={armRef} position={[0, 0.8, 0]}>
        <mesh position={[-0.3, 0, 0]}>
          <boxGeometry args={[0.15, 0.5, 0.15]} />
          <meshStandardMaterial color={vestColor} roughness={0.9} />
        </mesh>
        <mesh position={[0.3, 0, 0]}>
          <boxGeometry args={[0.15, 0.5, 0.15]} />
          <meshStandardMaterial color={vestColor} roughness={0.9} />
        </mesh>
      </group>

      {/* Head */}
      <mesh position={[0, 1.3, 0]} castShadow>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshStandardMaterial color="#F5C07A" roughness={1.0} />
      </mesh>

      {/* Hard hat */}
      <mesh position={[0, 1.52, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.12, 8]} />
        <meshStandardMaterial color={hardHatColor} roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[0, 1.56, 0]}>
        <cylinderGeometry args={[0.28, 0.28, 0.04, 8]} />
        <meshStandardMaterial color={hardHatColor} roughness={0.6} />
      </mesh>

      {/* Username label — only on hover */}
      {showName && (
        <Billboard follow lockX={false} lockY={false} lockZ={false}>
          <Text
            position={[0, 2.0, 0]}
            fontSize={0.35}
            color="white"
            outlineWidth={0.04}
            outlineColor="#000000"
            anchorX="center"
            anchorY="bottom"
          >
            @{worker.username}
          </Text>
        </Billboard>
      )}

      {/* Activity indicator dot */}
      {worker.isActive && (
        <mesh position={[0.2, 1.7, 0]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial
            color="#00FF88"
            emissive="#00FF88"
            emissiveIntensity={2}
          />
        </mesh>
      )}
    </group>
  );
}
```

---

## 8. Pipeline Glow Effect

```tsx
// src/scene/effects/PipelineGlow.tsx

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color } from 'three';
import type { PipelineStatus } from '../../types/city';

interface PipelineGlowProps {
  status: PipelineStatus;
  height: number;
}

const STATUS_COLORS: Record<PipelineStatus, string> = {
  idle:     '#334455',
  running:  '#FFA500',
  success:  '#00FF88',
  failed:   '#FF3333',
  canceled: '#888888',
};

export function PipelineGlow({ status, height }: PipelineGlowProps) {
  const lightRef = useRef<any>(null!);
  const color = new Color(STATUS_COLORS[status]);

  // Pulse animation for active states
  useFrame((state) => {
    if (!lightRef.current) return;
    const t = state.clock.getElapsedTime();
    
    if (status === 'running') {
      lightRef.current.intensity = 1.5 + Math.sin(t * 4) * 0.8;
    } else if (status === 'failed') {
      lightRef.current.intensity = 1.0 + Math.sin(t * 2) * 0.5;
    } else if (status === 'success') {
      // Fade out slowly
      lightRef.current.intensity = Math.max(0, lightRef.current.intensity - 0.01);
    }
  });

  if (status === 'idle') return null;

  return (
    <>
      {/* Point light emanating from building top */}
      <pointLight
        ref={lightRef}
        position={[0, height + 2, 0]}
        color={color}
        intensity={2.0}
        distance={15}
        decay={2}
      />

      {/* Emissive ring at base */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.8, 2.2, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.5}
          transparent
          opacity={0.6}
        />
      </mesh>
    </>
  );
}
```

---

## 9. Fireworks Effect

```tsx
// src/scene/effects/Fireworks.tsx

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Points, PointsMaterial, BufferGeometry, Float32BufferAttribute, Color } from 'three';

interface FireworksProps {
  position: [number, number, number];
  color: string;
  duration: number;
  active: boolean;
  onComplete?: () => void;
}

const PARTICLE_COUNT = 200;

export function Fireworks({ position, color, duration, active, onComplete }: FireworksProps) {
  const pointsRef = useRef<Points>(null!);
  const startTime = useRef(Date.now());
  const velocities = useRef<Float32Array>(new Float32Array(PARTICLE_COUNT * 3));

  const geometry = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    
    // Initialize all particles at launch point
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      // Random explosion velocity
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 2 + Math.random() * 5;
      velocities.current[i * 3]     = speed * Math.sin(phi) * Math.cos(theta);
      velocities.current[i * 3 + 1] = speed * Math.cos(phi) + 2; // Upward bias
      velocities.current[i * 3 + 2] = speed * Math.sin(phi) * Math.sin(theta);
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    return geo;
  }, []);

  useFrame((state) => {
    if (!active || !pointsRef.current) return;

    const elapsed = (Date.now() - startTime.current) / 1000;
    const progress = elapsed / (duration / 1000);

    if (progress >= 1) {
      onComplete?.();
      return;
    }

    const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
    const dt = 0.016; // ~60fps

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3]     += velocities.current[i * 3] * dt;
      positions[i * 3 + 1] += (velocities.current[i * 3 + 1] - 9.8 * elapsed * 0.5) * dt;
      positions[i * 3 + 2] += velocities.current[i * 3 + 2] * dt;
    }

    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    
    // Fade out
    if (pointsRef.current.material) {
      (pointsRef.current.material as PointsMaterial).opacity = 1 - progress;
    }
  });

  if (!active) return null;

  return (
    <points ref={pointsRef} geometry={geometry} position={position}>
      <pointsMaterial
        size={0.3}
        color={new Color(color)}
        transparent
        opacity={1}
        sizeAttenuation
      />
    </points>
  );
}
```

---

## 10. HUD Overlay

```tsx
// src/ui/HUD.tsx

import { ActivityFeed } from './ActivityFeed';
import { Leaderboard } from './Leaderboard';
import { TimeControls } from './TimeControls';
import { ConnectionStatus } from './ConnectionStatus';
import { useCityStore } from '../store/cityStore';
import { useUIStore } from '../store/uiStore';

export function HUD() {
  const stats = useCityStore(s => s.cityState?.stats);
  const isConnected = useCityStore(s => s.isConnected);
  const focusedDistrict = useUIStore(s => s.focusedDistrict);

  return (
    <div className="fixed inset-0 pointer-events-none z-10 font-mono">
      
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-white text-xl font-bold tracking-wider">
            🏙️ GitLab City
          </h1>
          <ConnectionStatus connected={isConnected} />
        </div>
        
        {stats && (
          <div className="flex gap-6 text-xs text-blue-200">
            <StatPill icon="🏢" label="Districts" value={stats.totalBuildings} />
            <StatPill icon="👷" label="Workers" value={stats.activeDevelopers} />
            <StatPill icon="📦" label="Commits" value={stats.totalCommits} />
            <StatPill icon="🔀" label="MRs" value={stats.totalMergeRequests} />
          </div>
        )}
      </div>

      {/* Left panel: Activity Feed */}
      <div className="absolute top-16 left-4 w-72 pointer-events-auto">
        <ActivityFeed />
      </div>

      {/* Right panel: Leaderboard */}
      <div className="absolute top-16 right-4 w-64 pointer-events-auto">
        <Leaderboard />
      </div>

      {/* Bottom: Time Controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto">
        <TimeControls />
      </div>

      {/* District detail panel (on click) */}
      {focusedDistrict && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-auto">
          <DistrictPanel district={focusedDistrict} />
        </div>
      )}
    </div>
  );
}

function StatPill({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="bg-black/40 backdrop-blur rounded-full px-3 py-1 flex items-center gap-1">
      <span>{icon}</span>
      <span className="text-white font-bold">{value.toLocaleString()}</span>
      <span className="text-blue-300">{label}</span>
    </div>
  );
}
```

---

## 11. Advanced Features Design

### 11.1 Night/Day Cycle

```typescript
// The city transitions between day and night based on real UTC time
// or based on the organization's primary timezone

interface DayCycleConfig {
  // Real-time mode: sync with UTC
  mode: 'realtime' | 'activity';
  
  // Activity mode: day when commits happening, night when quiet
  activityThreshold: number; // commits per hour to count as "day"
}

// In Sky.tsx, compute sun position:
const hour = new Date().getUTCHours();
const sunAngle = (hour / 24) * Math.PI * 2;
const sunPosition = [Math.cos(sunAngle) * 100, Math.sin(sunAngle) * 80, 0];
```

### 11.2 Technical Debt Visualization

```typescript
// Buildings with high tech debt score show visual degradation:
// - Cracked textures (if using texture maps)
// - Orange/rust color tinting
// - Slightly crooked floors (rotation offset per floor)
// - Scaffolding/maintenance frames around exterior

function getTechDebtVisuals(score: number) {
  return {
    colorTint: score > 70 ? '#AA5533' : score > 40 ? '#887766' : '#334466',
    floorRotationNoise: score / 1000,   // subtle lean
    showScaffolding: score > 60,
    emissiveIntensity: 0,
  };
}
```

### 11.3 Productivity Heatmap

```typescript
// Overlay mode: color districts by commit frequency
// Use a color scale from cold (blue) → hot (red)

function getHeatmapColor(commitsPerDay: number, maxCommitsPerDay: number): string {
  const normalized = commitsPerDay / maxCommitsPerDay;
  // Interpolate through blue → teal → yellow → red
  const r = Math.floor(normalized * 255);
  const b = Math.floor((1 - normalized) * 200);
  return `rgb(${r}, 80, ${b})`;
}
```

### 11.4 Developer District (Personal Zone)

```typescript
// Each developer can have their own small personal building
// that reflects their contribution stats:
// - Height = total lifetime commits
// - Style = primary language they contribute to
// - Badge = role (maintainer, contributor, reviewer)
```
