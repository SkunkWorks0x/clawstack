"use strict";
/**
 * Tests for the ClawStack shared infrastructure:
 * - Agent Session Graph (SQLite)
 * - Event Bus (pub/sub)
 *
 * These test the core primitive that all five products depend on.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const index_js_1 = require("../../packages/shared/session-graph/index.js");
const index_js_2 = require("../../packages/shared/event-bus/index.js");
const path_1 = require("path");
const fs_1 = require("fs");
const os_1 = require("os");
// ─── Agent Session Graph Tests ──────────────────────────────────
(0, vitest_1.describe)('SessionGraph', () => {
    let graph;
    let tempDir;
    (0, vitest_1.beforeEach)(() => {
        tempDir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'clawstack-test-'));
        graph = new index_js_1.SessionGraph((0, path_1.join)(tempDir, 'test.db'));
    });
    (0, vitest_1.afterEach)(() => {
        graph.close();
        (0, fs_1.rmSync)(tempDir, { recursive: true, force: true });
    });
    (0, vitest_1.describe)('Agents', () => {
        (0, vitest_1.it)('registers and retrieves an agent', () => {
            const agent = graph.registerAgent({
                name: 'Blade',
                platform: 'openclaw',
                version: '2026.2.6',
                dockerSandboxed: true,
                metadata: { configPath: '~/.openclaw' },
            });
            (0, vitest_1.expect)(agent.agentId).toBeDefined();
            (0, vitest_1.expect)(agent.name).toBe('Blade');
            const retrieved = graph.getAgent(agent.agentId);
            (0, vitest_1.expect)(retrieved).not.toBeNull();
            (0, vitest_1.expect)(retrieved.name).toBe('Blade');
            (0, vitest_1.expect)(retrieved.dockerSandboxed).toBe(true);
            (0, vitest_1.expect)(retrieved.metadata).toEqual({ configPath: '~/.openclaw' });
        });
        (0, vitest_1.it)('lists all agents', () => {
            graph.registerAgent({ name: 'Agent-1', platform: 'openclaw', version: '1.0', dockerSandboxed: false, metadata: {} });
            graph.registerAgent({ name: 'Agent-2', platform: 'openclaw', version: '1.0', dockerSandboxed: true, metadata: {} });
            const agents = graph.listAgents();
            (0, vitest_1.expect)(agents).toHaveLength(2);
        });
    });
    (0, vitest_1.describe)('Sessions', () => {
        (0, vitest_1.it)('starts and ends a session', () => {
            const agent = graph.registerAgent({ name: 'Test', platform: 'openclaw', version: '1.0', dockerSandboxed: false, metadata: {} });
            const session = graph.startSession(agent.agentId);
            (0, vitest_1.expect)(session.status).toBe('active');
            (0, vitest_1.expect)(session.endedAt).toBeNull();
            graph.endSession(session.sessionId, 'completed');
            const active = graph.getActiveSessions(agent.agentId);
            (0, vitest_1.expect)(active).toHaveLength(0);
        });
        (0, vitest_1.it)('tracks parent-child session lineage', () => {
            const agent = graph.registerAgent({ name: 'Test', platform: 'openclaw', version: '1.0', dockerSandboxed: false, metadata: {} });
            const parent = graph.startSession(agent.agentId);
            const child = graph.startSession(agent.agentId, { parentSessionId: parent.sessionId });
            (0, vitest_1.expect)(child.parentSessionId).toBe(parent.sessionId);
        });
    });
    (0, vitest_1.describe)('Behavior Events (ClawGuard)', () => {
        (0, vitest_1.it)('records and queries threat events', () => {
            const agent = graph.registerAgent({ name: 'Test', platform: 'openclaw', version: '1.0', dockerSandboxed: false, metadata: {} });
            const session = graph.startSession(agent.agentId);
            // Normal event
            graph.recordBehavior({
                sessionId: session.sessionId,
                agentId: agent.agentId,
                eventType: 'tool_call',
                details: { tool: 'read_file', path: '/tmp/safe.txt' },
                threatLevel: 'none',
                threatSignature: null,
                blocked: false,
            });
            // Threat event
            graph.recordBehavior({
                sessionId: session.sessionId,
                agentId: agent.agentId,
                eventType: 'network_request',
                details: { url: 'https://evil.com/exfil', method: 'POST' },
                threatLevel: 'critical',
                threatSignature: 'SIG-EXFIL-001',
                blocked: true,
            });
            const threats = graph.getThreats(session.sessionId, 'high');
            (0, vitest_1.expect)(threats).toHaveLength(1);
            (0, vitest_1.expect)(threats[0].threatLevel).toBe('critical');
            (0, vitest_1.expect)(threats[0].blocked).toBe(true);
        });
    });
    (0, vitest_1.describe)('Cost Records (ClawBudget)', () => {
        (0, vitest_1.it)('records cost and calculates session totals', () => {
            const agent = graph.registerAgent({ name: 'Test', platform: 'openclaw', version: '1.0', dockerSandboxed: false, metadata: {} });
            const session = graph.startSession(agent.agentId);
            graph.recordCost({
                sessionId: session.sessionId,
                agentId: agent.agentId,
                model: 'claude-opus-4-6',
                modelTier: 'opus',
                inputTokens: 5000,
                outputTokens: 2000,
                thinkingTokens: 1000,
                totalTokens: 8000,
                estimatedCostUsd: 0.15,
                routedBy: 'user',
                originalModel: null,
            });
            graph.recordCost({
                sessionId: session.sessionId,
                agentId: agent.agentId,
                model: 'claude-haiku-4-5',
                modelTier: 'haiku',
                inputTokens: 1000,
                outputTokens: 500,
                thinkingTokens: 0,
                totalTokens: 1500,
                estimatedCostUsd: 0.001,
                routedBy: 'smart_router',
                originalModel: 'claude-opus-4-6',
            });
            const cost = graph.getSessionCost(session.sessionId);
            (0, vitest_1.expect)(cost.tokens).toBe(9500);
            (0, vitest_1.expect)(cost.costUsd).toBeCloseTo(0.151, 3);
            (0, vitest_1.expect)(cost.calls).toBe(2);
        });
        (0, vitest_1.it)('checks budget limits', () => {
            const agent = graph.registerAgent({ name: 'Test', platform: 'openclaw', version: '1.0', dockerSandboxed: false, metadata: {} });
            const session = graph.startSession(agent.agentId);
            graph.setBudget({
                agentId: agent.agentId,
                maxPerSession: 0.10,
                maxPerDay: 1.00,
                maxPerMonth: 10.00,
                alertThresholdPct: 80,
            });
            graph.recordCost({
                sessionId: session.sessionId,
                agentId: agent.agentId,
                model: 'claude-opus-4-6',
                modelTier: 'opus',
                inputTokens: 5000,
                outputTokens: 2000,
                thinkingTokens: 1000,
                totalTokens: 8000,
                estimatedCostUsd: 0.15,
                routedBy: 'user',
                originalModel: null,
            });
            const exceeded = graph.checkBudgetExceeded(agent.agentId, session.sessionId);
            (0, vitest_1.expect)(exceeded.session).toBe(true); // 0.15 > 0.10
            (0, vitest_1.expect)(exceeded.daily).toBe(false); // 0.15 < 1.00
            (0, vitest_1.expect)(exceeded.monthly).toBe(false); // 0.15 < 10.00
        });
    });
    (0, vitest_1.describe)('Memory (ClawMemory)', () => {
        (0, vitest_1.it)('creates entities and respects token budget on recall', () => {
            const agent = graph.registerAgent({ name: 'Test', platform: 'openclaw', version: '1.0', dockerSandboxed: false, metadata: {} });
            // Create entities with different confidence and token costs
            graph.createEntity({
                agentId: agent.agentId,
                entityType: 'fact',
                name: 'important-fact',
                content: 'The sky is blue',
                workspace: 'default',
                confidence: 0.95,
                tokenCost: 100,
            });
            graph.createEntity({
                agentId: agent.agentId,
                entityType: 'preference',
                name: 'user-preference',
                content: 'User prefers dark mode',
                workspace: 'default',
                confidence: 0.8,
                tokenCost: 80,
            });
            graph.createEntity({
                agentId: agent.agentId,
                entityType: 'fact',
                name: 'low-priority',
                content: 'Random trivia',
                workspace: 'default',
                confidence: 0.3,
                tokenCost: 200,
            });
            // Token budget of 200 should return top 2 by confidence (100 + 80 = 180)
            const recalled = graph.queryMemory(agent.agentId, 'default', 200);
            (0, vitest_1.expect)(recalled).toHaveLength(2);
            (0, vitest_1.expect)(recalled[0].name).toBe('important-fact'); // highest confidence
            (0, vitest_1.expect)(recalled[1].name).toBe('user-preference'); // second highest
        });
        (0, vitest_1.it)('creates relations between entities', () => {
            const agent = graph.registerAgent({ name: 'Test', platform: 'openclaw', version: '1.0', dockerSandboxed: false, metadata: {} });
            const alice = graph.createEntity({
                agentId: agent.agentId, entityType: 'person', name: 'Alice',
                content: 'Alice is a developer', workspace: 'work', confidence: 0.9, tokenCost: 50,
            });
            const authTeam = graph.createEntity({
                agentId: agent.agentId, entityType: 'concept', name: 'Auth Team',
                content: 'Authentication team', workspace: 'work', confidence: 0.9, tokenCost: 50,
            });
            const relation = graph.createRelation({
                sourceEntityId: alice.entityId,
                targetEntityId: authTeam.entityId,
                relationType: 'manages',
                weight: 0.9,
                evidence: 'Stated in team standup on 2026-02-20',
            });
            (0, vitest_1.expect)(relation.relationType).toBe('manages');
        });
    });
    (0, vitest_1.describe)('Skill Trust (ClawGuard Certified)', () => {
        (0, vitest_1.it)('sets and retrieves trust levels', () => {
            graph.setSkillTrust({
                skillId: 'skill-001',
                skillName: 'web-search',
                publisher: 'openclaw-core',
                trustLevel: 'certified',
                certifiedAt: '2026-02-20T00:00:00Z',
                lastAuditAt: '2026-02-20T00:00:00Z',
                threatHistory: 0,
                behavioralFingerprint: 'abc123',
            });
            graph.setSkillTrust({
                skillId: 'skill-002',
                skillName: 'sus-data-exfil',
                publisher: 'anon-dev',
                trustLevel: 'untrusted',
                certifiedAt: null,
                lastAuditAt: '2026-02-22T00:00:00Z',
                threatHistory: 5,
                behavioralFingerprint: null,
            });
            const untrusted = graph.getUntrustedSkills();
            (0, vitest_1.expect)(untrusted).toHaveLength(1);
            (0, vitest_1.expect)(untrusted[0].skillName).toBe('sus-data-exfil');
            (0, vitest_1.expect)(untrusted[0].threatHistory).toBe(5);
        });
    });
});
// ─── Event Bus Tests ────────────────────────────────────────────
(0, vitest_1.describe)('EventBus', () => {
    let bus;
    (0, vitest_1.beforeEach)(() => {
        bus = new index_js_2.EventBus();
    });
    (0, vitest_1.afterEach)(() => {
        bus.clear();
    });
    (0, vitest_1.it)('delivers events to subscribers', async () => {
        const received = [];
        bus.on('cost.recorded', (event) => { received.push(event); });
        await bus.emit((0, index_js_2.createEvent)('cost.recorded', 'clawbudget', { amount: 0.15 }));
        (0, vitest_1.expect)(received).toHaveLength(1);
        (0, vitest_1.expect)(received[0].payload.amount).toBe(0.15);
    });
    (0, vitest_1.it)('wildcard subscribers receive all events', async () => {
        const received = [];
        bus.on('*', (event) => { received.push(event); });
        await bus.emit((0, index_js_2.createEvent)('cost.recorded', 'clawbudget', {}));
        await bus.emit((0, index_js_2.createEvent)('behavior.blocked', 'clawguard', {}));
        (0, vitest_1.expect)(received).toHaveLength(2);
    });
    (0, vitest_1.it)('once() fires only once', async () => {
        let count = 0;
        bus.once('session.started', () => { count++; });
        await bus.emit((0, index_js_2.createEvent)('session.started', 'system', {}));
        await bus.emit((0, index_js_2.createEvent)('session.started', 'system', {}));
        (0, vitest_1.expect)(count).toBe(1);
    });
    (0, vitest_1.it)('unsubscribe prevents further delivery', async () => {
        let count = 0;
        const unsub = bus.on('cost.recorded', () => { count++; });
        await bus.emit((0, index_js_2.createEvent)('cost.recorded', 'clawbudget', {}));
        unsub();
        await bus.emit((0, index_js_2.createEvent)('cost.recorded', 'clawbudget', {}));
        (0, vitest_1.expect)(count).toBe(1);
    });
    (0, vitest_1.it)('maintains event history', async () => {
        await bus.emit((0, index_js_2.createEvent)('session.started', 'system', { id: '1' }));
        await bus.emit((0, index_js_2.createEvent)('cost.recorded', 'clawbudget', { amount: 0.05 }));
        await bus.emit((0, index_js_2.createEvent)('session.ended', 'system', { id: '1' }));
        const all = bus.getHistory();
        (0, vitest_1.expect)(all).toHaveLength(3);
        const costOnly = bus.getHistory('cost.recorded');
        (0, vitest_1.expect)(costOnly).toHaveLength(1);
    });
    (0, vitest_1.it)('cross-product integration: ClawGuard threat triggers ClawBudget alert', async () => {
        // Simulate the compound integration:
        // ClawGuard detects a threat → ClawBudget checks if it correlates with cost spike
        const budgetAlerts = [];
        const guardAlerts = [];
        // ClawBudget listens for threats
        bus.on('behavior.blocked', (event) => {
            budgetAlerts.push({
                source: 'clawguard',
                action: 'check_cost_anomaly',
                agentId: event.agentId,
            });
        });
        // Dashboard listens for everything
        bus.on('*', (event) => {
            if (event.channel === 'behavior.blocked') {
                guardAlerts.push(event);
            }
        });
        // ClawGuard blocks a suspicious skill
        await bus.emit((0, index_js_2.createEvent)('behavior.blocked', 'clawguard', { skillId: 'sus-001', reason: 'Attempted data exfiltration' }, { sessionId: 'sess-123', agentId: 'agent-456' }));
        (0, vitest_1.expect)(budgetAlerts).toHaveLength(1);
        (0, vitest_1.expect)(budgetAlerts[0].action).toBe('check_cost_anomaly');
        (0, vitest_1.expect)(guardAlerts).toHaveLength(1);
    });
});
//# sourceMappingURL=session-graph.test.js.map