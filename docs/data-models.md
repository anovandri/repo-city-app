# GitLab City — Data Models & Webhook Event Reference

> **Version:** 1.0  
> **Date:** March 6, 2026

---

## 1. Core Domain Models (TypeScript)

### 1.1 GitLab City State

```typescript
// ─────────────────────────────────────────────────────────────────
// Top-level city state — the single source of truth
// ─────────────────────────────────────────────────────────────────

interface CityState {
  organizationId: string;       // GitLab group/namespace ID
  organizationName: string;
  lastUpdatedAt: string;        // ISO 8601 timestamp
  districts: District[];        // One per repository
  workers: Worker[];            // One per developer (active in last N days)
  cityAge: number;              // Days since first commit
  stats: CityStats;
}

interface CityStats {
  totalCommits: number;
  totalMergeRequests: number;
  totalPipelinesRun: number;
  activeDevelopers: number;
  totalBuildings: number;       // = number of distinct services/packages
}
```

---

### 1.2 District (Repository)

```typescript
// ─────────────────────────────────────────────────────────────────
// A district represents one GitLab repository
// ─────────────────────────────────────────────────────────────────

interface District {
  id: string;                   // GitLab project ID (string)
  name: string;                 // Project name
  path: string;                 // Namespace path (e.g., "org/backend-api")
  description?: string;
  language: string;             // Primary programming language
  visibility: 'public' | 'private' | 'internal';
  
  // City placement
  position: Vector2;            // Grid position in city (x, z)
  size: DistrictSize;           // Computed from repo complexity
  
  // Buildings within this district
  buildings: Building[];
  
  // Active workers currently in this district
  activeWorkerIds: string[];
  
  // Current pipeline status
  pipelineStatus: PipelineStatus;
  
  // Visual state
  visualState: DistrictVisualState;
  
  // Metadata
  createdAt: string;
  lastActivityAt: string;
  starCount: number;
  forkCount: number;
  openIssuesCount: number;
}

type DistrictSize = 'small' | 'medium' | 'large' | 'mega';
type PipelineStatus = 'idle' | 'running' | 'success' | 'failed' | 'canceled';

interface DistrictVisualState {
  glowColor: string;            // Hex: green success, red failed, amber running
  hasSmoke: boolean;            // Pipeline failure indicator
  hasFireworks: boolean;        // Release/tag event
  alertLevel: AlertLevel;       // From open issues
}

type AlertLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
```

---

### 1.3 Building (Service/Package within Repository)

```typescript
// ─────────────────────────────────────────────────────────────────
// A building represents a service or significant component
// Buildings grow taller with each commit
// ─────────────────────────────────────────────────────────────────

interface Building {
  id: string;                   // Unique within city
  districtId: string;           // Parent repository
  name: string;                 // Service/component name
  
  // Construction state
  floors: number;               // = total commits affecting this component
  maxFloors: number;            // Derived from lines of code (soft cap)
  underConstruction: boolean;   // Active commit / pipeline running
  
  // Visual properties
  position: Vector3;            // 3D position within district
  style: BuildingStyle;         // Visual style based on language/type
  
  // Growth history
  floorHistory: FloorHistoryEntry[];
  
  // Technical debt indicator
  techDebtScore: number;        // 0-100, affects building appearance
  
  // Active construction
  activeCranes: number;         // = concurrent pipeline jobs
}

type BuildingStyle = 
  | 'office'          // General purpose
  | 'factory'         // Backend / data processing
  | 'tower'           // API / microservice
  | 'warehouse'       // Storage / database
  | 'lab'             // ML / data science
  | 'residential';    // Frontend / UI

interface FloorHistoryEntry {
  floorNumber: number;
  addedAt: string;              // ISO 8601
  commitSha: string;
  authorId: string;
  linesAdded: number;
}

interface Vector2 { x: number; z: number; }
interface Vector3 { x: number; y: number; z: number; }
```

---

### 1.4 Worker (Developer)

