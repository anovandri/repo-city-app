# GitLab City — Backend Event Processing Design

> **Version:** 1.0  
> **Date:** March 6, 2026

---

## 1. Backend Service Overview

The backend consists of three focused Node.js services, all sharing a common TypeScript package for types and utilities:

```
packages/
  shared/           ← Shared types, utilities, validation schemas
  
services/
  webhook-receiver/ ← HTTP server — receives GitLab webhooks
  event-processor/  ← Consumes queue — transforms events → city mutations
  websocket-server/ ← Broadcasts city mutations to frontend clients
```

All services communicate via **Redis Streams** (message queue) and share state via **Redis** (cache) and **PostgreSQL** (persistence).

---

## 2. Webhook Receiver Service

### 2.1 Express Application Setup

```typescript
// services/webhook-receiver/src/app.ts

import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { webhookRouter } from './routes/webhook.router';
import { healthRouter } from './routes/health.router';
import { logger } from './utils/logger';

export function createApp(): Application {
  const app = express();

  // Security headers
  app.use(helmet());

  // Rate limiting: 500 webhook calls per minute per IP
  app.use('/webhook', rateLimit({
    windowMs: 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
  }));

  // Raw body needed for HMAC validation (GitLab uses X-Gitlab-Token, not HMAC,
  // but we keep raw body in case we add HMAC later)
  app.use(express.json({ limit: '5mb' }));

  // Routes
  app.use('/webhook', webhookRouter);
  app.use('/health', healthRouter);

  // Global error handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err, path: req.path }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
```

---

### 2.2 Webhook Route Handler

```typescript
// services/webhook-receiver/src/routes/webhook.router.ts

import { Router, Request, Response } from 'express';
import { WebhookNormalizer } from '../normalizers/WebhookNormalizer';
import { EventPublisher } from '../queue/EventPublisher';
import { validateWebhookToken } from '../middleware/validateWebhookToken';
import { logger } from '../utils/logger';

const router = Router();
const normalizer = new WebhookNormalizer();
const publisher = new EventPublisher();

// POST /webhook/:orgId
router.post(
  '/:orgId',
  validateWebhookToken,
  async (req: Request, res: Response) => {
    const { orgId } = req.params;
    const eventType = req.headers['x-gitlab-event'] as string;
    const rawPayload = req.body;

    // Respond immediately — GitLab requires < 10s response
    res.status(202).json({ status: 'accepted' });

    try {
      // Normalize the raw GitLab payload into our CityEvent format
      const cityEvent = await normalizer.normalize({
        orgId,
        eventType,
        rawPayload,
      });

      if (!cityEvent) {
        // Event type we don't care about (e.g., wiki page events)
        logger.debug({ eventType }, 'Ignored event type');
        return;
      }

      // Publish to the appropriate Redis stream
      await publisher.publish(cityEvent);

      logger.info({
        eventId: cityEvent.id,
        type: cityEvent.type,
        project: cityEvent.projectPath,
      }, 'Event published');

    } catch (err) {
      logger.error({ err, orgId, eventType }, 'Failed to process webhook');
    }
  }
);

export { router as webhookRouter };
```

---

### 2.3 Token Validation Middleware

```typescript
// services/webhook-receiver/src/middleware/validateWebhookToken.ts

import { Request, Response, NextFunction } from 'express';
import { getOrgConfig } from '../config/orgConfig';

export async function validateWebhookToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { orgId } = req.params;
  const providedToken = req.headers['x-gitlab-token'] as string;

  if (!providedToken) {
    res.status(401).json({ error: 'Missing X-Gitlab-Token header' });
    return;
  }

  const orgConfig = await getOrgConfig(orgId);
  if (!orgConfig || orgConfig.webhookSecret !== providedToken) {
    res.status(403).json({ error: 'Invalid webhook token' });
    return;
  }

  next();
}
```

---

### 2.4 Webhook Normalizer

