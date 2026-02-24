/**
 * ClawForge Tests
 *
 * Tests the three CLI commands (init, audit, status) and
 * all individual security check functions.
 *
 * Uses temp directories — no real OpenClaw/Docker required.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { SessionGraph } from '../../packages/shared/session-graph/index.js';
import { EventBus, createEvent } from '../../packages/shared/event-bus/index.js';
import {
  checkGatewayBinding,
  checkTokenStrength,
  checkDockerSandbox,
  checkConfigPermissions,
  checkExposedPorts,
  checkOpenClawVersion,
  formatReportCard,
  formatSecurityCheck,
} from '../../packages/clawforge/src/utils.js';
import type { OpenClawConfig, SecurityCheck } from '../../packages/clawforge/src/utils.js';
import { init } from '../../packages/clawforge/src/commands/init.js';
import { status } from '../../packages/clawforge/src/commands/status.js';
import { audit } from '../../packages/clawforge/src/commands/audit.js';

// ─── Security Check Functions ────────────────────────────────────

describe('Security Checks', () => {

  describe('checkGatewayBinding', () => {
    it('passes when bound to loopback', () => {
      const config: OpenClawConfig = { gateway: { bind: 'loopback' } };
      expect(checkGatewayBinding(config).result).toBe('pass');
    });

    it('passes when mode is local', () => {
      const config: OpenClawConfig = { gateway: { mode: 'local' } };
      expect(checkGatewayBinding(config).result).toBe('pass');
    });

    it('passes for 127.0.0.1', () => {
      const config: OpenClawConfig = { gateway: { bind: '127.0.0.1' } };
      expect(checkGatewayBinding(config).result).toBe('pass');
    });

    it('fails when bound to 0.0.0.0', () => {
      const config: OpenClawConfig = { gateway: { bind: '0.0.0.0' } };
      const check = checkGatewayBinding(config);
      expect(check.result).toBe('fail');
      expect(check.detail).toContain('CVE-2026-25253');
    });

    it('fails when bound to lan', () => {
      const config: OpenClawConfig = { gateway: { bind: 'lan' } };
      expect(checkGatewayBinding(config).result).toBe('fail');
    });

    it('warns when no config provided', () => {
      expect(checkGatewayBinding(null).result).toBe('warn');
    });

    it('warns when no bind specified', () => {
      const config: OpenClawConfig = { gateway: {} };
      expect(checkGatewayBinding(config).result).toBe('warn');
    });
  });

  describe('checkTokenStrength', () => {
    it('passes for strong token', () => {
      const config: OpenClawConfig = {
        gateway: { auth: { mode: 'token', token: 'a'.repeat(64) } },
      };
      expect(checkTokenStrength(config).result).toBe('pass');
    });

    it('fails for short token', () => {
      const config: OpenClawConfig = {
        gateway: { auth: { mode: 'token', token: 'short' } },
      };
      const check = checkTokenStrength(config);
      expect(check.result).toBe('fail');
      expect(check.detail).toContain('too short');
    });

    it('fails for placeholder token', () => {
      const config: OpenClawConfig = {
        gateway: { auth: { mode: 'token', token: 'changeme' } },
      };
      expect(checkTokenStrength(config).result).toBe('fail');
    });

    it('fails for default docs token', () => {
      const config: OpenClawConfig = {
        gateway: { auth: { mode: 'token', token: 'replace-with-long-random-token' } },
      };
      expect(checkTokenStrength(config).result).toBe('fail');
    });

    it('fails when token auth enabled but no token set', () => {
      const config: OpenClawConfig = {
        gateway: { auth: { mode: 'token' } },
      };
      expect(checkTokenStrength(config).result).toBe('fail');
    });

    it('warns for non-token auth mode', () => {
      const config: OpenClawConfig = {
        gateway: { auth: { mode: 'password' } },
      };
      expect(checkTokenStrength(config).result).toBe('warn');
    });

    it('warns when no config', () => {
      expect(checkTokenStrength(null).result).toBe('warn');
    });
  });

  describe('checkDockerSandbox', () => {
    it('passes when mode is all and docker running', () => {
      const config: OpenClawConfig = {
        agents: { defaults: { sandbox: { mode: 'all' } } },
      };
      expect(checkDockerSandbox(config, true).result).toBe('pass');
    });

    it('passes when mode is non-main', () => {
      const config: OpenClawConfig = {
        agents: { defaults: { sandbox: { mode: 'non-main' } } },
      };
      expect(checkDockerSandbox(config, true).result).toBe('pass');
    });

    it('fails when docker not running', () => {
      const config: OpenClawConfig = {
        agents: { defaults: { sandbox: { mode: 'all' } } },
      };
      expect(checkDockerSandbox(config, false).result).toBe('fail');
    });

    it('warns when no sandbox config', () => {
      expect(checkDockerSandbox({}, true).result).toBe('warn');
    });
  });

  describe('checkOpenClawVersion', () => {
    it('fails for version before 2026.1.29', () => {
      const check = checkOpenClawVersion('2026.1.24');
      expect(check.result).toBe('fail');
      expect(check.detail).toContain('CVE-2026-25253');
    });

    it('fails for version 2025.x.x', () => {
      expect(checkOpenClawVersion('2025.12.1').result).toBe('fail');
    });

    it('passes for version 2026.1.29', () => {
      expect(checkOpenClawVersion('2026.1.29').result).toBe('pass');
    });

    it('passes for version after 2026.1.29', () => {
      expect(checkOpenClawVersion('2026.2.6').result).toBe('pass');
    });

    it('warns when version is null', () => {
      expect(checkOpenClawVersion(null).result).toBe('warn');
    });
  });

  describe('checkConfigPermissions', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'clawforge-perm-'));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('passes for mode 600', () => {
      const f = join(tempDir, 'secure.json');
      writeFileSync(f, '{}', { mode: 0o600 });
      expect(checkConfigPermissions(f).result).toBe('pass');
    });

    it('fails for world-readable file', () => {
      const f = join(tempDir, 'insecure.json');
      writeFileSync(f, '{}', { mode: 0o644 });
      expect(checkConfigPermissions(f).result).toBe('fail');
    });

    it('warns for nonexistent file', () => {
      expect(checkConfigPermissions(join(tempDir, 'nope.json')).result).toBe('warn');
    });
  });
});

// ─── Report Formatting ──────────────────────────────────────────

describe('Report Formatting', () => {
  it('formats a security check line', () => {
    const check: SecurityCheck = { name: 'Test', result: 'pass', detail: 'OK' };
    expect(formatSecurityCheck(check)).toContain('[PASS]');
    expect(formatSecurityCheck(check)).toContain('Test');
  });

  it('formats a full report card', () => {
    const checks: SecurityCheck[] = [
      { name: 'A', result: 'pass', detail: 'Good' },
      { name: 'B', result: 'warn', detail: 'Meh' },
      { name: 'C', result: 'fail', detail: 'Bad' },
    ];
    const report = formatReportCard(checks);
    expect(report).toContain('ClawForge Security Report');
    expect(report).toContain('1 passed');
    expect(report).toContain('1 warnings');
    expect(report).toContain('1 failures');
    expect(report).toContain('Action Required');
  });

  it('shows all-clear for all passes', () => {
    const checks: SecurityCheck[] = [
      { name: 'A', result: 'pass', detail: 'Good' },
    ];
    expect(formatReportCard(checks)).toContain('All checks passed');
  });
});

// ─── Init Command ────────────────────────────────────────────────

describe('clawforge init', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'clawforge-init-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates .clawstack directory and config', async () => {
    const dbPath = join(tempDir, 'test.db');
    const result = await init({ cwd: tempDir, dbPath });

    expect(existsSync(join(tempDir, '.clawstack'))).toBe(true);
    expect(existsSync(join(tempDir, '.clawstack', 'config.json'))).toBe(true);

    const config = JSON.parse(readFileSync(join(tempDir, '.clawstack', 'config.json'), 'utf-8'));
    expect(config.agentId).toBe(result.agent.agentId);
    expect(config.sessionId).toBe(result.sessionId);
  });

  it('registers agent in Session Graph', async () => {
    const dbPath = join(tempDir, 'test.db');
    const result = await init({ cwd: tempDir, dbPath });

    // Verify agent exists in the graph
    const graph = new SessionGraph(dbPath);
    const agent = graph.getAgent(result.agent.agentId);
    expect(agent).not.toBeNull();
    expect(agent!.platform).toBe('openclaw');
    expect(agent!.metadata).toHaveProperty('clawstackToken');

    // Verify session is active
    const sessions = graph.getActiveSessions(result.agent.agentId);
    expect(sessions.length).toBeGreaterThanOrEqual(1);

    graph.close();
  });

  it('emits session.started event', async () => {
    const bus = new EventBus();
    // Monkey-patch getEventBus to return our test bus
    // Since init() uses the global singleton, we listen on it
    const { getEventBus } = await import('../../packages/shared/event-bus/index.js');
    const globalBus = getEventBus();

    const events: any[] = [];
    const unsub = globalBus.on('session.started', (e) => { events.push(e); });

    const dbPath = join(tempDir, 'test.db');
    await init({ cwd: tempDir, dbPath });

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].sourceProduct).toBe('clawforge');
    expect(events[0].payload.action).toBe('init');

    unsub();
    bus.clear();
  });

  it('produces a security report', async () => {
    const dbPath = join(tempDir, 'test.db');
    const result = await init({ cwd: tempDir, dbPath });

    expect(result.report).toContain('ClawForge Security Report');
    expect(result.checks.length).toBeGreaterThan(0);
    // OS check should always pass
    expect(result.checks[0].name).toBe('Operating System');
    expect(result.checks[0].result).toBe('pass');
  });
});

// ─── Status Command ──────────────────────────────────────────────

describe('clawforge status', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'clawforge-status-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports not found when no .clawstack exists', () => {
    const result = status({ cwd: tempDir });
    expect(result.found).toBe(false);
    expect(result.report).toContain('clawforge init');
  });

  it('shows agent status after init', async () => {
    const dbPath = join(tempDir, 'test.db');
    const initResult = await init({ cwd: tempDir, dbPath });
    const statusResult = status({ cwd: tempDir, dbPath });

    expect(statusResult.found).toBe(true);
    expect(statusResult.agentId).toBe(initResult.agent.agentId);
    expect(statusResult.agentName).toContain('openclaw-');
    expect(statusResult.platform).toBe('openclaw');
    expect(statusResult.activeSessions).toBeGreaterThanOrEqual(1);
    expect(statusResult.report).toContain('ClawForge Agent Status');
  });

  it('reports correct cost data', async () => {
    const dbPath = join(tempDir, 'test.db');
    const initResult = await init({ cwd: tempDir, dbPath });

    // Record some cost against the session
    const graph = new SessionGraph(dbPath);
    graph.recordCost({
      sessionId: initResult.sessionId,
      agentId: initResult.agent.agentId,
      model: 'claude-sonnet-4-6',
      modelTier: 'sonnet',
      inputTokens: 1000,
      outputTokens: 500,
      thinkingTokens: 0,
      totalTokens: 1500,
      estimatedCostUsd: 0.012,
      routedBy: 'user',
      originalModel: null,
    });
    graph.close();

    const statusResult = status({ cwd: tempDir, dbPath });
    expect(statusResult.totalCost).not.toBeNull();
    expect(statusResult.totalCost!.tokens).toBe(1500);
    expect(statusResult.totalCost!.costUsd).toBeCloseTo(0.012, 3);
    expect(statusResult.totalCost!.calls).toBe(1);
  });
});

// ─── Audit Command ───────────────────────────────────────────────

describe('clawforge audit', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'clawforge-audit-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('runs all checks and produces a report', () => {
    const result = audit({ openClawHome: tempDir });
    expect(result.checks.length).toBeGreaterThanOrEqual(5);
    expect(result.report).toContain('ClawForge Security Report');
  });

  it('detects insecure config when present', () => {
    // Write an insecure openclaw.json
    const configPath = join(tempDir, 'openclaw.json');
    writeFileSync(configPath, JSON.stringify({
      gateway: {
        bind: '0.0.0.0',
        auth: { mode: 'token', token: 'changeme' },
      },
    }), { mode: 0o644 });

    // Point env to our temp config
    const originalEnv = process.env.OPENCLAW_CONFIG_PATH;
    process.env.OPENCLAW_CONFIG_PATH = configPath;

    const result = audit({ openClawHome: tempDir });

    // Restore env
    if (originalEnv) {
      process.env.OPENCLAW_CONFIG_PATH = originalEnv;
    } else {
      delete process.env.OPENCLAW_CONFIG_PATH;
    }

    const gatewayCheck = result.checks.find(c => c.name === 'Gateway Binding');
    expect(gatewayCheck?.result).toBe('fail');

    const tokenCheck = result.checks.find(c => c.name === 'Token Strength');
    expect(tokenCheck?.result).toBe('fail');
  });
});

// ─── Init → Status Integration ───────────────────────────────────

describe('Integration: init → status flow', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'clawforge-integration-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('full lifecycle: init creates agent, status reads it back', async () => {
    const dbPath = join(tempDir, 'test.db');

    // Status before init
    const before = status({ cwd: tempDir, dbPath });
    expect(before.found).toBe(false);

    // Init
    const initResult = await init({ cwd: tempDir, dbPath });
    expect(initResult.agent.agentId).toBeDefined();
    expect(initResult.sessionId).toBeDefined();

    // Status after init
    const after = status({ cwd: tempDir, dbPath });
    expect(after.found).toBe(true);
    expect(after.agentId).toBe(initResult.agent.agentId);
    expect(after.activeSessions).toBeGreaterThanOrEqual(1);
  });
});