```typescript
// ─────────────────────────────────────────────────────────────────
// A worker represents an active developer
// ─────────────────────────────────────────────────────────────────

interface Worker {
  id: string;                   // GitLab user ID
  username: string;             // @handle
  displayName: string;
  avatarUrl: string;
  
  // City position and movement
  position: Vector3;
  targetPosition: Vector3 | null;
  currentDistrictId: string | null;
  currentBuildingId: string | null;
  
  // Animation state
  animationState: WorkerAnimationState;
  
  // Stats
  totalCommits: number;
  totalMergeRequests: number;
  
  // Visual customization
  appearance: WorkerAppearance;
  
  // Activity tracking
  lastActiveAt: string;
  isActive: boolean;            // Active in last 24h
}

type WorkerAnimationState = 
  | 'idle'              // Standing, slight breathing animation
  | 'walking'           // Moving between positions
  | 'constructing'      // Hammering / building animation (commit)
  | 'blueprinting'      // Reviewing blueprints (MR open)
  | 'celebrating'       // Arms up (MR merged / pipeline success)
  | 'inspecting'        // Looking at warning sign (pipeline failed)
  | 'resting';          // Inactive developer

interface WorkerAppearance {
  hardHatColor: string;         // Hex color — unique per developer
  vestColor: string;
  skinTone: number;             // 1-5
  bodyType: 'a' | 'b' | 'c';   // 3 base avatar meshes
}
```

---

### 1.5 Normalized City Event

```typescript
// ─────────────────────────────────────────────────────────────────
// Every GitLab webhook gets normalized to this structure
// before entering the processing pipeline
// ─────────────────────────────────────────────────────────────────

interface CityEvent {
  id: string;                   // UUID generated on receive
  type: CityEventType;
  organizationId: string;
  projectId: string;
  projectPath: string;
  
  actor: EventActor;
  
  payload: 
    | CommitEventPayload
    | MergeRequestEventPayload
    | PipelineEventPayload
    | IssueEventPayload
    | NoteEventPayload
    | TagEventPayload;
  
  receivedAt: string;           // Server receive time (ISO 8601)
  gitlabTimestamp: string;      // Original GitLab event time
}

type CityEventType =
  | 'commit'
  | 'merge_request.opened'
  | 'merge_request.merged'
  | 'merge_request.closed'
  | 'pipeline.created'
  | 'pipeline.running'
  | 'pipeline.success'
  | 'pipeline.failed'
  | 'pipeline.canceled'
  | 'issue.opened'
  | 'issue.closed'
  | 'note.created'
  | 'tag.created';

interface EventActor {
  id: string;
  username: string;
  name: string;
  avatarUrl: string;
}

// ─────────────────────────────────────────────────────────────────
// Event-specific payloads
// ─────────────────────────────────────────────────────────────────

interface CommitEventPayload {
  commitCount: number;
  commits: CommitInfo[];
  branch: string;
  before: string;               // Previous commit SHA
  after: string;                // New commit SHA (HEAD)
}

interface CommitInfo {
  id: string;                   // SHA
  message: string;
  timestamp: string;
  authorName: string;
  authorEmail: string;
  addedFiles: string[];
  modifiedFiles: string[];
  removedFiles: string[];
  stats?: CommitStats;
}

interface CommitStats {
  additions: number;
  deletions: number;
  total: number;
}

interface MergeRequestEventPayload {
  mrId: number;
  iid: number;                  // Project-scoped IID
  title: string;
  state: 'opened' | 'closed' | 'locked' | 'merged';
  action: 'open' | 'close' | 'reopen' | 'update' | 'approved' | 'merge';
  sourceBranch: string;
  targetBranch: string;
  authorId: string;
  assigneeIds: string[];
  reviewerIds: string[];
  changesCount: number;
}

interface PipelineEventPayload {
  pipelineId: number;
  status: 'created' | 'waiting_for_resource' | 'preparing' | 'pending' |
          'running' | 'success' | 'failed' | 'canceled' | 'skipped';
  ref: string;                  // Branch or tag
  sha: string;
  stages: PipelineStage[];
  duration: number | null;      // Seconds
  source: string;               // 'push' | 'merge_request_event' | 'schedule' | 'api'
}

interface PipelineStage {
  name: string;
  status: string;
  jobs: PipelineJob[];
}

interface PipelineJob {
  id: number;
  name: string;
  status: string;
  stage: string;
  duration: number | null;
}

interface IssueEventPayload {
  issueId: number;
  iid: number;
  title: string;
  state: 'opened' | 'closed';
  action: 'open' | 'close' | 'reopen' | 'update';
  labels: string[];
  severity: IssueSeverity;
}

type IssueSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

interface NoteEventPayload {
  noteId: number;
  noteType: 'commit' | 'merge_request' | 'issue' | 'snippet';
  body: string;                 // Sanitized
  notableId: number;
}

interface TagEventPayload {
  tagName: string;
  message: string | null;
  isRelease: boolean;
  sha: string;
}
```