```typescript
// services/webhook-receiver/src/normalizers/WebhookNormalizer.ts

import { v4 as uuidv4 } from 'uuid';
import { CityEvent, CityEventType } from '@gitlab-city/shared/types';
import { PushNormalizer } from './PushNormalizer';
import { MergeRequestNormalizer } from './MergeRequestNormalizer';
import { PipelineNormalizer } from './PipelineNormalizer';
import { IssueNormalizer } from './IssueNormalizer';
import { TagNormalizer } from './TagNormalizer';

interface NormalizeInput {
  orgId: string;
  eventType: string;         // X-Gitlab-Event header value
  rawPayload: Record<string, unknown>;
}

export class WebhookNormalizer {
  // Map GitLab event header → normalizer
  private normalizers = new Map([
    ['Push Hook',           new PushNormalizer()],
    ['Merge Request Hook',  new MergeRequestNormalizer()],
    ['Pipeline Hook',       new PipelineNormalizer()],
    ['Issue Hook',          new IssueNormalizer()],
    ['Tag Push Hook',       new TagNormalizer()],
  ]);

  async normalize(input: NormalizeInput): Promise<CityEvent | null> {
    const norm = this.normalizers.get(input.eventType);
    if (!norm) return null;

    const partial = await norm.normalize(input.rawPayload);
    if (!partial) return null;

    return {
      id: uuidv4(),
      receivedAt: new Date().toISOString(),
      organizationId: input.orgId,
      ...partial,
    } as CityEvent;
  }
}
```

---

### 2.5 Push Event Normalizer

```typescript
// services/webhook-receiver/src/normalizers/PushNormalizer.ts

import { CommitEventPayload, EventActor } from '@gitlab-city/shared/types';

export class PushNormalizer {
  normalize(raw: any): Partial<import('@gitlab-city/shared/types').CityEvent> | null {
    if (!raw.commits || raw.commits.length === 0) {
      return null; // Empty push (e.g., branch deletion)
    }

    const actor: EventActor = {
      id: String(raw.user_id),
      username: raw.user_username,
      name: raw.user_name,
      avatarUrl: raw.user_avatar,
    };

    const payload: CommitEventPayload = {
      commitCount: raw.total_commits_count,
      branch: raw.ref.replace('refs/heads/', ''),
      before: raw.before,
      after: raw.after,
      commits: raw.commits.map((c: any) => ({
        id: c.id,
        message: this.sanitize(c.message),
        timestamp: c.timestamp,
        authorName: c.author.name,
        authorEmail: c.author.email,
        addedFiles: c.added || [],
        modifiedFiles: c.modified || [],
        removedFiles: c.removed || [],
      })),
    };

    return {
      type: 'commit',
      projectId: String(raw.project_id),
      projectPath: raw.project?.path_with_namespace ?? '',
      gitlabTimestamp: raw.commits[0]?.timestamp ?? new Date().toISOString(),
      actor,
      payload,
    };
  }

  private sanitize(message: string): string {
    // Strip any HTML/script tags from commit messages
    return message.replace(/<[^>]*>/g, '').trim().slice(0, 1000);
  }
}
```

---

### 2.6 Redis Event Publisher

```typescript
// services/webhook-receiver/src/queue/EventPublisher.ts

import { createClient, RedisClientType } from 'redis';
import { CityEvent } from '@gitlab-city/shared/types';
import { logger } from '../utils/logger';

const STREAM_MAP: Record<string, string> = {
  'commit':                   'city.events.commit',
  'merge_request.opened':     'city.events.merge_request',
  'merge_request.merged':     'city.events.merge_request',
  'merge_request.closed':     'city.events.merge_request',
  'pipeline.created':         'city.events.pipeline',
  'pipeline.running':         'city.events.pipeline',
  'pipeline.success':         'city.events.pipeline',
  'pipeline.failed':          'city.events.pipeline',
  'pipeline.canceled':        'city.events.pipeline',
  'issue.opened':             'city.events.issue',
  'issue.closed':             'city.events.issue',
  'tag.created':              'city.events.tag',
};

export class EventPublisher {
  private client: RedisClientType;

  constructor() {
    this.client = createClient({ url: process.env.REDIS_URL });
    this.client.connect().catch(err => logger.error(err, 'Redis connect failed'));
  }

  async publish(event: CityEvent): Promise<void> {
    const stream = STREAM_MAP[event.type];
    if (!stream) {
      logger.warn({ type: event.type }, 'No stream mapped for event type');
      return;
    }

    // Redis XADD — adds message to stream
    await this.client.xAdd(stream, '*', {
      eventId:   event.id,
      type:      event.type,
      orgId:     event.organizationId,
      projectId: event.projectId,
      payload:   JSON.stringify(event),
    });
  }
}
```

---

## 3. Event Processor Service

The Event Processor is the brain of the backend. It reads from Redis Streams, applies the event → city mutation transformations, persists state, and broadcasts mutations.

