# Repo City — Local Docker Runbook

Hands-on reference for starting the stack, tailing logs, and querying PostgreSQL directly.

---

## Prerequisites

| Tool | Minimum version |
|---|---|
| Docker Desktop | 4.x |
| `.env` file | present in repo root (copy from `.env.example` and fill in `GITLAB_TOKEN`) |

```
repo-city/
├── docker-compose.yml
├── .env          ← must exist (gitignored)
└── apps/repo-city-app/
```

---

## 1 — Start the stack

```bash
# From the repo root
cd /path/to/repo-city

# First-time or after code changes — rebuild the image
docker compose build --no-cache

# Start both containers (postgres + app) in the background
docker compose up -d
```

Expected output:
```
✔ Network repo-city_default           Created
✔ Volume repo-city_postgres_data      Created
✔ Container repo-city-postgres-1      Healthy
✔ Container repo-city-repo-city-app-1 Created
```

### Verify health

```bash
# Both containers should show "(healthy)"
docker compose ps

# Spring Boot health endpoint
curl http://localhost:8080/actuator/health
# → {"status":"UP","components":{"db":{"status":"UP",...},...}}
```

---

## 2 — Stop / restart

```bash
# Stop without deleting data
docker compose stop

# Start again (no rebuild needed)
docker compose start

# Full teardown — DELETES postgres volume (all data wiped)
docker compose down -v
```

---

## 3 — Tail logs

### App only (most useful)

```bash
docker compose logs -f repo-city-app
```

### Both containers

```bash
docker compose logs -f
```

### Key log lines to look for

| Pattern | Meaning |
|---|---|
| `CityState bootstrapped: 18 districts, 36 workers` | Startup OK — identity data loaded |
| `Polling 18 repos (since=null)` | First poll cycle started (full history) |
| `Dispatched N new COMMIT event(s) for <slug>` | GitLab API data saved to DB |
| `Publishing PollCycleCompleted with N new event(s)` | Poller finished, handing off to city-state |
| `City state updated: N mutation(s) produced` | In-memory city state mutated ✅ |
| `City snapshot persisted` | DB snapshot written (every 5 min) |
| `returned HTTP 404` | ⚠️ Placeholder project ID — see note below |

### Filter for data-flow trace only

```bash
docker compose logs repo-city-app 2>&1 \
  | grep -E "bootstrapped|Polling|PollCycle|City state updated|snapshot persisted|HTTP 4"
```

### ⚠️ Expected 404 warnings (non-fatal)

Two repos have placeholder `gitlab_project_id` values that don't exist on GitLab yet:

| Slug | Placeholder ID | Fix |
|---|---|---|
| `production-support` | `99000001` | Update to real GitLab project ID |
| `ms-partner-integration-platform` | `37347000` | Confirm the real project ID |

The poller skips these gracefully — all other 16 repos continue working.

---

## 4 — Hit the REST API

```bash
# All 18 repos, sorted by open MR count desc
curl http://localhost:8080/api/repos | python3 -m json.tool

# Pretty-print just slug + openMrCount + status
curl -s http://localhost:8080/api/repos | python3 -c "
import json,sys
for r in json.load(sys.stdin):
    print(r['openMrCount'], r['status'], r['slug'])
"
```

---

## 5 — Query PostgreSQL directly

### Connect to the DB

```bash
docker exec -it repo-city-postgres-1 psql -U repocity -d repocity
```

Or as a one-liner (add `-c "..."` at the end):

```bash
docker exec repo-city-postgres-1 psql -U repocity -d repocity -c "<SQL here>"
```

---

### 5.1 — Seed data checks

```sql
-- All 18 repos with name, icon, status
SELECT slug, name, icon, open_mrs, status
FROM gitlab_repositories
ORDER BY slug;

-- Repos by status
SELECT status, COUNT(*) FROM gitlab_repositories GROUP BY status;

-- All 36 developers
SELECT display_name, gitlab_username, gender, role
FROM gitlab_users
ORDER BY display_name;
```

---

### 5.2 — Poll events

