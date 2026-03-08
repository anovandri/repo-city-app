# 🏙️ GitLab City

> **Transform your GitLab organization into a living, animated city where developers appear as workers building in real time.**

---

## What is GitLab City?

GitLab City is a real-time, event-driven **3D city visualization** system that maps GitLab development activity onto an animated isometric city.

Every repository becomes a **district**. Every developer becomes a **worker avatar**. Every commit adds a **floor to a building**. Every pipeline failure triggers **smoke and warning lights**.

The city grows — and breathes — exactly as your software does.

---

## Live Demo Prototype

Open the standalone prototype right now — no server required:

```
docs/prototype/index.html
```

Open it in any modern browser. Click the control buttons to simulate events:

| Button | What happens in the city |
|---|---|
| **+ Commit** | A worker walks to a repo district and adds a floor |
| **⟷ Merge Request** | Two workers meet and celebrate, building gets 3 floors |
| **✅ Pipeline OK** | District lights up green, workers celebrate |
| **❌ Pipeline Fail** | Smoke rises, red warning lights flash, workers look worried |
| **🎆 Release** | Multi-color fireworks over the district |

---

## Documentation Index

| Document | Contents | Status |
|---|---|---|
| [`docs/modular-monolith-architecture.md`](modular-monolith-architecture.md) | **Current active architecture** — Java/Spring Boot modular monolith, REST polling, 6 modules, WebSocket/STOMP | ✅ Active |
| [`docs/architecture.md`](architecture.md) | Original webhook-based microservices design (Node.js, Redis Streams) | Reference |
| [`docs/data-models.md`](data-models.md) | TypeScript types, webhook payloads, DB schema | Reference |
| [`docs/backend-design.md`](backend-design.md) | Node.js implementation details for original design | Reference |
| [`docs/frontend-design.md`](frontend-design.md) | Three.js scene, React components, animation system | Future target |
| [`docs/prototype/index.html`](prototype/index.html) | Standalone runnable demo (Three.js, no server needed) | ✅ Complete |

---

## Architecture in 30 Seconds

> **Current implementation** uses a modular monolith with REST polling (see [`modular-monolith-architecture.md`](modular-monolith-architecture.md)):

```
GitLab REST API (polled every 30s)
  → Poller Module (Java 21 virtual threads)
    → City-State Module (Spring ApplicationEvents)
      → Realtime Module (Spring WebSocket / STOMP)
        → Browser (Three.js city visualization)
```

> The original webhook-based design (Node.js + Redis Streams) is documented in `architecture.md` for reference, but is not the current implementation — webhook access to GitLab is unavailable in this environment.

---

## Event → City Mapping

| GitLab Event | City Effect |
|---|---|
| Push / Commit | Worker walks to repo → building gains floor(s) |
| Lines of code added | Floor height bonus |
| Merge Request merged | Two workers celebrate → building upgrade (+3 floors) |
| Pipeline running | Construction cranes activate, amber glow |
| Pipeline success | Green glow on district, workers celebrate |
| Pipeline failed | Red glow, smoke particles, workers look distressed |
| Issue opened | Warning sign placed on building |
| Issue closed | Warning sign removed |
| Tag / Release | Fireworks burst over the district |
| New repository | New district appears in the city |

---