---

## 2. City Mutation Events (Server → Client)

```typescript
// ─────────────────────────────────────────────────────────────────
// These are the events broadcast via WebSocket to browsers
// ─────────────────────────────────────────────────────────────────

type CityMutation =
  | BuildingFloorAdded
  | BuildingUpgraded
  | WorkerSpawned
  | WorkerMoved
  | WorkerAnimationChanged
  | PipelineStatusChanged
  | IssueSignPlaced
  | IssueSignRemoved
  | FireworksTriggered
  | DistrictAdded
  | CraneActivated
  | CraneDeactivated;

interface BuildingFloorAdded {
  type: 'building.floor_added';
  buildingId: string;
  districtId: string;
  newFloorCount: number;
  workerIds: string[];          // Workers doing the construction
  commitSha: string;
  linesAdded: number;
}

interface BuildingUpgraded {
  type: 'building.upgraded';
  buildingId: string;
  districtId: string;
  upgradeType: 'merged_mr' | 'major_release';
  workerIds: string[];
}

interface WorkerSpawned {
  type: 'worker.spawned';
  worker: Worker;               // Full worker object for new workers
}

interface WorkerMoved {
  type: 'worker.moved';
  workerId: string;
  fromPosition: Vector3;
  toPosition: Vector3;
  targetDistrictId: string;
  targetBuildingId: string;
  duration: number;             // Milliseconds for the walk animation
}

interface WorkerAnimationChanged {
  type: 'worker.animation_changed';
  workerId: string;
  animation: WorkerAnimationState;
  duration?: number;            // How long to hold animation (ms)
}

interface PipelineStatusChanged {
  type: 'pipeline.status_changed';
  districtId: string;
  pipelineId: number;
  previousStatus: PipelineStatus;
  newStatus: PipelineStatus;
  activeCranes: number;         // How many cranes to show
}

interface IssueSignPlaced {
  type: 'issue.sign_placed';
  buildingId: string;
  districtId: string;
  issueIid: number;
  severity: IssueSeverity;
  position: Vector3;
}

interface IssueSignRemoved {
  type: 'issue.sign_removed';
  buildingId: string;
  districtId: string;
  issueIid: number;
}

interface FireworksTriggered {
  type: 'fireworks.triggered';
  districtId: string;
  position: Vector3;
  color: string;                // Hex
  duration: number;             // Ms
  tagName: string;
}

interface DistrictAdded {
  type: 'district.added';
  district: District;           // Full district object
}

interface CraneActivated {
  type: 'crane.activated';
  buildingId: string;
  craneId: string;
  pipelineJobName: string;
}

interface CraneDeactivated {
  type: 'crane.deactivated';
  buildingId: string;
  craneId: string;
  reason: 'success' | 'failed' | 'canceled';
}
```

---

## 3. GitLab Webhook Payload Examples

### 3.1 Push Event (Commit)

