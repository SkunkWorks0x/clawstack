/**
 * Dashboard API Route Tests
 *
 * Tests the Express API server against a real SessionGraph (in-memory SQLite).
 * Verifies all endpoints return correct data shapes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { SessionGraph, EventBus } from '@clawstack/shared';
import { createRoutes } from '../server/routes.js';
// In-memory test server
let graph;
let bus;
let app;
let server;
let baseUrl;
beforeAll(async () => {
    graph = new SessionGraph(':memory:');
    bus = new EventBus();
    app = express();
    app.use(express.json());
    app.use('/api', createRoutes(graph, bus));
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            const addr = server.address();
            baseUrl = `http://localhost:${addr.port}`;
            resolve();
        });
    });
    // Seed test data
    const agent = graph.registerAgent({
        name: 'test-agent',
        platform: 'openclaw',
        version: '1.0.0',
        dockerSandboxed: true,
        metadata: { env: 'test' },
    });
    const session = graph.startSession(agent.agentId);
    // Behavior events
    graph.recordBehavior({
        sessionId: session.sessionId,
        agentId: agent.agentId,
        eventType: 'tool_call',
        details: { tool: 'bash', command: 'rm -rf /' },
        threatLevel: 'critical',
        threatSignature: 'CLAW-001',
        blocked: true,
    });
    graph.recordBehavior({
        sessionId: session.sessionId,
        agentId: agent.agentId,
        eventType: 'network_request',
        details: { url: 'https://evil.com' },
        threatLevel: 'high',
        threatSignature: null,
        blocked: false,
    });
    // Cost records
    graph.recordCost({
        sessionId: session.sessionId,
        agentId: agent.agentId,
        model: 'claude-sonnet-4-20250514',
        modelTier: 'sonnet',
        inputTokens: 1000,
        outputTokens: 500,
        thinkingTokens: 0,
        totalTokens: 1500,
        estimatedCostUsd: 0.012,
        routedBy: 'smart_router',
        originalModel: 'claude-opus-4-20250514',
    });
    graph.recordCost({
        sessionId: session.sessionId,
        agentId: agent.agentId,
        model: 'claude-opus-4-20250514',
        modelTier: 'opus',
        inputTokens: 5000,
        outputTokens: 2000,
        thinkingTokens: 1000,
        totalTokens: 8000,
        estimatedCostUsd: 0.18,
        routedBy: 'user',
        originalModel: null,
    });
    // Budget
    graph.setBudget({
        agentId: agent.agentId,
        maxPerSession: 5.0,
        maxPerDay: 50.0,
        maxPerMonth: 500.0,
        alertThresholdPct: 80,
    });
    // Memory
    graph.createEntity({
        agentId: agent.agentId,
        entityType: 'person',
        name: 'Alice',
        content: 'Lead developer working on auth module',
        workspace: 'work',
        confidence: 0.9,
        tokenCost: 15,
    });
    graph.createEntity({
        agentId: agent.agentId,
        entityType: 'tool',
        name: 'PostgreSQL',
        content: 'Primary database for user data',
        workspace: 'work',
        confidence: 0.95,
        tokenCost: 12,
    });
    // Skill trust
    graph.setSkillTrust({
        skillId: 'skill-001',
        skillName: 'web-search',
        publisher: 'openclaw',
        trustLevel: 'verified',
        certifiedAt: null,
        lastAuditAt: new Date().toISOString(),
        threatHistory: 0,
        behavioralFingerprint: 'abc123',
    });
    graph.setSkillTrust({
        skillId: 'skill-002',
        skillName: 'file-delete',
        publisher: 'unknown',
        trustLevel: 'untrusted',
        certifiedAt: null,
        lastAuditAt: null,
        threatHistory: 3,
        behavioralFingerprint: null,
    });
});
afterAll(() => {
    server?.close();
    graph?.close();
});
async function get(path) {
    const res = await fetch(`${baseUrl}/api${path}`);
    expect(res.ok).toBe(true);
    return res.json();
}
describe('Dashboard API — Overview', () => {
    it('returns all overview stats', async () => {
        const data = await get('/overview');
        expect(data.totalAgents).toBe(1);
        expect(data.activeSessions).toBe(1);
        expect(typeof data.threatsBlockedToday).toBe('number');
        expect(typeof data.moneySpentToday).toBe('number');
        expect(typeof data.moneySavedByRouter).toBe('number');
        expect(data.memoryEntities).toBe(2);
        expect(typeof data.activePipelines).toBe('number');
    });
});
describe('Dashboard API — Agents', () => {
    it('lists agents', async () => {
        const data = await get('/agents');
        expect(data.length).toBe(1);
        expect(data[0].name).toBe('test-agent');
        expect(data[0].agentId).toBeTruthy();
    });
    it('lists active sessions', async () => {
        const data = await get('/sessions/active');
        expect(data.length).toBe(1);
        expect(data[0].status).toBe('active');
    });
});
describe('Dashboard API — Security', () => {
    it('returns threats filtered by level', async () => {
        const data = await get('/threats?minLevel=high');
        expect(data.length).toBeGreaterThanOrEqual(1);
        for (const e of data) {
            expect(['high', 'critical']).toContain(e.threatLevel);
        }
    });
    it('returns all threats at low+', async () => {
        const data = await get('/threats');
        expect(data.length).toBe(2);
    });
    it('returns blocked events', async () => {
        const data = await get('/threats/blocked');
        expect(data.length).toBe(1);
        expect(data[0].blocked).toBe(1);
        expect(data[0].threat_signature).toBe('CLAW-001');
    });
    it('returns skills with trust levels', async () => {
        const data = await get('/skills');
        expect(data.length).toBe(2);
        const names = data.map((s) => s.skill_name);
        expect(names).toContain('web-search');
        expect(names).toContain('file-delete');
    });
});
describe('Dashboard API — Cost', () => {
    it('returns daily costs', async () => {
        const data = await get('/costs/daily?days=30');
        expect(Array.isArray(data)).toBe(true);
        if (data.length > 0) {
            expect(data[0]).toHaveProperty('day');
            expect(data[0]).toHaveProperty('cost_usd');
            expect(data[0]).toHaveProperty('api_calls');
        }
    });
    it('returns today cost summary', async () => {
        const data = await get('/costs/today');
        expect(typeof data.total).toBe('number');
        expect(typeof data.tokens).toBe('number');
        expect(typeof data.calls).toBe('number');
    });
    it('returns budget status per agent', async () => {
        const data = await get('/budgets');
        expect(data.length).toBe(1);
        expect(data[0].agentName).toBe('test-agent');
        expect(data[0].budget).toBeTruthy();
        expect(data[0].budget.maxPerDay).toBe(50.0);
        expect(typeof data[0].pctUsed).toBe('number');
    });
    it('returns router stats', async () => {
        const data = await get('/costs/router-stats');
        expect(data.total_requests).toBe(2);
        expect(data.routed_requests).toBe(1);
        expect(typeof data.routed_cost).toBe('number');
        expect(typeof data.direct_cost).toBe('number');
    });
    it('returns surgery candidates', async () => {
        const data = await get('/costs/surgery');
        // Our test data has < 100K tokens so should be empty
        expect(Array.isArray(data)).toBe(true);
    });
});
describe('Dashboard API — Memory', () => {
    it('returns all memory entities', async () => {
        const data = await get('/memory/entities');
        expect(data.length).toBe(2);
        expect(data[0]).toHaveProperty('entityId');
        expect(data[0]).toHaveProperty('name');
        expect(data[0]).toHaveProperty('entityType');
    });
    it('filters entities by type', async () => {
        const data = await get('/memory/entities?type=person');
        expect(data.length).toBe(1);
        expect(data[0].name).toBe('Alice');
    });
    it('searches entities by name', async () => {
        const data = await get('/memory/entities?search=postgres');
        expect(data.length).toBe(1);
        expect(data[0].entityType).toBe('tool');
    });
    it('returns knowledge graph', async () => {
        const data = await get('/memory/graph');
        expect(data).toHaveProperty('nodes');
        expect(data).toHaveProperty('edges');
        expect(data.nodes.length).toBe(2);
    });
    it('returns recall results with token budget', async () => {
        const agents = await get('/agents');
        const agentId = agents[0].agentId;
        const data = await get(`/memory/recall?agentId=${agentId}&workspace=work&tokenBudget=20`);
        expect(data).toHaveProperty('entities');
        expect(data).toHaveProperty('totalTokens');
        expect(data).toHaveProperty('tokenBudget');
        expect(data.tokenBudget).toBe(20);
        // With 20 token budget, should fit both entities (15 + 12 = 27 > 20), so only highest confidence
        expect(data.entities.length).toBeGreaterThanOrEqual(1);
        expect(data.totalTokens).toBeLessThanOrEqual(20);
    });
    it('rejects recall without agentId', async () => {
        const res = await fetch(`${baseUrl}/api/memory/recall`);
        expect(res.status).toBe(400);
    });
});
describe('Dashboard API — Pipelines', () => {
    it('returns empty pipeline list', async () => {
        const data = await get('/pipelines');
        expect(Array.isArray(data)).toBe(true);
    });
    it('returns 404 for missing pipeline', async () => {
        const res = await fetch(`${baseUrl}/api/pipelines/nonexistent`);
        expect(res.status).toBe(404);
    });
});
describe('Dashboard API — Setup', () => {
    it('returns agent setup status', async () => {
        const data = await get('/setup/agents');
        expect(data.length).toBe(1);
        expect(data[0].name).toBe('test-agent');
        expect(typeof data[0].totalSessions).toBe('number');
        expect(typeof data[0].activeSessions).toBe('number');
    });
});
describe('Dashboard API — SSE', () => {
    it('connects to SSE stream', async () => {
        const res = await fetch(`${baseUrl}/api/events/stream`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('text/event-stream');
        // Read the first chunk (connected message)
        const reader = res.body.getReader();
        const { value } = await reader.read();
        const text = new TextDecoder().decode(value);
        expect(text).toContain('"type":"connected"');
        reader.cancel();
    });
});
//# sourceMappingURL=api-routes.test.js.map