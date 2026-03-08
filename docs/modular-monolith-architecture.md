# Repo City — Modular Monolith Architecture

> **Version:** 1.0
> **Date:** June 2025
> **Status:** Active Design (supersedes webhook-based design for current deployment constraints)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Context](#2-system-context)
3. [Why Modular Monolith](#3-why-modular-monolith)
4. [Module Map](#4-module-map)
5. [Module Dependency Graph](#5-module-dependency-graph)
6. [Detailed Module Descriptions](#6-detailed-module-descriptions)
7. [End-to-End Data Flow](#7-end-to-end-data-flow)
8. [Persistence Model](#8-persistence-model)
9. [Realtime Contract (WebSocket)](#9-realtime-contract-websocket)
10. [Frontend Integration](#10-frontend-integration)
11. [Package Structure](#11-package-structure)
12. [Deployment View](#12-deployment-view)
13. [Technology Decisions](#13-technology-decisions)
14. [Comparison with Previous Architecture](#14-comparison-with-previous-architecture)
15. [Future Evolution Path](#15-future-evolution-path)

---

## 1. Executive Summary

Repo City visualizes GitLab development activity as a living 3D city. Each repository is a district; each commit raises a building floor; each merge request sends workers walking across the map.

The initial design (see `architecture.md`) assumed GitLab webhook delivery — a push-based model where GitLab POSTs event payloads to a receiver. **This approach is not available in the current environment.** Webhook registration requires administrator-level GitLab permissions or self-hosted GitLab access that is not present.

Instead, Repo City uses **REST API polling** — the backend periodically calls the GitLab REST API to fetch new commits, merge requests, and pipelines. This works with standard developer-level tokens and requires no GitLab configuration changes.

Given that constraint — and the reality that this system serves a single organization with 18 repositories and 36 developers — a **modular monolith** is the right architectural choice:

- **Single deployable unit** — one Spring Boot JAR, one process, one database
- **In-process communication** — no Redis, no message broker, no network hops between services
- **Clear module boundaries** — encapsulation enforced at the package level, not the network level
- **Lower operational overhead** — no container orchestration required; runs on a single VM or laptop
- **Easier evolution** — modules can be extracted to microservices later if load justifies it

The application is written in **Java 21** with **Spring Boot 3.x**, leveraging virtual threads (Project Loom) for high-concurrency polling without blocking threads.

---

## 2. System Context

```
┌───────────────────────────────────────────────────────────────┐
│                    GITLAB (External)                          │
│                                                               │
│  /projects/{id}/repository/commits                            │
│  /projects/{id}/merge_requests                                │
│  /projects/{id}/pipelines                                     │
└────────────────────────┬──────────────────────────────────────┘
                         │  HTTPS GET (REST API, token auth)
                         │  Polled every N seconds per repo
                         ▼
┌───────────────────────────────────────────────────────────────┐
│            REPO CITY BACKEND (Modular Monolith)               │
│                   Spring Boot 3.x / Java 21                   │
│                                                               │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐   │
│  │  poller     │──▶│  city-state  │──▶│   realtime       │   │
│  │  module     │   │  module      │   │   module         │   │
│  └─────────────┘   └──────┬───────┘   └──────────────────┘   │
│                           │                      │            │
│  ┌─────────────┐   ┌──────▼───────┐              │            │
│  │  identity   │◀──│  api         │              │            │
│  │  module     │   │  module      │              │            │
│  └─────────────┘   └──────────────┘              │            │
│                                                  │            │
│  ┌──────────────────────────────────────────┐    │            │
│  │  scheduler module                        │    │            │
│  └──────────────────────────────────────────┘    │            │
└──────────────────────────────────────────────────┼────────────┘
                                                   │  WebSocket / STOMP
                                                   ▼
┌───────────────────────────────────────────────────────────────┐
│                    BROWSER (Frontend)                         │
│                                                               │
│  Three.js city visualization  +  2D HUD overlay               │
│  (prototype: docs/prototype/index.html)                       │
└───────────────────────────────────────────────────────────────┘
```

**Data flows in one direction:** GitLab → Backend → Browser. There is no webhook push from GitLab; all data is pull-based on a timer.

---

## 3. Why Modular Monolith

### 3.1 The Core Constraint

GitLab webhook delivery is unavailable. This eliminates the entire ingestion layer from `architecture.md` (webhook receiver → Redis Streams → event processor). The replacement — REST API polling — is inherently **pull-based and centralized**. There is no meaningful partitioning of work that would justify separate services.

### 3.2 Scale Does Not Justify Microservices

| Dimension | Current Scale | Microservices Threshold |
|---|---|---|
| Repositories | 18 | 100+ |
| Developers | 36 | 500+ |
| Events per poll cycle | ~20–200 | 10,000+ |
| Concurrent WebSocket clients | < 50 | 1,000+ |
| Team size | 1–2 | 5+ per service |

At current scale, microservices would add 80% overhead (network, deployment, monitoring) for 0% additional throughput benefit.

### 3.3 Modular Monolith Gives Clean Architecture

A modular monolith enforces the same **domain boundaries** as microservices — modules have clear interfaces and cannot directly access each other's internals — but all modules run in the same JVM process:

- **Same benefits:** separation of concerns, independent replaceability, clear ownership
- **Without the costs:** no service discovery, no distributed tracing, no inter-service latency, no partial failure handling

### 3.4 Virtual Threads Enable High Concurrency

Java 21 virtual threads (Project Loom) allow the poller to issue 18 concurrent GitLab API calls — one per repository — without 18 platform threads. The scheduler can run hundreds of virtual threads without thread pool exhaustion, making the polling loop efficient even as repositories grow.

---

## 4. Module Map

The application is organized into **6 modules**, each a cohesive package with a single well-defined responsibility:

| Module | Package | Responsibility |
|---|---|---|
| `poller` | `com.repocity.poller` | Fetches data from GitLab REST API; persists raw events |
| `city-state` | `com.repocity.citystate` | Maintains live city state (buildings, workers, events); computes mutations |
| `realtime` | `com.repocity.realtime` | WebSocket / STOMP server; broadcasts city mutations to browsers |
| `api` | `com.repocity.api` | REST endpoints for frontend bootstrap (repos, users, state snapshot) |
| `identity` | `com.repocity.identity` | User and repository master data; role resolution |
| `scheduler` | `com.repocity.scheduler` | Poll scheduling, rate limiting, adaptive back-off |

---

## 5. Module Dependency Graph

Dependencies flow in one direction. Lower-level modules do not depend on higher-level ones.

```
                    ┌─────────────┐
                    │  scheduler  │
                    └──────┬──────┘
                           │ triggers
                           ▼
┌────────────────────────────────────────────────────┐
│                    poller                          │
│  (GitLabClient, PollerService, EventDispatcher)    │
└────────┬──────────────────────────────┬────────────┘
         │ ApplicationEvent             │ reads
         │ (PollCycleCompleted)         ▼
         │                    ┌────────────────┐
         │                    │   identity     │
         │                    │  (users, repos)│
         │                    └───────┬────────┘
         │                            │ reads
         ▼                            ▼
┌─────────────────────────────────────────────────────┐
│                   city-state                        │
│  (CityStateService, BuildingState, WorkerState)     │
└─────────────────────┬───────────────────────────────┘
                      │ ApplicationEvent
                      │ (CityMutationEvent)
                      ▼
             ┌─────────────────┐
             │    realtime     │
             │  (WebSocket /   │
             │   STOMP broker) │
             └────────┬────────┘
                      │ STOMP
                      ▼
                  Browser

           ┌──────────────┐
           │     api      │◀── reads city-state + identity
           │  (REST layer)│
           └──────────────┘
```

**Allowed dependency directions:**

```
scheduler   → poller
poller      → identity
city-state  → identity
poller      → city-state  (via Spring Events only — no direct method call)
city-state  → realtime    (via Spring Events only)
api         → city-state
api         → identity
```

**Prohibited:**
- `identity` must NOT depend on any other module
- `poller` must NOT call `city-state` methods directly (only publish events)
- `city-state` must NOT call `realtime` methods directly (only publish events)
- `realtime` must NOT depend on `poller`, `api`, or `scheduler`

---

## 6. Detailed Module Descriptions

### 6.1 `poller` Module

**Package:** `com.repocity.poller`
**Status:** ✅ Implemented

This module already exists in `apps/rest-poller/`. It is the entry point for all GitLab data.

#### Responsibilities

- Maintain an `HttpClient` with a virtual thread executor for concurrent API calls
- Poll three GitLab endpoints per repository: commits, merge requests, pipelines
- Persist raw polling results as `PollEvent` rows in the database
- Publish `PollCycleCompleted` Spring application events for downstream modules to react to

#### Key Components

| Class | Role |
|---|---|
| `GitLabClient` | HTTP client; `fetchCommits(slug, since)`, `fetchMergeRequests(slug, state)`, `fetchPipelines(slug, since)` |
| `PollerService` | Orchestrates one poll cycle across all repos using virtual threads |
| `EventDispatcher` | Parses JSON response arrays → `PollEvent` entities; publishes Spring events |
| `PollEvent` | JPA entity: `eventType`, `repoSlug`, `authorUsername`, `payload` (TEXT ≤4096), `createdAt` |

#### Event Types Produced

| `PollEvent.eventType` | Source endpoint |
|---|---|
| `COMMIT` | `GET /projects/{id}/repository/commits` |
| `MR_OPENED` | `GET /projects/{id}/merge_requests?state=opened` |
| `MR_MERGED` | `GET /projects/{id}/merge_requests?state=merged` |
| `PIPELINE` | `GET /projects/{id}/pipelines` |

#### Polling Behavior

- One virtual thread per repository per poll cycle
- Each thread calls all three endpoints independently
- Results are persisted immediately; `since` timestamp tracked per repo to avoid duplicates
- On error (4xx, 5xx, network failure), the repo is skipped for this cycle and retried next cycle

---

### 6.2 `city-state` Module

**Package:** `com.repocity.citystate`
**Status:** 🔲 To be implemented

This module is the heart of the application. It maintains the live state of the city and computes how each incoming event mutates it.

#### Responsibilities

- Listen for `PollCycleCompleted` Spring events from the `poller` module
- Resolve raw events (by `repoSlug` + `authorUsername`) to rich domain objects using `identity` module
- Apply **city mutation rules** (see table below) to update in-memory city state
- Persist city state snapshots to the database at configurable intervals
- Publish `CityMutationEvent` Spring events for the `realtime` module to broadcast

#### State Held In Memory

```
CityState
├── districts[]            (one per repository)
│   ├── districtId
│   ├── repoSlug
│   ├── buildingFloors      (int — grows with commits)
│   ├── openMrCount         (int — drives building intensity)
│   ├── pipelineStatus      (IDLE | RUNNING | SUCCESS | FAILED)
│   └── activeWorkerIds[]
├── workers[]              (one per developer active in last N days)
│   ├── workerId
│   ├── displayName
│   ├── role               (ENGINEER | CARETAKER | LEADER)
│   ├── gender
│   ├── currentDistrictSlug
│   └── lastSeenAt
├── recentEvents[]         (ring buffer, last 50 events for activity feed)
└── stats
    ├── totalCommits
    ├── totalMrsMerged
    └── activeDeveloperCount
```

#### City Mutation Rules

| Incoming event | City mutation |
|---|---|
| `COMMIT` | Worker moves to repo's district; `buildingFloors += 1` |
| `MR_OPENED` | Worker moves to repo's district; `openMrCount += 1`; MR beam animation |
| `MR_MERGED` | `openMrCount -= 1`; `buildingFloors += 3`; merge success burst animation |
| `PIPELINE` (running) | `pipelineStatus = RUNNING`; crane animation activated |
| `PIPELINE` (success) | `pipelineStatus = SUCCESS`; green glow animation |
| `PIPELINE` (failed) | `pipelineStatus = FAILED`; smoke particle animation |

#### Key Components

| Class | Role |
|---|---|
| `CityStateService` | Listens for `PollCycleCompleted`; applies mutation rules; publishes `CityMutationEvent` |
| `CityState` | In-memory value object representing the full city |
| `DistrictState` | Per-repository state: floors, MR count, pipeline status, worker positions |
| `WorkerState` | Per-developer state: current location, last activity |
| `MutationRule` | Interface for each event→mutation transform |
| `CitySnapshotRepository` | JPA — persists periodic snapshots for reconnect recovery |

---

### 6.3 `realtime` Module

**Package:** `com.repocity.realtime`
**Status:** 🔲 To be implemented

This module bridges the backend city state to connected browser clients using WebSocket / STOMP.

#### Responsibilities

- Configure Spring WebSocket with STOMP message broker
- Listen for `CityMutationEvent` Spring events from `city-state`
- Serialize mutations to JSON and broadcast to all subscribed clients
- On new client connection, send a full city state snapshot (so late-joining browsers catch up)
- Handle client disconnections gracefully

#### WebSocket Endpoints

| STOMP destination | Direction | Content |
|---|---|---|
| `/topic/city/mutations` | Server → Client | Incremental `CityMutationMessage` per event |
| `/topic/city/snapshot` | Server → Client (on connect) | Full `CitySnapshotMessage` |
| `/app/city/subscribe` | Client → Server | Client registration / org selection |

#### Key Components

| Class | Role |
|---|---|
| `WebSocketConfig` | `@Configuration`; configures STOMP over SockJS |
| `CityBroadcaster` | `@EventListener`; receives `CityMutationEvent` → broadcasts via `SimpMessagingTemplate` |
| `SessionConnectHandler` | `ApplicationListener<SessionConnectedEvent>`; sends snapshot to new subscriber |
| `CityMutationMessage` | DTO: `type`, `repoSlug`, `actorName`, `animationHint`, `timestamp` |
| `CitySnapshotMessage` | DTO: full `CityState` serialized to JSON |

---

### 6.4 `api` Module

**Package:** `com.repocity.api`
**Status:** 🔲 To be implemented

Provides REST endpoints for the frontend's initial page load — before the WebSocket connection is established.

#### Responsibilities

- Return the list of all repositories (for building the initial city layout)
- Return the list of all developers (for populating worker avatars)
- Return the current city state snapshot (for rendering the city before live events arrive)
- Return recent event history (for populating the activity feed on load)

#### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/repos` | All 18 repositories with slug, icon, openMrCount |
| `GET` | `/api/users` | All 36 developers with displayName, role, gender |
| `GET` | `/api/city/snapshot` | Current full city state (districts + workers + stats) |
| `GET` | `/api/city/events?limit=50` | Recent 50 events (for activity feed) |
| `GET` | `/api/health` | Health check: `{"status": "UP", "pollCycleCount": N}` |

#### Key Components

| Class | Role |
|---|---|
| `RepoController` | `@RestController`; serves `/api/repos` from `identity` module |
| `UserController` | `@RestController`; serves `/api/users` from `identity` module |
| `CityController` | `@RestController`; serves `/api/city/*` from `city-state` module |
| `ApiResponse<T>` | Generic wrapper: `{ data, timestamp, status }` |

---

### 6.5 `identity` Module

**Package:** `com.repocity.identity`
**Status:** ✅ Mostly implemented (as `domain` + `repository` packages in `poller`)

This module owns the master data for users and repositories. Other modules read from it but never write to it directly.

#### Responsibilities

- Serve as the single source of truth for `GitLabRepository` and `GitlabUser` records
- Provide lookup methods: by slug, by GitLab username, by display name
- Seed initial data on startup (18 repos, 36 developers) from `data.sql`
- Expose role resolution: `isEngineer()`, `isLeader()`, `isCaretaker()`

#### Current entities (already implemented)

| Entity | Key fields |
|---|---|
| `GitLabRepository` | `id`, `slug`, `gitlabUrl`, `icon`, `openMrs` |
| `GitlabUser` | `id`, `displayName`, `gitlabUsername`, `gender`, `role` |
| `UserRole` | `ENGINEER`, `CARETAKER`, `LEADER` |
| `Gender` | `MALE`, `FEMALE` |

#### Key Components

| Class | Role |
|---|---|
| `RepoRepository` | `JpaRepository`; `findBySlug(slug)` |
| `GitlabUserRepository` | `JpaRepository`; `findByGitlabUsername()`, `findByDisplayNameIgnoreCase()` |
| `IdentityService` | Facade — wraps both repositories; used by `poller` and `city-state` |

---

### 6.6 `scheduler` Module

**Package:** `com.repocity.scheduler`
**Status:** 🔲 Partially implemented (inline in `PollerService`)

This module owns the timing logic for poll cycles. It is currently embedded inside `PollerService`; extracting it makes interval configuration and rate-limit management explicit.

#### Responsibilities

- Schedule recurring poll cycles at a configurable fixed delay
- Track per-repository poll timestamps to pass correct `since` parameters
- Implement adaptive back-off: if a repository returns 401 or 429, increase delay for that repo
- Expose metrics: last poll time, cycle duration, error count per repo

#### Configuration Properties

```properties
repocity.scheduler.poll-interval-seconds=30
repocity.scheduler.max-backoff-seconds=300
repocity.scheduler.initial-since-days=7
```

#### Key Components

| Class | Role |
|---|---|
| `PollScheduler` | `@Component`; uses `@Scheduled` or `ScheduledExecutorService` to trigger `PollerService.pollAll()` |
| `PollState` | Per-repo state: `lastPollTime`, `consecutiveErrors`, `backoffUntil` |
| `PollMetrics` | Spring Actuator integration: exposes poll cycle stats |

---

## 7. End-to-End Data Flow

A single poll cycle, traced from GitLab to browser:

```
1. SCHEDULER
   PollScheduler fires every 30 seconds
   │
   ▼
2. POLLER — PollerService.pollAll()
   Spawns one virtual thread per repository (18 threads)
   Each thread:
     a. Calls GitLabClient.fetchCommits(slug, since)
     b. Calls GitLabClient.fetchMergeRequests(slug, "opened")
     c. Calls GitLabClient.fetchMergeRequests(slug, "merged")
     d. Calls GitLabClient.fetchPipelines(slug, since)
   Results passed to EventDispatcher
   │
   ▼
3. POLLER — EventDispatcher
   For each API response item:
     a. Constructs PollEvent { eventType, repoSlug, authorUsername, payload }
     b. Deduplicates (skip if event already exists for this item)
     c. Saves PollEvent to database
   Publishes PollCycleCompleted(newEvents[]) via ApplicationEventPublisher
   │
   ▼ (Spring ApplicationEvent — same thread, same JVM)
   │
4. CITY-STATE — CityStateService (listens for PollCycleCompleted)
   For each new PollEvent:
     a. Resolves author: GitlabUserRepository.findByGitlabUsername(authorUsername)
     b. Resolves repo: RepoRepository.findBySlug(repoSlug)
     c. Applies mutation rule for eventType
     d. Updates in-memory CityState (district floors, worker position, pipeline status)
   Publishes CityMutationEvent(mutations[]) via ApplicationEventPublisher
   │
   ▼ (Spring ApplicationEvent — same thread, same JVM)
   │
5. REALTIME — CityBroadcaster (listens for CityMutationEvent)
   For each mutation:
     a. Serializes to CityMutationMessage JSON
     b. Broadcasts to /topic/city/mutations via SimpMessagingTemplate
   │
   ▼ (WebSocket / STOMP over SockJS)
   │
6. BROWSER — Three.js visualization
   Receives CityMutationMessage
   Triggers animation:
     - COMMIT   → blue beam + dev walks to repo + buildingFloors += 1
     - MR_OPENED → purple beam + MR indicator
     - MR_MERGED → green burst + openMrCount -= 1 + floors += 3
     - PIPELINE  → crane / glow / smoke depending on status
```

**No Redis. No HTTP. No network calls between steps 2–5.** Everything happens in the same JVM process via `ApplicationEventPublisher`.

---

## 8. Persistence Model

### 8.1 Databases

| Environment | Database | Configuration |
|---|---|---|
| Development / Test | H2 (in-memory) | `application.properties` |
| Production | PostgreSQL | `application-prod.properties` |

### 8.2 Tables

| Table | Owner module | Purpose |
|---|---|---|
| `gitlab_repository` | identity | 18 repositories (seeded from `data.sql`) |
| `gitlab_user` | identity | 36 developers (seeded from `data.sql`) |
| `poll_event` | poller | Append-only log of all polled events |
| `city_snapshot` | city-state | Periodic snapshots of full city state (for reconnect) |

### 8.3 What Lives In-Memory vs Database

| Data | Storage | Reason |
|---|---|---|
| Current city state (building floors, worker positions) | In-memory (`CityState`) | Mutated on every event; DB write would be too frequent |
| Recent events (ring buffer, last 50) | In-memory | For activity feed; fast access, non-critical |
| All raw poll events | Database (`poll_event`) | Audit trail; replay source; deduplication |
| City snapshots | Database (`city_snapshot`) | Recovery on restart; late-join snapshot for browsers |
| Repository + user master data | Database (`gitlab_repository`, `gitlab_user`) | Persistent; seeded once |

### 8.4 Deduplication Strategy

Each `PollEvent` stores a `gitlabEventId` (the GitLab item's `id` field). Before inserting, `EventDispatcher` checks for an existing row with the same `(eventType, repoSlug, gitlabEventId)` tuple. Duplicates are silently skipped.

---

## 9. Realtime Contract (WebSocket)

### 9.1 Connection

Clients connect via SockJS to `/ws` and subscribe to STOMP destinations.

```
WS endpoint:   ws://localhost:8080/ws
STOMP sub:     /topic/city/mutations     (live event stream)
               /topic/city/snapshot      (on-connect snapshot)
```

### 9.2 Message: `CityMutationMessage`

Sent on `/topic/city/mutations` for every processed event.

```json
{
  "type": "COMMIT",
  "repoSlug": "ms-transaction",
  "repoIcon": "💸",
  "actorDisplayName": "Rizki Ekaputri",
  "actorRole": "ENGINEER",
  "actorGender": "FEMALE",
  "animationHint": "COMMIT_BEAM",
  "newBuildingFloors": 14,
  "timestamp": "2025-06-01T09:32:11Z"
}
```

| `animationHint` value | Prototype trigger |
|---|---|
| `COMMIT_BEAM` | `fireCommitEvent(repoSlug, actorName)` |
| `MR_OPENED_BEAM` | `fireMREvent(repoSlug, actorName)` |
| `MERGE_SUCCESS` | `triggerMergeSuccess(repoSlug)` |
| `PIPELINE_RUNNING` | pipeline crane animation |
| `PIPELINE_SUCCESS` | green glow |
| `PIPELINE_FAILED` | smoke + red glow |

### 9.3 Message: `CitySnapshotMessage`

Sent on `/topic/city/snapshot` immediately after a client subscribes.

```json
{
  "districts": [
    {
      "repoSlug": "ms-transaction",
      "repoIcon": "💸",
      "buildingFloors": 14,
      "openMrCount": 6,
      "pipelineStatus": "SUCCESS",
      "activeWorkers": ["Rizki Ekaputri", "Bram Perdana"]
    }
  ],
  "workers": [
    {
      "displayName": "Rizki Ekaputri",
      "role": "ENGINEER",
      "gender": "FEMALE",
      "currentDistrictSlug": "ms-transaction"
    }
  ],
  "stats": {
    "totalCommits": 8420,
    "totalMrsMerged": 1103,
    "activeDeveloperCount": 36
  },
  "generatedAt": "2025-06-01T09:32:00Z"
}
```

---

## 10. Frontend Integration

### 10.1 Current State (Prototype)

`docs/prototype/index.html` is a fully working, **self-contained** Three.js visualization. All 18 repositories and 36 developers are hardcoded as `STRUCTURES` and `PEOPLE` arrays. Events are fired manually by clicking buttons.

The prototype is production-ready as a visualization engine. The only missing piece is replacing the manual button triggers with a WebSocket listener.

### 10.2 Integration Plan

The frontend integration requires **no Three.js changes**. Only the event source changes: instead of buttons, events come from a WebSocket connection.

```javascript
// Current (prototype) — manual trigger
fireCommitEvent('ms-transaction', 'Rizki Ekaputri');

// Future (integrated) — WebSocket driven
const socket = new SockJS('/ws');
const stompClient = Stomp.over(socket);

stompClient.connect({}, () => {
  stompClient.subscribe('/topic/city/mutations', (message) => {
    const mutation = JSON.parse(message.body);

    if (mutation.animationHint === 'COMMIT_BEAM') {
      fireCommitEvent(mutation.repoSlug, mutation.actorDisplayName);
    } else if (mutation.animationHint === 'MR_OPENED_BEAM') {
      fireMREvent(mutation.repoSlug, mutation.actorDisplayName);
    } else if (mutation.animationHint === 'MERGE_SUCCESS') {
      triggerMergeSuccess(mutation.repoSlug);
    }
  });
});
```

### 10.3 Bootstrap Sequence

```
1. Browser loads index.html
2. fetch('/api/repos')   → build STRUCTURES array
3. fetch('/api/users')   → build PEOPLE array
4. fetch('/api/city/snapshot') → set initial building floors, openMrCounts
5. Connect WebSocket (/ws) → subscribe to /topic/city/mutations
6. On connect, receive /topic/city/snapshot → reconcile any state diff
7. Live mutations arrive → animations play
```

This replaces the hardcoded `STRUCTURES` and `PEOPLE` arrays with server-driven data, making the visualization fully dynamic.

### 10.4 Activity Feed

The prototype already has toast notifications. The activity feed can be driven by the same `/topic/city/mutations` STOMP messages:

```javascript
// Append to activity feed on every mutation
stompClient.subscribe('/topic/city/mutations', (message) => {
  const { actorDisplayName, type, repoSlug, timestamp } = JSON.parse(message.body);
  activityFeed.prepend({ actor: actorDisplayName, event: type, repo: repoSlug, time: timestamp });
});
```

---

## 11. Package Structure

All modules live within a single Spring Boot application. The package hierarchy enforces module boundaries:

```
apps/
└── repo-city-app/                      ← Application root
    └── src/
        └── main/
            └── java/
                └── com/
                    └── repocity/
                        │
                        ├── RepoCityApplication.java        ← @SpringBootApplication entry point
                        │
                        ├── scheduler/                      ── MODULE: scheduler
                        │   ├── PollScheduler.java
                        │   ├── PollState.java
                        │   └── PollMetrics.java
                        │
                        ├── poller/                         ── MODULE: poller (existing)
                        │   ├── client/
                        │   │   └── GitLabClient.java
                        │   ├── domain/
                        │   │   └── PollEvent.java
                        │   ├── repository/
                        │   │   └── PollEventRepository.java
                        │   └── service/
                        │       ├── PollerService.java
                        │       └── EventDispatcher.java
                        │
                        ├── identity/                       ── MODULE: identity (existing as domain/)
                        │   ├── domain/
                        │   │   ├── GitLabRepository.java
                        │   │   ├── GitlabUser.java
                        │   │   ├── UserRole.java
                        │   │   └── Gender.java
                        │   └── repository/
                        │       ├── RepoRepository.java
                        │       └── GitlabUserRepository.java
                        │
                        ├── citystate/                      ── MODULE: city-state
                        │   ├── CityStateService.java
                        │   ├── model/
                        │   │   ├── CityState.java
                        │   │   ├── DistrictState.java
                        │   │   └── WorkerState.java
                        │   ├── event/
                        │   │   ├── PollCycleCompleted.java
                        │   │   └── CityMutationEvent.java
                        │   ├── mutation/
                        │   │   ├── MutationRule.java
                        │   │   ├── CommitMutationRule.java
                        │   │   ├── MrOpenedMutationRule.java
                        │   │   ├── MrMergedMutationRule.java
                        │   │   └── PipelineMutationRule.java
                        │   └── repository/
                        │       └── CitySnapshotRepository.java
                        │
                        ├── realtime/                       ── MODULE: realtime
                        │   ├── WebSocketConfig.java
                        │   ├── CityBroadcaster.java
                        │   ├── SessionConnectHandler.java
                        │   └── dto/
                        │       ├── CityMutationMessage.java
                        │       └── CitySnapshotMessage.java
                        │
                        └── api/                            ── MODULE: api
                            ├── RepoController.java
                            ├── UserController.java
                            ├── CityController.java
                            └── dto/
                                └── ApiResponse.java
```

---

## 12. Deployment View

### 12.1 Single-Process Deployment

```
┌──────────────────────────────────────────────────────────────┐
│                   Single JVM Process                         │
│                                                              │
│  Spring Boot 3.x application                                 │
│  Port 8080 (HTTP + WebSocket)                                │
│                                                              │
│  ┌────────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐  │
│  │  scheduler │  │  poller   │  │  city-   │  │ realtime │  │
│  │  module    │→ │  module   │→ │  state   │→ │ module   │  │
│  └────────────┘  └───────────┘  │  module  │  └──────────┘  │
│                                 └──────────┘                 │
│  ┌────────────┐  ┌───────────┐                               │
│  │  identity  │  │   api     │                               │
│  │  module    │  │  module   │                               │
│  └────────────┘  └───────────┘                               │
│                                                              │
│  Virtual Thread Pool (Project Loom)                          │
│  Spring ApplicationEventPublisher (in-process bus)           │
│  Spring WebSocket / STOMP broker                             │
└──────────────────────────┬───────────────────────────────────┘
                           │
              ┌────────────┴─────────────┐
              │                          │
   ┌──────────▼──────────┐   ┌───────────▼─────────┐
   │   H2 (dev/test)     │   │  PostgreSQL (prod)   │
   │   In-memory         │   │  Persistent          │
   └─────────────────────┘   └─────────────────────┘
```

### 12.2 Production Deployment Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| JVM Heap | 256 MB | 512 MB |
| CPU | 1 vCPU | 2 vCPU |
| PostgreSQL | Any PostgreSQL 14+ instance | |
| Network | Outbound HTTPS to GitLab | |
| Inbound | Port 8080 from browser clients | |

### 12.3 Configuration (Environment Variables)

```bash
# GitLab API
GITLAB_BASE_URL=https://gitlab.com
GITLAB_API_TOKEN=glpat-xxxxxxxxxxxx
GITLAB_GROUP=your-group-name

# Database (prod profile)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=repocity
DB_USERNAME=repocity
DB_PASSWORD=secret

# Polling
POLL_INTERVAL_SECONDS=30
```

---

## 13. Technology Decisions

### 13.1 Spring Events vs Redis Streams

| Criterion | Spring `ApplicationEventPublisher` | Redis Streams |
|---|---|---|
| Latency | ~0ms (same JVM) | 1–5ms (network) |
| Setup complexity | None (built into Spring) | Redis instance + configuration |
| Persistence | No (fire-and-forget) | Yes (append log) |
| Replay capability | No | Yes |
| Suitable for monolith | ✅ Yes | ❌ Overkill |
| Suitable for microservices | ❌ No | ✅ Yes |

**Decision:** Spring Events. The application is a monolith; network round-trips add cost with no benefit. If modules are later extracted to separate services, the event publication points become the natural integration boundary for a broker.

### 13.2 REST Polling vs Webhooks

| Criterion | REST API Polling | GitLab Webhooks |
|---|---|---|
| Requires GitLab admin access | No | Yes (webhook registration) |
| Works with developer token | Yes | No |
| Event latency | 10–60s (poll interval) | < 1s |
| Missed events | No (polls from timestamp) | Possible (transient failures) |
| Duplicate events | Yes (requires deduplication) | Rarely |
| Works without public IP | Yes | No (GitLab must reach your server) |

**Decision:** REST API polling. Webhooks require access that is not available. Polling is inherently more reliable (no missed events) and works with a standard developer token behind any firewall.

### 13.3 Virtual Threads (Project Loom)

Polling 18 repositories concurrently means 18 × 4 = 72 simultaneous HTTP calls per cycle. With traditional thread pools, this requires careful sizing. With virtual threads:

- `Executors.newVirtualThreadPerTaskExecutor()` creates one lightweight virtual thread per task
- No thread pool sizing; the JVM schedules virtual threads onto a small set of carrier threads
- Blocking I/O (HTTP) does not block carrier threads
- 72 concurrent calls consume negligible memory (~1KB per virtual thread vs ~1MB per platform thread)

### 13.4 H2 (Dev) / PostgreSQL (Prod)

- H2 in-memory for development and tests: no external dependencies, fast startup, reset on restart
- PostgreSQL for production: durable, queryable history, supports `TEXT` columns for JSON payloads
- The same JPA entities work for both; only `spring.datasource.*` changes between profiles

### 13.5 Spring WebSocket + STOMP (not Socket.io)

Spring's built-in WebSocket support with STOMP over SockJS:
- No additional dependencies beyond `spring-boot-starter-websocket`
- STOMP pub/sub model maps directly to the required broadcast pattern
- SockJS fallback handles environments where WebSocket is blocked
- Avoids introducing a separate Node.js process just for socket handling

---

## 14. Comparison with Previous Architecture

| Dimension | Previous (webhook-based microservices) | New (polling modular monolith) |
|---|---|---|
| **Language/runtime** | Node.js + TypeScript | Java 21 / Spring Boot 3.x |
| **Event ingestion** | GitLab pushes webhooks → receiver | Backend polls GitLab REST API |
| **Inter-service communication** | Redis Streams (network) | Spring ApplicationEventPublisher (in-process) |
| **Services** | 3 separate processes (webhook-receiver, event-processor, websocket-server) | 1 process (6 modules) |
| **External dependencies** | Redis + PostgreSQL | PostgreSQL only (H2 in dev) |
| **WebSocket** | Socket.io (Node.js) | Spring WebSocket + STOMP |
| **State management** | Redis cache + PostgreSQL snapshots | In-memory Java object + PostgreSQL snapshots |
| **Deployment** | Docker Compose / Kubernetes (3 containers) | Single JAR |
| **GitLab access required** | Admin-level (webhook registration) | Developer-level (read token) |
| **Event latency** | < 1 second | 10–60 seconds (poll interval) |
| **Missed events** | Possible on webhook failure | None (poll from timestamp) |
| **Operational complexity** | High (Redis, 3 services, service discovery) | Low (one process, one DB) |
| **Suitability for scale** | High (horizontal scaling per service) | Medium (single node; can be scaled if needed) |

**Trade-off summary:** The modular monolith sacrifices near-real-time event latency (< 1s) for dramatically lower operational complexity and no dependency on GitLab administrative access. For a team visualization dashboard — where 30-second event delay is acceptable — this is the correct trade-off.

---

## 15. Future Evolution Path

The modular monolith is explicitly designed for future extraction. Each module boundary represents a potential microservice boundary.

### 15.1 Extraction Triggers

| Trigger | Action |
|---|---|
| Repository count exceeds 50 | Extract `poller` → dedicated polling service; replace Spring Events with message queue (Kafka / RabbitMQ) |
| Concurrent WebSocket clients exceed 500 | Extract `realtime` → dedicated WebSocket service; add Redis Pub/Sub adapter |
| Frontend rebuilt as React app | Extract `api` → dedicated BFF (Backend for Frontend) |
| Multi-tenant (multiple GitLab orgs) | Extract `identity` → shared identity service with per-org data isolation |

### 15.2 Extraction Steps (Generic Pattern)

For any module:
1. Convert `ApplicationEventPublisher` publish points to message queue producers
2. Convert `@EventListener` handlers to message queue consumers
3. Move the module's packages to a new Spring Boot application
4. Update `pom.xml` in the new app to include only that module's dependencies
5. Wire configuration to point to the shared database or a dedicated database

Because each module already has clean interfaces (no cross-package field access, all communication via events or explicit service calls), extraction is straightforward.

### 15.3 Frontend Evolution

| Phase | Frontend | Integration |
|---|---|---|
| **Current** | `docs/prototype/index.html` (static, hardcoded data) | Manual button triggers |
| **Phase 1** | Same prototype + WebSocket listener added | `STRUCTURES` and `PEOPLE` from `/api/repos` and `/api/users` |
| **Phase 2** | React + Three.js application (per `frontend-design.md`) | Full WebSocket + REST bootstrap |
| **Phase 3** | Historical replay, leaderboard, analytics | Additional REST endpoints + replay stream |

Phase 1 requires approximately 50 lines of JavaScript added to the existing prototype — no framework change needed.

---

## Document Index

| Document | Description | Status |
|---|---|---|
| `architecture.md` | Original webhook-based microservices design | Reference / Superseded |
| `backend-design.md` | Node.js implementation details for original design | Reference / Superseded |
| `data-models.md` | TypeScript data models and webhook event reference | Reference |
| `frontend-design.md` | React + Three.js frontend component design | Future target |
| `modular-monolith-architecture.md` | **This document** — current active architecture | ✅ Active |
| `prototype/index.html` | Working Three.js city visualization | ✅ Complete |

---

*Repo City — where code becomes skyline.*