```json
{
  "object_kind": "push",
  "event_name": "push",
  "before": "95790bf891e76fee5df1d22f5a51b1d4f2a83991",
  "after": "da1560886d4f094c3e6c9ef40349f7d38b5d27d7",
  "ref": "refs/heads/main",
  "checkout_sha": "da1560886d4f094c3e6c9ef40349f7d38b5d27d7",
  "message": null,
  "user_id": 4,
  "user_name": "John Smith",
  "user_username": "jsmith",
  "user_email": "",
  "user_avatar": "https://s.gravatar.com/avatar/d4c74594d841139328695756648b6bd6",
  "project_id": 15,
  "project": {
    "id": 15,
    "name": "gitlab-city-backend",
    "description": "Backend API service",
    "web_url": "http://gitlab.example.com/mike/diaspora",
    "avatar_url": null,
    "git_http_url": "http://gitlab.example.com/mike/diaspora.git",
    "namespace": "Mike",
    "visibility_level": 0,
    "path_with_namespace": "org/gitlab-city-backend",
    "default_branch": "main",
    "ci_config_path": ".gitlab-ci.yml",
    "homepage": "http://gitlab.example.com/mike/diaspora",
    "url": "git@gitlab.example.com:mike/diaspora.git",
    "ssh_url": "git@gitlab.example.com:mike/diaspora.git",
    "http_url": "http://gitlab.example.com/mike/diaspora.git"
  },
  "commits": [
    {
      "id": "b6568db1bc1dcd7f8b4d5a946b0b91f9dacd7327",
      "message": "feat: add user authentication middleware\n\nImplemented JWT-based authentication for all protected endpoints.",
      "title": "feat: add user authentication middleware",
      "timestamp": "2026-03-06T08:14:22+00:00",
      "url": "http://gitlab.example.com/mike/diaspora/commit/b6568db1",
      "author": {
        "name": "John Smith",
        "email": "jsmith@example.com"
      },
      "added": ["src/middleware/auth.ts", "src/middleware/__tests__/auth.test.ts"],
      "modified": ["src/app.ts", "src/routes/index.ts"],
      "removed": []
    }
  ],
  "total_commits_count": 1,
  "push_options": {},
  "repository": {
    "name": "gitlab-city-backend",
    "url": "git@gitlab.example.com:org/gitlab-city-backend.git",
    "description": "Backend API service",
    "homepage": "http://gitlab.example.com/org/gitlab-city-backend",
    "git_http_url": "http://gitlab.example.com/org/gitlab-city-backend.git",
    "git_ssh_url": "git@gitlab.example.com:org/gitlab-city-backend.git",
    "visibility_level": 0
  }
}
```

**→ City Mutation Generated:**
```json
{
  "type": "building.floor_added",
  "buildingId": "building-15-main",
  "districtId": "district-15",
  "newFloorCount": 47,
  "workerIds": ["worker-4"],
  "commitSha": "b6568db1bc1dcd7f8b4d5a946b0b91f9dacd7327",
  "linesAdded": 234
}
```

---

### 3.2 Merge Request Event

```json
{
  "object_kind": "merge_request",
  "event_type": "merge_request",
  "user": {
    "id": 1,
    "name": "Administrator",
    "username": "root",
    "avatar_url": "http://www.gravatar.com/avatar/e64c7d89f26bd1972efa854d13d7dd61",
    "email": "admin@example.com"
  },
  "project": {
    "id": 15,
    "name": "gitlab-city-backend",
    "path_with_namespace": "org/gitlab-city-backend"
  },
  "object_attributes": {
    "id": 99,
    "iid": 7,
    "title": "feat: implement real-time notification system",
    "state": "merged",
    "action": "merge",
    "source_branch": "feature/realtime-notifications",
    "target_branch": "main",
    "author_id": 1,
    "assignee_id": 2,
    "reviewer_ids": [3, 5],
    "description": "Adds WebSocket-based real-time notifications to the API.",
    "created_at": "2026-03-06T07:00:00.000Z",
    "updated_at": "2026-03-06T09:30:00.000Z",
    "merged_at": "2026-03-06T09:30:00.000Z",
    "url": "http://gitlab.example.com/org/gitlab-city-backend/merge_requests/7",
    "source": {
      "name": "gitlab-city-backend",
      "path_with_namespace": "org/gitlab-city-backend"
    },
    "target": {
      "name": "gitlab-city-backend",
      "path_with_namespace": "org/gitlab-city-backend"
    },
    "changes": {
      "count": "12"
    }
  },
  "labels": [
    { "id": 206, "title": "feature", "color": "#FF8C00" }
  ],
  "changes": {}
}
```

**→ City Mutations Generated:**
```json
[
  { "type": "worker.animation_changed", "workerId": "worker-1", "animation": "celebrating", "duration": 3000 },
  { "type": "worker.animation_changed", "workerId": "worker-2", "animation": "celebrating", "duration": 3000 },
  { "type": "building.upgraded", "buildingId": "building-15-main", "districtId": "district-15", "upgradeType": "merged_mr", "workerIds": ["worker-1", "worker-2"] }
]
```

---

### 3.3 Pipeline Event