```sql
-- Total events per type
SELECT event_type, COUNT(*)
FROM poll_events
GROUP BY event_type
ORDER BY event_type;

-- Events per repo (shows which repos have activity)
SELECT repo_slug, event_type, COUNT(*) AS cnt
FROM poll_events
GROUP BY repo_slug, event_type
ORDER BY repo_slug, event_type;

-- Latest 20 events (most recent first)
SELECT id, repo_slug, event_type, author_username, created_at
FROM poll_events
ORDER BY created_at DESC
LIMIT 20;

-- Events for a specific repo
SELECT event_type, author_username, created_at, web_url
FROM poll_events
WHERE repo_slug = 'ms-partner-transaction'
ORDER BY created_at DESC
LIMIT 20;

-- Repos with NO events yet (e.g. placeholder project IDs)
SELECT r.slug
FROM gitlab_repositories r
WHERE NOT EXISTS (
    SELECT 1 FROM poll_events p WHERE p.repo_slug = r.slug
)
ORDER BY r.slug;

-- Unique authors seen in commits
SELECT DISTINCT author_username
FROM poll_events
WHERE event_type = 'COMMIT'
ORDER BY author_username;
```

---

### 5.3 — Open MR counts (live from DB vs seed)

```sql
-- Live open MR count from poll_events
SELECT repo_slug, COUNT(*) AS open_mrs_live
FROM poll_events
WHERE event_type = 'MR_OPENED'
GROUP BY repo_slug
ORDER BY open_mrs_live DESC;

-- Compare seed value vs polled count
SELECT r.slug,
       r.open_mrs          AS seed_value,
       COALESCE(p.cnt, 0)  AS polled_open_mrs
FROM gitlab_repositories r
LEFT JOIN (
    SELECT repo_slug, COUNT(*) AS cnt
    FROM poll_events
    WHERE event_type = 'MR_OPENED'
    GROUP BY repo_slug
) p ON p.repo_slug = r.slug
ORDER BY polled_open_mrs DESC;
```

---

### 5.4 — City snapshots

```sql
-- How many snapshots have been persisted (written every 5 min)
SELECT COUNT(*) FROM city_snapshots;

-- Latest snapshot metadata
SELECT id, created_at, district_count, worker_count
FROM city_snapshots
ORDER BY created_at DESC
LIMIT 5;

-- Full JSON payload of the most recent snapshot (large — pipe to less)
SELECT payload
FROM city_snapshots
ORDER BY created_at DESC
LIMIT 1;
```

> **Note:** Snapshots are written every 5 minutes. If the app has been running
> less than 5 minutes, `COUNT(*)` will be 0 — this is normal.

---

### 5.5 — Useful psql meta-commands

```sql
\dt              -- list all tables
\d <table>       -- describe table schema
\x               -- toggle expanded output (useful for wide rows)
\q               -- quit
```

---

## 6 — Schema reference

### `gitlab_repositories`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | auto |
| `slug` | varchar(120) UNIQUE | stable FE key |
| `name` | varchar(120) | floating building label |
| `gitlab_project_id` | bigint UNIQUE | used in GitLab API URLs |
| `icon` | varchar(8) | emoji |
| `open_mrs` | integer | seed value (live count comes from poll_events) |
| `status` | varchar(20) | `ACTIVE` \| `INACTIVE` \| `MAINTENANCE` |

### `gitlab_users`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | auto |
| `display_name` | varchar(120) | shown in city UI |
| `gitlab_username` | varchar(120) UNIQUE | used to match commit/MR authors |
| `gender` | varchar(10) | `MALE` \| `FEMALE` |
| `role` | varchar(12) | `ENGINEER` \| `CARETAKER` \| `LEADER` |

### `poll_events`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | auto |
| `repo_slug` | varchar(120) | FK-style reference to `gitlab_repositories.slug` |
| `event_type` | varchar(16) | `COMMIT` \| `MR_OPENED` \| `MR_MERGED` \| `PIPELINE` |
| `gitlab_iid` | bigint | dedup key — unique per `(event_type, repo_slug, gitlab_iid)` |
| `author_username` | varchar(120) | GitLab username of the actor |
| `web_url` | varchar(512) | MR web URL (used to derive `gitlabMrListUrl` in `/api/repos`) |
| `payload` | text | raw JSON from GitLab |
| `created_at` | timestamptz | when the event was polled |

### `city_snapshots`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | auto |
| `created_at` | timestamptz | when snapshot was written |
| `district_count` | integer | number of districts at snapshot time |
| `worker_count` | integer | number of workers at snapshot time |
| `payload` | text | full `CityState` JSON (large) |

---

## 7 — Rebuild after code changes

```bash
# From repo root
docker compose down          # stop (keeps volume)
docker compose build         # rebuild image
docker compose up -d         # start fresh
docker compose logs -f repo-city-app   # watch startup
```

To also wipe the database:

```bash
docker compose down -v       # -v removes the postgres_data volume
docker compose build
docker compose up -d
```