### 3.1 Event Processor Main Loop

```typescript
// services/event-processor/src/processor/EventProcessor.ts

import { RedisStreamConsumer } from '../queue/RedisStreamConsumer';
import { CityStateManager } from '../state/CityStateManager';
import { MutationBroadcaster } from '../broadcast/MutationBroadcaster';
import { CityEvent, CityMutation } from '@gitlab-city/shared/types';
import { logger } from '../utils/logger';

const STREAMS = [
  'city.events.commit',
  'city.events.merge_request',
  'city.events.pipeline',
  'city.events.issue',
  'city.events.tag',
];

export class EventProcessor {
  private consumer: RedisStreamConsumer;
  private stateManager: CityStateManager;
  private broadcaster: MutationBroadcaster;

  constructor() {
    this.consumer = new RedisStreamConsumer({
      streams: STREAMS,
      groupName: 'city-processor',
      consumerName: `processor-${process.env.POD_NAME || 'local'}`,
    });
    this.stateManager = new CityStateManager();
    this.broadcaster = new MutationBroadcaster();
  }

  async start(): Promise<void> {
    logger.info('Event processor starting...');
    
    await this.stateManager.initialize();
    
    // Process events continuously
    while (true) {
      try {
        const messages = await this.consumer.readBatch({ count: 50, blockMs: 2000 });
        
        for (const message of messages) {
          await this.processMessage(message);
          await this.consumer.acknowledge(message.stream, message.id);
        }
      } catch (err) {
        logger.error(err, 'Error in processor loop');
        await sleep(1000);
      }
    }
  }

  private async processMessage(message: StreamMessage): Promise<void> {
    const event: CityEvent = JSON.parse(message.fields.payload);
    
    logger.debug({ eventId: event.id, type: event.type }, 'Processing event');

    // Apply event to city state → get list of mutations
    const mutations = await this.stateManager.applyEvent(event);

    if (mutations.length === 0) return;

    // Persist mutations to DB
    await this.stateManager.persistMutations(mutations);

    // Broadcast to WebSocket server
    await this.broadcaster.broadcast(event.organizationId, mutations);
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
```

---

### 3.2 City State Manager

