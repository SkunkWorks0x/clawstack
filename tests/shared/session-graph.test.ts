/**
 * Tests for the ClawStack shared infrastructure:
 * - Agent Session Graph (SQLite)
 * - Event Bus (pub/sub)
 *
 * These test the core primitive that all five products depend on.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionGraph } from '../../packages/shared/session-graph/index.js';
import { EventBus, createEvent } from '../../packages/shared/event-bus/index.js';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

// ─── Agent Session Graph Tests ──────────────────────────────────

describe('SessionGraph', () => {
  let graph: SessionGraph;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'clawstack-test-'));
    graph = new SessionGraph(join(tempDir, 'test.db'));
  });

  afterEach(() => {
    graph.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Agents', () => {
    it('registers and retrieves an agent', () => {
      const agent = graph.registerAgent({
        name: 'Blade',
        platform: 'openclaw',
        version: '2026.2.6',
        dockerSandboxed: true,
        metadata: { configPath: '~/.openclaw' },
      });

      expect(agent.agentId).toBeDefined();
      expect(agent.name).toBe('Blade');

      const retrieved = graph.getAgent(agent.agentId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe('Blade');
      expect(retrieved!.dockerSandboxed).toBe(true);
      expect(retrieved!.metadata).toEqual({ configPath: '~/.openclaw' });
    });

    it('lists all agents', () => {
      graph.registerAgent({ name: 'Agent-1', platform: 'openclaw', version: '1.0', dockerSandboxed: false, metadata: {} });
      graph.registerAgent({ name: 'Agent-2', platform: 'openclaw', version: '1.0', dockerSandboxed: true, metadata: {} });

      const agents = graph.listAgents();
      expect(agents).toHaveLength(2);
    });
  });

  describe('Sessions', () => {
    it('starts and ends a session', () => {
      const agent = graph.registerAgent({ name: 'Test', platform: 'openclaw', version: '1.0', dockerSandboxed: false, metadata: {} });
      const session = graph.startSession(agent.agentId);

      expect(session.status).toBe('active');
      expect(session.endedAt).toBeNull();

      graph.endSession(session.sessionId, 'completed');

      const active = graph.getActiveSessions(agent.agentId);
      expect(active).toHaveLength(0);
    });

    it('tracks parent-child session lineage', () => {
      const agent = graph.registerAgent({ name: 'Test', platform: 'openclaw', version: '1.0', dockerSandboxed: false, metadata: {} });
      const parent = graph.startSession(agent.agentId);
      const child = graph.startSession(agent.agentId, { parentSessionId: parent.sessionId });

      expect(child.parentSessionId).toBe(parent.sessionId);
    });
  });

  describe('Behavior Events (ClawGuard)', () => {
    it('records and queries threat events', () => {
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
      expect(threats).toHaveLength(1);
      expect(threats[0].threatLevel).toBe('critical');
      expect(threats[0].blocked).toBe(true);
    });
  });

  describe('Cost Records (ClawBudget)', () => {
    it('records cost and calculates session totals', () => {
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
      expect(cost.tokens).toBe(9500);
      expect(cost.costUsd).toBeCloseTo(0.151, 3);
      expect(cost.calls).toBe(2);
    });

    it('checks budget limits', () => {
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
      expect(exceeded.session).toBe(true);   // 0.15 > 0.10
      expect(exceeded.daily).toBe(false);     // 0.15 < 1.00
      expect(exceeded.monthly).toBe(false);   // 0.15 < 10.00
    });
  });

  describe('Memory (ClawMemory)', () => {
    it('creates entities and respects token budget on recall', () => {
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
      expect(recalled).toHaveLength(2);
      expect(recalled[0].name).toBe('important-fact');    // highest confidence
      expect(recalled[1].name).toBe('user-preference');   // second highest
    });

    it('creates relations between entities', () => {
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

      expect(relation.relationType).toBe('manages');
    });
  });

  describe('Skill Trust (ClawGuard Certified)', () => {
    it('sets and retrieves trust levels', () => {
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
      expect(untrusted).toHaveLength(1);
      expect(untrusted[0].skillName).toBe('sus-data-exfil');
      expect(untrusted[0].threatHistory).toBe(5);
    });
  });
});

// ─── Event Bus Tests ────────────────────────────────────────────

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  afterEach(() => {
    bus.clear();
  });

  it('delivers events to subscribers', async () => {
    const received: any[] = [];
    bus.on('cost.recorded', (event) => { received.push(event); });

    await bus.emit(createEvent('cost.recorded', 'clawbudget', { amount: 0.15 }));

    expect(received).toHaveLength(1);
    expect(received[0].payload.amount).toBe(0.15);
  });

  it('wildcard subscribers receive all events', async () => {
    const received: any[] = [];
    bus.on('*', (event) => { received.push(event); });

    await bus.emit(createEvent('cost.recorded', 'clawbudget', {}));
    await bus.emit(createEvent('behavior.blocked', 'clawguard', {}));

    expect(received).toHaveLength(2);
  });

  it('once() fires only once', async () => {
    let count = 0;
    bus.once('session.started', () => { count++; });

    await bus.emit(createEvent('session.started', 'system', {}));
    await bus.emit(createEvent('session.started', 'system', {}));

    expect(count).toBe(1);
  });

  it('unsubscribe prevents further delivery', async () => {
    let count = 0;
    const unsub = bus.on('cost.recorded', () => { count++; });

    await bus.emit(createEvent('cost.recorded', 'clawbudget', {}));
    unsub();
    await bus.emit(createEvent('cost.recorded', 'clawbudget', {}));

    expect(count).toBe(1);
  });

  it('maintains event history', async () => {
    await bus.emit(createEvent('session.started', 'system', { id: '1' }));
    await bus.emit(createEvent('cost.recorded', 'clawbudget', { amount: 0.05 }));
    await bus.emit(createEvent('session.ended', 'system', { id: '1' }));

    const all = bus.getHistory();
    expect(all).toHaveLength(3);

    const costOnly = bus.getHistory('cost.recorded');
    expect(costOnly).toHaveLength(1);
  });

  it('cross-product integration: ClawGuard threat triggers ClawBudget alert', async () => {
    // Simulate the compound integration:
    // ClawGuard detects a threat → ClawBudget checks if it correlates with cost spike

    const budgetAlerts: any[] = [];
    const guardAlerts: any[] = [];

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
    await bus.emit(createEvent(
      'behavior.blocked',
      'clawguard',
      { skillId: 'sus-001', reason: 'Attempted data exfiltration' },
      { sessionId: 'sess-123', agentId: 'agent-456' }
    ));

    expect(budgetAlerts).toHaveLength(1);
    expect(budgetAlerts[0].action).toBe('check_cost_anomaly');
    expect(guardAlerts).toHaveLength(1);
  });
});
