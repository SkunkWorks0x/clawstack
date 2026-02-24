/**
 * Dashboard API Routes
 *
 * Wraps SessionGraph methods as REST endpoints.
 * SSE endpoint for real-time EventBus forwarding.
 */
import { Router } from 'express';
import type { SessionGraph, EventBus } from '@clawstack/shared';
export declare function createRoutes(graph: SessionGraph, bus: EventBus): Router;
//# sourceMappingURL=routes.d.ts.map