```json
{
  "object_kind": "pipeline",
  "object_attributes": {
    "id": 1366,
    "iid": 22,
    "ref": "main",
    "tag": false,
    "sha": "da1560886d4f094c3e6c9ef40349f7d38b5d27d7",
    "before_sha": "0000000000000000000000000000000000000000",
    "source": "push",
    "status": "running",
    "stages": ["build", "test", "deploy"],
    "created_at": "2026-03-06T09:30:10.000Z",
    "finished_at": null,
    "duration": null,
    "queued_duration": 12,
    "variables": []
  },
  "merge_request": null,
  "user": {
    "id": 4,
    "name": "John Smith",
    "username": "jsmith",
    "avatar_url": "https://s.gravatar.com/avatar/d4c74594d841139328695756648b6bd6"
  },
  "project": {
    "id": 15,
    "name": "gitlab-city-backend",
    "path_with_namespace": "org/gitlab-city-backend"
  },
  "builds": [
    {
      "id": 380,
      "stage": "build",
      "name": "docker:build",
      "status": "running",
      "created_at": "2026-03-06 09:30:10 UTC",
      "started_at": "2026-03-06 09:30:15 UTC",
      "finished_at": null,
      "duration": null,
      "queued_duration": 5,
      "failure_reason": null,
      "when": "on_success",
      "manual": false,
      "user": { "id": 4, "name": "John Smith", "username": "jsmith" }
    },
    {
      "id": 381,
      "stage": "test",
      "name": "jest:unit",
      "status": "pending",
      "created_at": "2026-03-06 09:30:10 UTC"
    }
  ]
}
```

**→ City Mutations Generated (status: running):**
```json
[
  { "type": "pipeline.status_changed", "districtId": "district-15", "pipelineId": 1366, "previousStatus": "idle", "newStatus": "running", "activeCranes": 2 },
  { "type": "crane.activated", "buildingId": "building-15-main", "craneId": "crane-380", "pipelineJobName": "docker:build" },
  { "type": "crane.activated", "buildingId": "building-15-main", "craneId": "crane-381", "pipelineJobName": "jest:unit" }
]
```

**→ City Mutations Generated (status: success):**
```json
[
  { "type": "pipeline.status_changed", "districtId": "district-15", "pipelineId": 1366, "previousStatus": "running", "newStatus": "success", "activeCranes": 0 },
  { "type": "crane.deactivated", "buildingId": "building-15-main", "craneId": "crane-380", "reason": "success" },
  { "type": "crane.deactivated", "buildingId": "building-15-main", "craneId": "crane-381", "reason": "success" }
]
```

---

### 3.4 Issue Event

```json
{
  "object_kind": "issue",
  "event_type": "issue",
  "user": {
    "id": 2,
    "name": "Jane Doe",
    "username": "jdoe",
    "avatar_url": "https://secure.gravatar.com/avatar/abc123"
  },
  "project": {
    "id": 15,
    "name": "gitlab-city-backend",
    "path_with_namespace": "org/gitlab-city-backend"
  },
  "object_attributes": {
    "id": 301,
    "iid": 41,
    "title": "Memory leak in WebSocket connection handler",
    "state": "opened",
    "action": "open",
    "description": "After ~500 connections, memory usage climbs past 2GB and OOM kills the process.",
    "severity": "high",
    "created_at": "2026-03-06T10:00:00.000Z",
    "updated_at": "2026-03-06T10:00:00.000Z",
    "url": "http://gitlab.example.com/org/gitlab-city-backend/issues/41",
    "labels": [
      { "id": 15, "title": "bug", "color": "#FF0000" },
      { "id": 22, "title": "performance", "color": "#FFA500" }
    ]
  },
  "labels": [
    { "id": 15, "title": "bug", "color": "#FF0000" }
  ]
}
```

**→ City Mutation Generated:**
```json
{
  "type": "issue.sign_placed",
  "buildingId": "building-15-main",
  "districtId": "district-15",
  "issueIid": 41,
  "severity": "high",
  "position": { "x": 12.5, "y": 4.0, "z": 8.0 }
}
```

---

### 3.5 Tag / Release Event (Fireworks!)

```json
{
  "object_kind": "tag_push",
  "event_name": "tag_push",
  "before": "0000000000000000000000000000000000000000",
  "after": "82b3d5ae55f7080f1e6022629cdb57bfae7cccc7",
  "ref": "refs/tags/v2.0.0",
  "checkout_sha": "82b3d5ae55f7080f1e6022629cdb57bfae7cccc7",
  "message": "Release v2.0.0 — Real-time notifications, performance overhaul",
  "user_id": 1,
  "user_name": "Administrator",
  "user_username": "root",
  "project_id": 15,
  "project": {
    "id": 15,
    "name": "gitlab-city-backend",
    "path_with_namespace": "org/gitlab-city-backend"
  },
  "commits": [],
  "total_commits_count": 0,
  "push_options": {},
  "repository": {
    "name": "gitlab-city-backend",
    "url": "git@gitlab.example.com:org/gitlab-city-backend.git"
  }
}
```