```typescript
// services/event-processor/src/state/CityStateManager.ts

import { 
  CityEvent, CityMutation, CityState, District, Building, Worker 
} from '@gitlab-city/shared/types';
import { CommitHandler } from './handlers/CommitHandler';
import { MergeRequestHandler } from './handlers/MergeRequestHandler';
import { PipelineHandler } from './handlers/PipelineHandler';
import { IssueHandler } from './handlers/IssueHandler';
import { TagHandler } from './handlers/TagHandler';
import { StateRepository } from '../db/StateRepository';
import { RedisStateCache } from '../cache/RedisStateCache';

export class CityStateManager {
  private handlers: Map<string, EventHandler>;
  private repo: StateRepository;
  private cache: RedisStateCache;

  constructor() {
    this.repo = new StateRepository();
    this.cache = new RedisStateCache();

    this.handlers = new Map([
      ['commit',                  new CommitHandler(this)],
      ['merge_request.opened',    new MergeRequestHandler(this)],
      ['merge_request.merged',    new MergeRequestHandler(this)],
      ['merge_request.closed',    new MergeRequestHandler(this)],
      ['pipeline.created',        new PipelineHandler(this)],
      ['pipeline.running',        new PipelineHandler(this)],
      ['pipeline.success',        new PipelineHandler(this)],
      ['pipeline.failed',         new PipelineHandler(this)],
      ['pipeline.canceled',       new PipelineHandler(this)],
      ['issue.opened',            new IssueHandler(this)],
      ['issue.closed',            new IssueHandler(this)],
      ['tag.created',             new TagHandler(this)],
    ]);
  }

  async initialize(): Promise<void> {
    // Load all organization states into Redis cache
    const orgs = await this.repo.getAllOrganizations();
    for (const org of orgs) {
      const state = await this.repo.loadCityState(org.id);
      if (state) await this.cache.setState(org.id, state);
    }
  }

  async applyEvent(event: CityEvent): Promise<CityMutation[]> {
    const handler = this.handlers.get(event.type);
    if (!handler) return [];

    // Load current state from cache (fast)
    let state = await this.cache.getState(event.organizationId);
    if (!state) {
      // Cold start: fetch from DB and cache it
      state = await this.repo.loadOrCreateCityState(event.organizationId);
      await this.cache.setState(event.organizationId, state);
    }

    // Apply the event — returns mutations and updated state
    const { mutations, newState } = await handler.handle(event, state);

    // Update cache immediately
    await this.cache.setState(event.organizationId, newState);

    return mutations;
  }

  async persistMutations(mutations: CityMutation[]): Promise<void> {
    await this.repo.saveMutations(mutations);
  }

  // Accessors for handlers
  async getOrCreateDistrict(orgId: string, projectId: string, projectPath: string): Promise<District> {
    const state = await this.cache.getState(orgId);
    let district = state?.districts.find(d => d.id === `district-${projectId}`);
    if (!district) {
      district = await this.repo.createDistrict(orgId, projectId, projectPath);
      // Add to state
    }
    return district;
  }

  async getOrCreateWorker(orgId: string, actorId: string, username: string): Promise<Worker> {
    const state = await this.cache.getState(orgId);
    let worker = state?.workers.find(w => w.id === `worker-${actorId}`);
    if (!worker) {
      worker = this.createWorkerFromActor(actorId, username);
      await this.repo.saveWorker(orgId, worker);
    }
    return worker;
  }

  private createWorkerFromActor(actorId: string, username: string): Worker {
    // Generate deterministic visual properties from user ID
    const hue = (parseInt(actorId, 10) * 137) % 360;
    return {
      id: `worker-${actorId}`,
      username,
      displayName: username,
      avatarUrl: '',
      position: { x: 0, y: 0, z: 0 },
      targetPosition: null,
      currentDistrictId: null,
      currentBuildingId: null,
      animationState: 'idle',
      totalCommits: 0,
      totalMergeRequests: 0,
      lastActiveAt: new Date().toISOString(),
      isActive: true,
      appearance: {
        hardHatColor: `hsl(${hue}, 70%, 50%)`,
        vestColor: '#FFDD00',
        skinTone: (parseInt(actorId, 10) % 5) + 1,
        bodyType: (['a', 'b', 'c'] as const)[(parseInt(actorId, 10) % 3)],
      },
    };
  }
}

interface EventHandler {
  handle(event: CityEvent, state: CityState): Promise<{ mutations: CityMutation[]; newState: CityState }>;
}
```

---

### 3.3 Commit Event Handler

```typescript
// services/event-processor/src/state/handlers/CommitHandler.ts

import { CityEvent, CityState, CityMutation, CommitEventPayload } from '@gitlab-city/shared/types';
import { CityStateManager } from '../CityStateManager';
import { calculateBuildingTarget } from '../../utils/buildingUtils';

export class CommitHandler {
  constructor(private manager: CityStateManager) {}

  async handle(
    event: CityEvent,
    state: CityState
  ): Promise<{ mutations: CityMutation[]; newState: CityState }> {
    const payload = event.payload as CommitEventPayload;
    const mutations: CityMutation[] = [];
    const newState = deepClone(state);

    // 1. Ensure the district (repo) exists
    const district = await this.manager.getOrCreateDistrict(
      event.organizationId,
      event.projectId,
      event.projectPath
    );

    // 2. Ensure the worker (developer) exists
    const worker = await this.manager.getOrCreateWorker(
      event.organizationId,
      event.actor.id,
      event.actor.username
    );

    // 3. Calculate total lines changed across all commits
    const totalLinesAdded = payload.commits.reduce((sum, c) => 
      sum + (c.stats?.additions ?? 0), 0
    );

    // 4. Find or create the primary building for this branch
    const buildingId = `building-${event.projectId}-${payload.branch}`;
    let building = newState.districts
      .find(d => d.id === district.id)
      ?.buildings.find(b => b.id === buildingId);

    if (!building) {
      building = createBuilding(buildingId, district.id, payload.branch);
      newState.districts.find(d => d.id === district.id)!.buildings.push(building);
    }

    // 5. Calculate floor increase
    //    1 floor per commit + 1 bonus floor per 500 lines added
    const floorsToAdd = payload.commitCount + Math.floor(totalLinesAdded / 500);
    building.floors += floorsToAdd;
    building.underConstruction = true;

    // 6. Generate WorkerMoved mutation — walk worker to building
    const targetPos = calculateBuildingTarget(building.position, district.position);
    mutations.push({
      type: 'worker.moved',
      workerId: worker.id,
      fromPosition: worker.position,
      toPosition: targetPos,
      targetDistrictId: district.id,
      targetBuildingId: buildingId,
      duration: 2000 + Math.random() * 1000,
    });

    // 7. Generate WorkerAnimationChanged — construction animation
    mutations.push({
      type: 'worker.animation_changed',
      workerId: worker.id,
      animation: 'constructing',
      duration: 3000,
    });

    // 8. Generate BuildingFloorAdded mutation
    mutations.push({
      type: 'building.floor_added',
      buildingId,
      districtId: district.id,
      newFloorCount: building.floors,
      workerIds: [worker.id],
      commitSha: payload.after,
      linesAdded: totalLinesAdded,
    });

    // 9. Update worker position in state
    const workerInState = newState.workers.find(w => w.id === worker.id);
    if (workerInState) {
      workerInState.position = targetPos;
      workerInState.currentDistrictId = district.id;
      workerInState.currentBuildingId = buildingId;
      workerInState.totalCommits += payload.commitCount;
      workerInState.animationState = 'constructing';
      workerInState.lastActiveAt = event.gitlabTimestamp;
    } else {
      worker.position = targetPos;
      worker.currentDistrictId = district.id;
      worker.currentBuildingId = buildingId;
      worker.animationState = 'constructing';
      newState.workers.push(worker);
      mutations.push({ type: 'worker.spawned', worker });
    }

    return { mutations, newState };
  }
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function createBuilding(id: string, districtId: string, branch: string): Building {
  return {
    id,
    districtId,
    name: branch,
    floors: 1,
    maxFloors: 200,
    underConstruction: false,
    position: { x: Math.random() * 8, y: 0, z: Math.random() * 8 },
    style: 'office',
    floorHistory: [],
    techDebtScore: 0,
    activeCranes: 0,
  };
}
```

