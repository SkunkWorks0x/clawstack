/**
 * ClawStack Dashboard API Server
 *
 * Lightweight Express wrapper around SessionGraph.
 * Serves REST endpoints + SSE stream for real-time updates.
 * Runs on port 3001, Vite proxies /api/* in development.
 */
import { SessionGraph, EventBus } from '@clawstack/shared';
declare const app: import("express-serve-static-core").Express;
declare const graph: SessionGraph;
declare const bus: EventBus;
export { app, graph, bus };
//# sourceMappingURL=index.d.ts.map