## Full System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GITLAB ORGANIZATION                       │
│                                                             │
│  Repo A   Repo B   Repo C  (webhooks configured)           │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS POST (X-Gitlab-Token)
                       ▼
        ┌──────────────────────────┐
        │  Webhook Receiver        │  Node.js + Express
        │  • Token validation      │  Port 3001
        │  • Payload normalization │
        │  • Redis Streams publish │
        └──────────────┬───────────┘
                       │
        ┌──────────────▼───────────┐
        │  Redis Streams           │  Message Queue
        │  city.events.commit      │  (BullMQ compatible)
        │  city.events.pipeline    │
        │  city.events.mr          │
        └──────────────┬───────────┘
                       │
        ┌──────────────▼───────────┐
        │  Event Processor         │  Node.js
        │  • CityStateManager      │  Consumer Group
        │  • CommitHandler         │
        │  • PipelineHandler       │
        │  • MergeRequestHandler   │
        │  • DB persistence        │
        └──────────────┬───────────┘
                       │ Redis Pub/Sub
        ┌──────────────▼───────────┐
        │  WebSocket Server        │  Socket.io
        │  • Room per org          │  Port 3002
        │  • Snapshot on connect   │
        │  • Mutation broadcast    │
        └──────────────┬───────────┘
                       │ WebSocket
        ┌──────────────▼───────────┐
        │  Browser                 │  React + Three.js
        │  • Isometric 3D scene    │
        │  • Building animations   │
        │  • Worker avatars        │
        │  • Particle effects      │
        │  • React HUD overlay     │
        └──────────────────────────┘
```

---

## City Visual Elements

### Buildings

- One **district** per repository
- One **main building** per branch, growing with each commit
- Height = cumulative commit count + lines-of-code bonuses
- Style varies by primary language (office, factory, tower, lab…)
- Glow color reflects pipeline status

### Workers

- One **worker avatar** per active developer
- Voxel/block-style character with customized hard-hat color (deterministic per user ID)
- Walk toward the relevant district on commit
- Perform construction animation during build
- Celebrate on pipeline success / MR merge
- Look worried on pipeline failure

### Cranes

- One crane per concurrent pipeline job
- Cranes appear during `pipeline.running`
- Rotate slowly, warning lights blink amber
- Disappear on success (gracefully) or failure (abruptly)

### Effects

- **Dust particles** on each floor added
- **Smoke particles** on pipeline failure
- **Green glow** + point light on pipeline success
- **Fireworks** on tag/release events
- **Warning signs** for open issues (severity = size)

---

## Data Models (Summary)

### CityEvent (normalized webhook)
```typescript
{
  id: string;
  type: 'commit' | 'merge_request.merged' | 'pipeline.success' | ...;
  organizationId: string;
  projectId: string;
  actor: { id, username, name, avatarUrl };
  payload: CommitPayload | PipelinePayload | ...;
  receivedAt: string;
}
```

### CityMutation (sent to browser)
```typescript
{ type: 'building.floor_added', buildingId, newFloorCount, ... }
{ type: 'worker.moved', workerId, toPosition, targetDistrictId, ... }
{ type: 'pipeline.status_changed', districtId, newStatus, activeCranes, ... }
{ type: 'fireworks.triggered', districtId, position, color, duration, ... }
```

### Building
```typescript
{
  id: string;
  floors: number;          // grows with commits
  style: BuildingStyle;    // visual style per language
  activeCranes: number;    // = concurrent pipeline jobs
  techDebtScore: number;   // affects visual degradation
}
```

---

## Backend Implementation

### Webhook Receiver (Express)

Key files:
- `services/webhook-receiver/src/app.ts` — Express server
- `services/webhook-receiver/src/routes/webhook.router.ts` — Route handler
- `services/webhook-receiver/src/normalizers/WebhookNormalizer.ts` — GitLab → CityEvent
- `services/webhook-receiver/src/queue/EventPublisher.ts` — Redis Streams publisher

### Event Processor

Key files:
- `services/event-processor/src/processor/EventProcessor.ts` — Main loop
- `services/event-processor/src/state/CityStateManager.ts` — State mutations
- `services/event-processor/src/state/handlers/CommitHandler.ts` — Commit → floors
- `services/event-processor/src/state/handlers/PipelineHandler.ts` — CI/CD → cranes/glow

### WebSocket Server (Socket.io)

Key files:
- `services/websocket-server/src/server.ts` — Socket.io + Redis adapter

---

## Frontend Implementation

### React Three Fiber Scene

Key components:
- `src/scene/CityScene.tsx` — Root R3F canvas
- `src/scene/building/Building.tsx` — Animated building mesh
- `src/scene/worker/WorkerAvatar.tsx` — Developer avatar
- `src/scene/effects/PipelineGlow.tsx` — Pipeline status lighting
- `src/scene/effects/Fireworks.tsx` — Release celebration
- `src/scene/camera/IsometricCamera.tsx` — Camera rig

### State Management

- `src/store/cityStore.ts` — Zustand store, mutation reducer
- `src/hooks/useCitySocket.ts` — WebSocket event handling

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend 3D | Three.js + React Three Fiber |
| Frontend UI | React + Zustand + Tailwind CSS |
| Animation | GSAP |
| Post-processing | @react-three/postprocessing (Bloom) |
| Backend | Node.js + TypeScript + Express |
| Message Queue | Redis Streams + BullMQ |
| Real-time | Socket.io with Redis adapter |
| Database | PostgreSQL + TimescaleDB |
| Cache | Redis |
| GitLab API | @gitbeaker/node |
| Containers | Docker + Kubernetes |

---

## Setup Guide (Production)

### 1. GitLab Webhook Configuration

In each GitLab repository → Settings → Webhooks:

```
URL:        https://your-city-server.com/webhook/{orgId}
Secret:     your-webhook-secret-token
Events:     ✅ Push events
            ✅ Merge request events
            ✅ Pipeline events
            ✅ Issues events
            ✅ Tag push events