---

### 3.4 Pipeline Event Handler

```typescript
// services/event-processor/src/state/handlers/PipelineHandler.ts

import { CityEvent, CityState, CityMutation, PipelineEventPayload } from '@gitlab-city/shared/types';

export class PipelineHandler {
  async handle(
    event: CityEvent,
    state: CityState
  ): Promise<{ mutations: CityMutation[]; newState: CityState }> {
    const payload = event.payload as PipelineEventPayload;
    const mutations: CityMutation[] = [];
    const newState = deepClone(state);

    const districtId = `district-${event.projectId}`;
    const district = newState.districts.find(d => d.id === districtId);
    if (!district) return { mutations, newState };

    const previousStatus = district.pipelineStatus;

    switch (event.type) {
      case 'pipeline.running': {
        district.pipelineStatus = 'running';
        district.visualState.glowColor = '#FFA500'; // Amber

        // Activate a crane per running job
        const runningJobs = payload.stages
          .flatMap(s => s.jobs)
          .filter(j => j.status === 'running' || j.status === 'pending');

        const activeCranes = runningJobs.length;
        district.buildings.forEach(b => { b.activeCranes = 0; });
        
        // Distribute cranes to buildings (simplified: all on main building)
        const mainBuilding = district.buildings[0];
        if (mainBuilding) {
          mainBuilding.activeCranes = activeCranes;
          mainBuilding.underConstruction = true;
        }

        mutations.push({
          type: 'pipeline.status_changed',
          districtId,
          pipelineId: payload.pipelineId,
          previousStatus,
          newStatus: 'running',
          activeCranes,
        });

        runningJobs.forEach(job => {
          mutations.push({
            type: 'crane.activated',
            buildingId: mainBuilding?.id ?? '',
            craneId: `crane-${job.id}`,
            pipelineJobName: job.name,
          });
        });
        break;
      }

      case 'pipeline.success': {
        district.pipelineStatus = 'success';
        district.visualState.glowColor = '#00FF88'; // Green
        district.visualState.hasSmoke = false;
        
        district.buildings.forEach(b => {
          b.activeCranes = 0;
          b.underConstruction = false;
        });

        mutations.push({
          type: 'pipeline.status_changed',
          districtId,
          pipelineId: payload.pipelineId,
          previousStatus,
          newStatus: 'success',
          activeCranes: 0,
        });

        // Deactivate all cranes
        payload.stages.flatMap(s => s.jobs).forEach(job => {
          mutations.push({
            type: 'crane.deactivated',
            buildingId: district.buildings[0]?.id ?? '',
            craneId: `crane-${job.id}`,
            reason: 'success',
          });
        });

        // Workers celebrate
        district.activeWorkerIds.forEach(workerId => {
          mutations.push({
            type: 'worker.animation_changed',
            workerId,
            animation: 'celebrating',
            duration: 3000,
          });
        });
        break;
      }

      case 'pipeline.failed': {
        district.pipelineStatus = 'failed';
        district.visualState.glowColor = '#FF3333'; // Red
        district.visualState.hasSmoke = true;
        
        mutations.push({
          type: 'pipeline.status_changed',
          districtId,
          pipelineId: payload.pipelineId,
          previousStatus,
          newStatus: 'failed',
          activeCranes: 0,
        });

        // Workers look distressed
        district.activeWorkerIds.forEach(workerId => {
          mutations.push({
            type: 'worker.animation_changed',
            workerId,
            animation: 'inspecting',
            duration: 5000,
          });
        });
        break;
      }
    }

    return { mutations, newState };
  }
}
```