**→ City Mutation Generated:**
```json
{
  "type": "fireworks.triggered",
  "districtId": "district-15",
  "position": { "x": 10.0, "y": 20.0, "z": 10.0 },
  "color": "#FFD700",
  "duration": 8000,
  "tagName": "v2.0.0"
}
```

---

## 4. Database Schema

```sql
-- ─────────────────────────────────────────────────────────────────
-- PostgreSQL + TimescaleDB Schema
-- ─────────────────────────────────────────────────────────────────

-- Organizations / GitLab Groups
CREATE TABLE organizations (
  id              VARCHAR(64) PRIMARY KEY,
  gitlab_group_id BIGINT UNIQUE NOT NULL,
  name            VARCHAR(255) NOT NULL,
  path            VARCHAR(512) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  config          JSONB NOT NULL DEFAULT '{}'
);

-- Districts (Repositories)
CREATE TABLE districts (
  id              VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id),
  gitlab_project_id BIGINT UNIQUE NOT NULL,
  name            VARCHAR(255) NOT NULL,
  path            VARCHAR(512) NOT NULL,
  language        VARCHAR(64),
  grid_x          INTEGER NOT NULL DEFAULT 0,
  grid_z          INTEGER NOT NULL DEFAULT 0,
  size            VARCHAR(16) NOT NULL DEFAULT 'small',
  created_at      TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}'
);

-- Buildings
CREATE TABLE buildings (
  id              VARCHAR(64) PRIMARY KEY,
  district_id     VARCHAR(64) NOT NULL REFERENCES districts(id),
  name            VARCHAR(255) NOT NULL,
  style           VARCHAR(32) NOT NULL DEFAULT 'office',
  floor_count     INTEGER NOT NULL DEFAULT 1,
  position_x      FLOAT NOT NULL DEFAULT 0,
  position_y      FLOAT NOT NULL DEFAULT 0,
  position_z      FLOAT NOT NULL DEFAULT 0,
  tech_debt_score FLOAT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workers (Developers)
CREATE TABLE workers (
  id              VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id),
  gitlab_user_id  BIGINT UNIQUE NOT NULL,
  username        VARCHAR(255) NOT NULL,
  display_name    VARCHAR(255) NOT NULL,
  avatar_url      TEXT,
  hard_hat_color  VARCHAR(7) NOT NULL DEFAULT '#FF6600',
  vest_color      VARCHAR(7) NOT NULL DEFAULT '#FFFF00',
  total_commits   INTEGER NOT NULL DEFAULT 0,
  total_mrs       INTEGER NOT NULL DEFAULT 0,
  last_active_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Raw event log (append-only, TimescaleDB hypertable)
CREATE TABLE city_events (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type            VARCHAR(64) NOT NULL,
  organization_id VARCHAR(64) NOT NULL,
  project_id      VARCHAR(64) NOT NULL,
  actor_id        VARCHAR(64),
  payload         JSONB NOT NULL
);

-- Convert to hypertable for time-series efficiency
SELECT create_hypertable('city_events', 'received_at');

-- City state snapshots (for time-travel replay)
CREATE TABLE city_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id),
  snapshot_at     TIMESTAMPTZ NOT NULL,
  state           JSONB NOT NULL,
  event_count     BIGINT NOT NULL
);

CREATE INDEX idx_city_snapshots_org_time 
  ON city_snapshots(organization_id, snapshot_at DESC);

-- Floor history
CREATE TABLE building_floors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id     VARCHAR(64) NOT NULL REFERENCES buildings(id),
  floor_number    INTEGER NOT NULL,
  added_at        TIMESTAMPTZ NOT NULL,
  commit_sha      VARCHAR(40) NOT NULL,
  author_id       VARCHAR(64) REFERENCES workers(id),
  lines_added     INTEGER NOT NULL DEFAULT 0,
  lines_removed   INTEGER NOT NULL DEFAULT 0
);

SELECT create_hypertable('building_floors', 'added_at');
```