```

### 2. Backend Services

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit REDIS_URL, DATABASE_URL, GITLAB_TOKEN, WEBHOOK_SECRET

# Start all services
docker-compose up -d

# Or individually:
npm run start:webhook-receiver  # Port 3001
npm run start:event-processor
npm run start:websocket-server  # Port 3002
```

### 3. Frontend

```bash
cd frontend
npm install

# Configure
cp .env.example .env.local
# Set VITE_WS_URL=ws://your-city-server.com:3002
# Set VITE_ORG_ID=your-gitlab-group-id

npm run dev
```

### 4. Bootstrap Historical Data

```bash
# Populate city from existing GitLab history
npm run bootstrap -- --org-id YOUR_ORG_ID --group-path your-group/path
```

---

## Advanced Features Roadmap

### Phase 1 — Core (MVP)
- [x] Webhook receiver + normalizer
- [x] Building floor animations
- [x] Worker avatar system
- [x] Pipeline crane system
- [x] Particle effects

### Phase 2 — Enrichment
- [ ] Historical replay (time-travel slider)
- [ ] Night/day cycle (UTC-based or activity-based)
- [ ] Multi-building districts (one per service/package)
- [ ] Developer personal buildings (contribution totals)
- [ ] Issue severity signs

### Phase 3 — Analytics
- [ ] Productivity heatmap overlay
- [ ] Technical debt visualization (building degradation)
- [ ] Repository health score
- [ ] Commit frequency leaderboard
- [ ] Team collaboration graph

### Phase 4 — Social
- [ ] Share city screenshots
- [ ] Leaderboard gamification
- [ ] Release celebration notifications
- [ ] Slack/Teams integration for milestones

---

## Design Principles

1. **Every event is visible** — No GitLab activity goes unrepresented
2. **Animation first** — The city must feel alive, not just accurate
3. **Performance matters** — 60fps with 50+ districts and 100+ workers
4. **Instant understanding** — A new viewer should "get it" in under 10 seconds
5. **Dogfood it** — The GitLab City backend should visualize itself being built

---

## Contributing

The system is designed to be extended. To add a new event mapping:

1. Add a normalizer in `services/webhook-receiver/src/normalizers/`
2. Add a handler in `services/event-processor/src/state/handlers/`
3. Add a visual component in `frontend/src/scene/effects/`
4. Map the mutation in `frontend/src/store/cityStore.ts`

---

*GitLab City — where code becomes skyline.*