---

### 3.5 Mutation Broadcaster

```typescript
// services/event-processor/src/broadcast/MutationBroadcaster.ts

import { createClient, RedisClientType } from 'redis';
import { CityMutation } from '@gitlab-city/shared/types';
import { logger } from '../utils/logger';

// The WebSocket server subscribes to this Redis pub/sub channel
const BROADCAST_CHANNEL = 'city.mutations';

export class MutationBroadcaster {
  private publisher: RedisClientType;

  constructor() {
    this.publisher = createClient({ url: process.env.REDIS_URL });
    this.publisher.connect();
  }

  async broadcast(orgId: string, mutations: CityMutation[]): Promise<void> {
    if (mutations.length === 0) return;

    const message = JSON.stringify({ orgId, mutations, timestamp: Date.now() });
    
    await this.publisher.publish(BROADCAST_CHANNEL, message);
    
    logger.debug({ orgId, mutationCount: mutations.length }, 'Mutations broadcast');
  }
}
```

---

## 4. WebSocket Server Service

```typescript
// services/websocket-server/src/server.ts

import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { CityStateCache } from './cache/CityStateCache';
import { logger } from './utils/logger';

export async function createWebSocketServer(httpServer: HttpServer): Promise<SocketServer> {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  // Redis adapter for multi-node Socket.io
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));

  // Subscribe to city mutations from Event Processor
  const subscriber = pubClient.duplicate();
  await subscriber.connect();
  await subscriber.subscribe('city.mutations', async (message) => {
    const { orgId, mutations, timestamp } = JSON.parse(message);
    
    // Broadcast to all clients in the organization's room
    io.to(`org:${orgId}`).emit('city:mutations', { mutations, timestamp });
  });

  const stateCache = new CityStateCache();

  io.on('connection', async (socket) => {
    const { orgId } = socket.handshake.query as { orgId: string };
    
    if (!orgId) {
      socket.disconnect();
      return;
    }

    logger.info({ socketId: socket.id, orgId }, 'Client connected');

    // Join organization room
    socket.join(`org:${orgId}`);

    // Send full city snapshot immediately on connect
    const cityState = await stateCache.getState(orgId);
    if (cityState) {
      socket.emit('city:snapshot', cityState);
    }

    // Handle time-travel requests
    socket.on('city:replay', async ({ orgId: replayOrgId, fromDate, toDate }) => {
      logger.info({ replayOrgId, fromDate, toDate }, 'Replay requested');
      // Stream historical events in order
      await streamHistoricalEvents(socket, replayOrgId, fromDate, toDate);
    });

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id, orgId }, 'Client disconnected');
    });
  });

  return io;
}

async function streamHistoricalEvents(
  socket: import('socket.io').Socket,
  orgId: string,
  fromDate: string,
  toDate: string
): Promise<void> {
  // TODO: Query PostgreSQL for events in time range, stream them with delays
  // to simulate real-time playback
}
```

---

## 5. GitLab API Bootstrap Service

On startup, or when a new organization is registered, the system bootstraps historical data from the GitLab API:

```typescript
// services/event-processor/src/bootstrap/GitLabApiBootstrap.ts

import { Gitlab } from '@gitbeaker/node';
import { CityStateManager } from '../state/CityStateManager';
import { logger } from '../utils/logger';

export class GitLabApiBootstrap {
  private gitlab: InstanceType<typeof Gitlab>;
  private stateManager: CityStateManager;

  constructor(stateManager: CityStateManager, gitlabToken: string, gitlabHost?: string) {
    this.gitlab = new Gitlab({
      token: gitlabToken,
      host: gitlabHost ?? 'https://gitlab.com',
    });
    this.stateManager = stateManager;
  }

  async bootstrapOrganization(orgId: string, groupPath: string): Promise<void> {
    logger.info({ orgId, groupPath }, 'Bootstrapping organization from GitLab API');

    // 1. Fetch all projects in group
    const projects = await this.gitlab.Groups.allProjects(groupPath, {
      include_subgroups: true,
      with_issues_enabled: true,
    });

    logger.info({ count: projects.length }, 'Found projects');

    for (const project of projects) {
      await this.bootstrapProject(orgId, project);
    }
  }

  private async bootstrapProject(orgId: string, project: any): Promise<void> {
    try {
      // Create district
      await this.stateManager.getOrCreateDistrict(
        orgId,
        String(project.id),
        project.path_with_namespace
      );

      // Fetch recent commits (last 90 days)
      const since = new Date();
      since.setDate(since.getDate() - 90);

      const commits = await this.gitlab.Commits.all(project.id, {
        since: since.toISOString(),
        all: true,
        with_stats: true,
      });

      logger.info({ project: project.path, commitCount: commits.length }, 'Bootstrapping commits');

      // Process commits oldest-first to build city historically
      for (const commit of commits.reverse()) {
        // Create synthetic CityEvent from each commit and apply it
        // This builds the initial city state from history
        const syntheticEvent = this.commitToCityEvent(orgId, project, commit);
        await this.stateManager.applyEvent(syntheticEvent);
      }

      // Fetch contributors for worker generation
      const contributors = await this.gitlab.Repositories.contributors(project.id);
      for (const contributor of contributors) {
        // Workers are created lazily when events arrive
        logger.debug({ contributor: contributor.name }, 'Contributor found');
      }

    } catch (err) {
      logger.error({ err, projectId: project.id }, 'Failed to bootstrap project');
    }
  }

  private commitToCityEvent(orgId: string, project: any, commit: any): CityEvent {
    // Map GitLab API commit response → CityEvent
    return {
      id: `bootstrap-${commit.id}`,
      type: 'commit',
      organizationId: orgId,
      projectId: String(project.id),
      projectPath: project.path_with_namespace,
      actor: {
        id: String(commit.author_email?.hashCode?.() ?? 0),
        username: commit.author_name.toLowerCase().replace(/\s+/g, '.'),
        name: commit.author_name,
        avatarUrl: '',
      },
      payload: {
        commitCount: 1,
        branch: project.default_branch,
        before: '',
        after: commit.id,
        commits: [{
          id: commit.id,
          message: commit.message ?? '',
          timestamp: commit.created_at,
          authorName: commit.author_name,
          authorEmail: commit.author_email ?? '',
          addedFiles: [],
          modifiedFiles: [],
          removedFiles: [],
          stats: {
            additions: commit.stats?.additions ?? 0,
            deletions: commit.stats?.deletions ?? 0,
            total: commit.stats?.total ?? 0,
          },
        }],
      },
      receivedAt: new Date().toISOString(),
      gitlabTimestamp: commit.created_at,
    };
  }
}
```

---

## 6. Configuration

```yaml
# services/webhook-receiver/config/default.yaml

server:
  port: 3001
  host: "0.0.0.0"

redis:
  url: "redis://localhost:6379"
  stream_max_len: 100000       # Maximum events per stream before trimming

webhook:
  max_payload_size: "5mb"
  rate_limit:
    window_ms: 60000
    max_requests: 500

logging:
  level: "info"
  format: "json"
```

```yaml
# services/event-processor/config/default.yaml

redis:
  url: "redis://localhost:6379"
  consumer_group: "city-processor"
  batch_size: 50
  block_ms: 2000

database:
  url: "postgresql://gitlab_city:password@localhost:5432/gitlab_city"
  pool_size: 10
  snapshot_interval_events: 1000   # Take snapshot every N events

gitlab:
  host: "https://gitlab.com"
  rate_limit_per_sec: 10           # GitLab API rate limit budget

city:
  floor_per_commit: 1
  floor_per_500_lines: 1
  max_building_floors: 200
  worker_walk_duration_ms: 2500
  worker_idle_after_ms: 30000      # Worker becomes 'resting' after 30s inactivity
```
