/**
 * ClawStack Dashboard API Server
 *
 * Lightweight Express wrapper around SessionGraph.
 * Serves REST endpoints + SSE stream for real-time updates.
 * Runs on port 3001, Vite proxies /api/* in development.
 */

import express from 'express';
import cors from 'cors';
import { SessionGraph, EventBus, getEventBus } from '@clawstack/shared';
import { createRoutes } from './routes.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const DB_PATH = process.env.DB_PATH || undefined;

const app = express();
app.use(cors());
app.use(express.json());

// Initialize shared infrastructure
const graph = new SessionGraph(DB_PATH);
const bus = getEventBus();

// Mount API routes
app.use('/api', createRoutes(graph, bus));

app.listen(PORT, () => {
  console.log(`[ClawStack Dashboard] API server running on http://localhost:${PORT}`);
});

export { app, graph, bus };
