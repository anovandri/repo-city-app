# GitLab City — System Architecture

> **Version:** 1.0  
> **Date:** March 6, 2026  
> **Author:** Architecture Team

---

## 1. Overview

**GitLab City** is a real-time, event-driven visualization system that transforms GitLab organization activity into a living, animated city. The city evolves continuously as developers commit code, open merge requests, and run pipelines. Each repository becomes a district, each developer becomes a worker avatar, and every CI/CD event drives construction machinery.

---

## 2. High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          GITLAB ORGANIZATION                            │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │  Repo A      │  │  Repo B      │  │  Repo C      │  ...             │
│  │  (frontend)  │  │  (backend)   │  │  (infra)     │                  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  │
│         │                 │                  │                          │
│         └─────────────────┴──────────────────┘                          │
│                           │                                             │
│                    Webhook Events                                       │
│                  (push, MR, pipeline)                                   │
└───────────────────────────┼─────────────────────────────────────────────┘
                            │ HTTPS POST
                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     INGESTION LAYER                                      │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                  Webhook Receiver Service                         │   │
│  │  • Node.js / Express (or Python / FastAPI)                       │   │
│  │  • Validates GitLab webhook secret token                         │   │
│  │  • Normalizes raw webhook payload                                │   │
│  │  • Publishes normalized event to message queue                   │   │
│  └────────────────────────────┬─────────────────────────────────────┘   │
└───────────────────────────────┼──────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     MESSAGE QUEUE (Redis Streams / BullMQ)               │
│                                                                          │
│   Topics / Streams:                                                      │
│   ├── city.events.commit                                                 │
│   ├── city.events.merge_request                                          │
│   ├── city.events.pipeline                                               │
│   ├── city.events.issue                                                  │
│   └── city.events.note                                                   │
│                                                                          │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     EVENT PROCESSING SERVICE                             │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  City State Manager                                              │    │
│  │  • Maintains in-memory + persisted city state                   │    │
│  │  • Maps events → city mutations                                 │    │
│  │  • Manages building heights, worker positions, pipeline states  │    │
│  │  • Persists snapshots to database (TimeSeries / PostgreSQL)     │    │
│  └────────────────────────────┬────────────────────────────────────┘    │
│                               │                                          │
│  ┌─────────────────────────────▼────────────────────────────────────┐   │
│  │  GitLab REST API Poller (optional enrichment)                    │   │
│  │  • Fetches contributors, project metadata on startup             │   │
│  │  • Enriches events with user avatars, project language, etc.     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     REALTIME BROADCAST LAYER                             │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │  WebSocket Server (Socket.io)                                  │     │
│  │  • Broadcasts city mutation events to all connected clients    │     │
│  │  • Supports rooms per organization / per project               │     │
│  │  • Sends full city snapshot on client connect                  │     │
│  └────────────────────────────┬───────────────────────────────────┘     │
└───────────────────────────────┼──────────────────────────────────────────┘
                                │ WebSocket (ws://)
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     FRONTEND (BROWSER)                                   │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │  React Application Shell                                       │     │
│  │  • Controls UI panels, HUD overlay, time controls              │     │
│  └────────────────────────────┬───────────────────────────────────┘     │
│                               │                                          │
│  ┌────────────────────────────▼───────────────────────────────────┐     │
│  │  City Visualization Engine (React Three Fiber + Three.js)      │     │
│  │  • Isometric 3D scene                                          │     │
│  │  • Building meshes per repository                              │     │
│  │  • Worker avatar animation system                              │     │
│  │  • Construction crane animators                                │     │
│  │  • Particle effects (smoke, sparks, fireworks)                 │     │
│  │  • Lighting system (pipeline success = green glow)             │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │  City State Store (Zustand / Redux)                            │     │
│  │  • Local mirror of server city state                           │     │
│  │  • Event queue for animation sequencing                        │     │
│  └────────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     PERSISTENCE LAYER                                    │
│                                                                          │
│  ┌─────────────────────────┐   ┌──────────────────────────────────┐     │
│  │  PostgreSQL             │   │  Redis                           │     │
│  │  • City snapshots       │   │  • Live city state cache         │     │
│  │  • Event history        │   │  • Message queue (BullMQ)        │     │
│  │  • Developer profiles   │   │  • Session management            │     │
│  └─────────────────────────┘   └──────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Responsibilities

### 3.1 Webhook Receiver Service

| Responsibility | Detail |
|---|---|
| Authentication | Validate `X-Gitlab-Token` header against shared secret |
| Event parsing | Parse raw payload into typed `GitLabEvent` objects |
| Normalization | Flatten nested objects, extract key fields (author, project, timestamp) |
| Publishing | Push normalized events onto the appropriate Redis stream |

**Technology:** Node.js + Express + TypeScript

---

### 3.2 Event Processing Service (City State Manager)

| Responsibility | Detail |
|---|---|
| Event consumption | Read from Redis Streams with consumer groups |
| State mutation | Apply event → city state transformation rules |
| Persistence | Write state snapshots to PostgreSQL at configurable intervals |
| Enrichment | Fetch GitLab API data for richer context (user info, project stats) |
| Broadcasting | Emit city mutation messages to Socket.io |

**Technology:** Node.js + TypeScript  
**Pattern:** Event Sourcing — all state is derived from the ordered event log

---

### 3.3 WebSocket Server

| Responsibility | Detail |
|---|---|
| Client management | Track connected browsers, assign to organization rooms |
| Initial state sync | Send full city snapshot on connection |
| Live broadcasting | Push `CityMutation` events to all room members |
| Playback mode | Support time-travel queries from client |

**Technology:** Socket.io (Node.js)

---

### 3.4 Frontend Visualization Engine

| Responsibility | Detail |
|---|---|
| Scene management | Three.js scene with isometric camera setup |
| District rendering | One `District` mesh group per GitLab project |
| Building animation | GSAP / Tween.js driven floor-addition animations |
| Worker system | Instanced mesh workers with pathfinding (simple A*) |
| Event reactions | Map incoming WebSocket events to animation triggers |
| HUD Overlay | React-based info panels, activity feed, leaderboard |

**Technology:** React + React Three Fiber + Three.js + Zustand

---

## 4. Deployment Architecture

```
┌───────────────────────────────────────────┐
│             Kubernetes Cluster            │
│                                           │
│  ┌────────────────┐  ┌────────────────┐   │
│  │ webhook-svc    │  │ processor-svc  │   │
│  │ (2 replicas)   │  │ (2 replicas)   │   │
│  └────────┬───────┘  └───────┬────────┘   │
│           │                  │            │
│           └──────┬───────────┘            │
│                  │                        │
│          ┌───────▼───────┐                │
│          │  Redis Cluster │               │
│          └───────┬────────┘               │
│                  │                        │
│          ┌───────▼────────┐               │
│          │  websocket-svc │               │
│          │  (2 replicas)  │               │
│          └───────┬────────┘               │
│                  │                        │
│          ┌───────▼────────┐               │
│          │   PostgreSQL   │               │
│          │  (primary +    │               │
│          │   read replica)│               │
│          └────────────────┘               │
│                                           │
│  ┌────────────────────────────────────┐   │
│  │  CDN / Static Hosting              │   │
│  │  (React App — Vercel / Netlify)    │   │
│  └────────────────────────────────────┘   │
└───────────────────────────────────────────┘
```

---

## 5. Security Considerations

1. **Webhook secret validation** — All incoming webhooks must present a `X-Gitlab-Token` matching the configured secret.
2. **Rate limiting** — The webhook receiver applies per-project rate limits to prevent event flooding.
3. **CORS** — WebSocket server restricts origins to the known frontend domain.
4. **API token scoping** — GitLab API access tokens are read-only and scoped per group.
5. **Data sanitization** — All commit messages and branch names are sanitized before broadcasting to prevent XSS.

---

## 6. Scalability Considerations

| Concern | Solution |
|---|---|
| High event volume | Redis Streams with consumer groups allow horizontal scaling of processors |
| Many concurrent viewers | Socket.io with Redis adapter enables multi-node WebSocket scaling |
| Large organizations | Virtual districts loaded lazily; only active districts render in 3D |
| Historical replay | Events stored in append-only log in PostgreSQL; replay streams events in time order |

---

## 7. Technology Stack Summary

| Layer | Technology | Rationale |
|---|---|---|
| Webhook Receiver | Node.js + Express + TypeScript | Lightweight, fast HTTP processing |
| Message Queue | Redis Streams + BullMQ | Low-latency, ordered event delivery |
| Event Processor | Node.js + TypeScript | Shared types with webhook receiver |
| Database | PostgreSQL + TimescaleDB extension | Efficient time-series event storage |
| Cache | Redis | Sub-millisecond city state reads |
| WebSocket | Socket.io | Mature, room-based broadcasting |
| Frontend Framework | React + Vite | Fast builds, component model |
| 3D Engine | Three.js + React Three Fiber | WebGL, declarative 3D in React |
| Animation | GSAP | High-performance timeline animations |
| State Management | Zustand | Lightweight, performant React state |
| Styling | Tailwind CSS | Rapid HUD/UI development |
| Container | Docker + Kubernetes | Production-grade orchestration |
| CI/CD | GitLab CI | Dogfooding — visualize the system building itself |
