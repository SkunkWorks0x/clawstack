"use strict";
/**
 * ClawForge Tests
 *
 * Tests the three CLI commands (init, audit, status) and
 * all individual security check functions.
 *
 * Uses temp directories — no real OpenClaw/Docker required.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const path_1 = require("path");
const fs_1 = require("fs");
const os_1 = require("os");
const index_js_1 = require("../../packages/shared/session-graph/index.js");
const index_js_2 = require("../../packages/shared/event-bus/index.js");
const utils_js_1 = require("../../packages/clawforge/src/utils.js");
const init_js_1 = require("../../packages/clawforge/src/commands/init.js");
const status_js_1 = require("../../packages/clawforge/src/commands/status.js");
const audit_js_1 = require("../../packages/clawforge/src/commands/audit.js");
// ─── Security Check Functions ────────────────────────────────────
(0, vitest_1.describe)('Security Checks', () => {
    (0, vitest_1.describe)('checkGatewayBinding', () => {
        (0, vitest_1.it)('passes when bound to loopback', () => {
            const config = { gateway: { bind: 'loopback' } };
            (0, vitest_1.expect)((0, utils_js_1.checkGatewayBinding)(config).result).toBe('pass');
        });
        (0, vitest_1.it)('passes when mode is local', () => {
            const config = { gateway: { mode: 'local' } };
            (0, vitest_1.expect)((0, utils_js_1.checkGatewayBinding)(config).result).toBe('pass');
        });
        (0, vitest_1.it)('passes for 127.0.0.1', () => {
            const config = { gateway: { bind: '127.0.0.1' } };
            (0, vitest_1.expect)((0, utils_js_1.checkGatewayBinding)(config).result).toBe('pass');
        });
        (0, vitest_1.it)('fails when bound to 0.0.0.0', () => {
            const config = { gateway: { bind: '0.0.0.0' } };
            const check = (0, utils_js_1.checkGatewayBinding)(config);
            (0, vitest_1.expect)(check.result).toBe('fail');
            (0, vitest_1.expect)(check.detail).toContain('CVE-2026-25253');
        });
        (0, vitest_1.it)('fails when bound to lan', () => {
            const config = { gateway: { bind: 'lan' } };
            (0, vitest_1.expect)((0, utils_js_1.checkGatewayBinding)(config).result).toBe('fail');
        });
        (0, vitest_1.it)('warns when no config provided', () => {
            (0, vitest_1.expect)((0, utils_js_1.checkGatewayBinding)(null).result).toBe('warn');
        });
        (0, vitest_1.it)('warns when no bind specified', () => {
            const config = { gateway: {} };
            (0, vitest_1.expect)((0, utils_js_1.checkGatewayBinding)(config).result).toBe('warn');
        });
    });
    (0, vitest_1.describe)('checkTokenStrength', () => {
        (0, vitest_1.it)('passes for strong token', () => {
            const config = {
                gateway: { auth: { mode: 'token', token: 'a'.repeat(64) } },
            };
            (0, vitest_1.expect)((0, utils_js_1.checkTokenStrength)(config).result).toBe('pass');
        });
        (0, vitest_1.it)('fails for short token', () => {
            const config = {
                gateway: { auth: { mode: 'token', token: 'short' } },
            };
            const check = (0, utils_js_1.checkTokenStrength)(config);
            (0, vitest_1.expect)(check.result).toBe('fail');
            (0, vitest_1.expect)(check.detail).toContain('too short');
        });
        (0, vitest_1.it)('fails for placeholder token', () => {
            const config = {
                gateway: { auth: { mode: 'token', token: 'changeme' } },
            };
            (0, vitest_1.expect)((0, utils_js_1.checkTokenStrength)(config).result).toBe('fail');
        });
        (0, vitest_1.it)('fails for default docs token', () => {
            const config = {
                gateway: { auth: { mode: 'token', token: 'replace-with-long-random-token' } },
            };
            (0, vitest_1.expect)((0, utils_js_1.checkTokenStrength)(config).result).toBe('fail');
        });
        (0, vitest_1.it)('fails when token auth enabled but no token set', () => {
            const config = {
                gateway: { auth: { mode: 'token' } },
            };
            (0, vitest_1.expect)((0, utils_js_1.checkTokenStrength)(config).result).toBe('fail');
        });
        (0, vitest_1.it)('warns for non-token auth mode', () => {
            const config = {
                gateway: { auth: { mode: 'password' } },
            };
            (0, vitest_1.expect)((0, utils_js_1.checkTokenStrength)(config).result).toBe('warn');
        });
        (0, vitest_1.it)('warns when no config', () => {
            (0, vitest_1.expect)((0, utils_js_1.checkTokenStrength)(null).result).toBe('warn');
        });
    });
    (0, vitest_1.describe)('checkDockerSandbox', () => {
        (0, vitest_1.it)('passes when mode is all and docker running', () => {
            const config = {
                agents: { defaults: { sandbox: { mode: 'all' } } },
            };
            (0, vitest_1.expect)((0, utils_js_1.checkDockerSandbox)(config, true).result).toBe('pass');
        });
        (0, vitest_1.it)('passes when mode is non-main', () => {
            const config = {
                agents: { defaults: { sandbox: { mode: 'non-main' } } },
            };
            (0, vitest_1.expect)((0, utils_js_1.checkDockerSandbox)(config, true).result).toBe('pass');
        });
        (0, vitest_1.it)('fails when docker not running', () => {
            const config = {
                agents: { defaults: { sandbox: { mode: 'all' } } },
            };
            (0, vitest_1.expect)((0, utils_js_1.checkDockerSandbox)(config, false).result).toBe('fail');
        });
        (0, vitest_1.it)('warns when no sandbox config', () => {
            (0, vitest_1.expect)((0, utils_js_1.checkDockerSandbox)({}, true).result).toBe('warn');
        });
    });
    (0, vitest_1.describe)('checkOpenClawVersion', () => {
        (0, vitest_1.it)('fails for version before 2026.1.29', () => {
            const check = (0, utils_js_1.checkOpenClawVersion)('2026.1.24');
            (0, vitest_1.expect)(check.result).toBe('fail');
            (0, vitest_1.expect)(check.detail).toContain('CVE-2026-25253');
        });
        (0, vitest_1.it)('fails for version 2025.x.x', () => {
            (0, vitest_1.expect)((0, utils_js_1.checkOpenClawVersion)('2025.12.1').result).toBe('fail');
        });
        (0, vitest_1.it)('passes for version 2026.1.29', () => {
            (0, vitest_1.expect)((0, utils_js_1.checkOpenClawVersion)('2026.1.29').result).toBe('pass');
        });
        (0, vitest_1.it)('passes for version after 2026.1.29', () => {
            (0, vitest_1.expect)((0, utils_js_1.checkOpenClawVersion)('2026.2.6').result).toBe('pass');
        });
        (0, vitest_1.it)('warns when version is null', () => {
            (0, vitest_1.expect)((0, utils_js_1.checkOpenClawVersion)(null).result).toBe('warn');
        });
    });
    (0, vitest_1.describe)('checkConfigPermissions', () => {
        let tempDir;
        (0, vitest_1.beforeEach)(() => {
            tempDir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'clawforge-perm-'));
        });
        (0, vitest_1.afterEach)(() => {
            (0, fs_1.rmSync)(tempDir, { recursive: true, force: true });
        });
        (0, vitest_1.it)('passes for mode 600', () => {
            const f = (0, path_1.join)(tempDir, 'secure.json');
            (0, fs_1.writeFileSync)(f, '{}', { mode: 0o600 });
            (0, vitest_1.expect)((0, utils_js_1.checkConfigPermissions)(f).result).toBe('pass');
        });
        (0, vitest_1.it)('fails for world-readable file', () => {
            const f = (0, path_1.join)(tempDir, 'insecure.json');
            (0, fs_1.writeFileSync)(f, '{}', { mode: 0o644 });
            (0, vitest_1.expect)((0, utils_js_1.checkConfigPermissions)(f).result).toBe('fail');
        });
        (0, vitest_1.it)('warns for nonexistent file', () => {
            (0, vitest_1.expect)((0, utils_js_1.checkConfigPermissions)((0, path_1.join)(tempDir, 'nope.json')).result).toBe('warn');
        });
    });
});
// ─── Report Formatting ──────────────────────────────────────────
(0, vitest_1.describe)('Report Formatting', () => {
    (0, vitest_1.it)('formats a security check line', () => {
        const check = { name: 'Test', result: 'pass', detail: 'OK' };
        (0, vitest_1.expect)((0, utils_js_1.formatSecurityCheck)(check)).toContain('[PASS]');
        (0, vitest_1.expect)((0, utils_js_1.formatSecurityCheck)(check)).toContain('Test');
    });
    (0, vitest_1.it)('formats a full report card', () => {
        const checks = [
            { name: 'A', result: 'pass', detail: 'Good' },
            { name: 'B', result: 'warn', detail: 'Meh' },
            { name: 'C', result: 'fail', detail: 'Bad' },
        ];
        const report = (0, utils_js_1.formatReportCard)(checks);
        (0, vitest_1.expect)(report).toContain('ClawForge Security Report');
        (0, vitest_1.expect)(report).toContain('1 passed');
        (0, vitest_1.expect)(report).toContain('1 warnings');
        (0, vitest_1.expect)(report).toContain('1 failures');
        (0, vitest_1.expect)(report).toContain('Action Required');
    });
    (0, vitest_1.it)('shows all-clear for all passes', () => {
        const checks = [
            { name: 'A', result: 'pass', detail: 'Good' },
        ];
        (0, vitest_1.expect)((0, utils_js_1.formatReportCard)(checks)).toContain('All checks passed');
    });
});
// ─── Init Command ────────────────────────────────────────────────
(0, vitest_1.describe)('clawforge init', () => {
    let tempDir;
    (0, vitest_1.beforeEach)(() => {
        tempDir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'clawforge-init-'));
    });
    (0, vitest_1.afterEach)(() => {
        (0, fs_1.rmSync)(tempDir, { recursive: true, force: true });
    });
    (0, vitest_1.it)('creates .clawstack directory and config', async () => {
        const dbPath = (0, path_1.join)(tempDir, 'test.db');
        const result = await (0, init_js_1.init)({ cwd: tempDir, dbPath });
        (0, vitest_1.expect)((0, fs_1.existsSync)((0, path_1.join)(tempDir, '.clawstack'))).toBe(true);
        (0, vitest_1.expect)((0, fs_1.existsSync)((0, path_1.join)(tempDir, '.clawstack', 'config.json'))).toBe(true);
        const config = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(tempDir, '.clawstack', 'config.json'), 'utf-8'));
        (0, vitest_1.expect)(config.agentId).toBe(result.agent.agentId);
        (0, vitest_1.expect)(config.sessionId).toBe(result.sessionId);
    });
    (0, vitest_1.it)('registers agent in Session Graph', async () => {
        const dbPath = (0, path_1.join)(tempDir, 'test.db');
        const result = await (0, init_js_1.init)({ cwd: tempDir, dbPath });
        // Verify agent exists in the graph
        const graph = new index_js_1.SessionGraph(dbPath);
        const agent = graph.getAgent(result.agent.agentId);
        (0, vitest_1.expect)(agent).not.toBeNull();
        (0, vitest_1.expect)(agent.platform).toBe('openclaw');
        (0, vitest_1.expect)(agent.metadata).toHaveProperty('clawstackToken');
        // Verify session is active
        const sessions = graph.getActiveSessions(result.agent.agentId);
        (0, vitest_1.expect)(sessions.length).toBeGreaterThanOrEqual(1);
        graph.close();
    });
    (0, vitest_1.it)('emits session.started event', async () => {
        const bus = new index_js_2.EventBus();
        // Monkey-patch getEventBus to return our test bus
        // Since init() uses the global singleton, we listen on it
        const { getEventBus } = await import('../../packages/shared/event-bus/index.js');
        const globalBus = getEventBus();
        const events = [];
        const unsub = globalBus.on('session.started', (e) => { events.push(e); });
        const dbPath = (0, path_1.join)(tempDir, 'test.db');
        await (0, init_js_1.init)({ cwd: tempDir, dbPath });
        (0, vitest_1.expect)(events.length).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(events[0].sourceProduct).toBe('clawforge');
        (0, vitest_1.expect)(events[0].payload.action).toBe('init');
        unsub();
        bus.clear();
    });
    (0, vitest_1.it)('produces a security report', async () => {
        const dbPath = (0, path_1.join)(tempDir, 'test.db');
        const result = await (0, init_js_1.init)({ cwd: tempDir, dbPath });
        (0, vitest_1.expect)(result.report).toContain('ClawForge Security Report');
        (0, vitest_1.expect)(result.checks.length).toBeGreaterThan(0);
        // OS check should always pass
        (0, vitest_1.expect)(result.checks[0].name).toBe('Operating System');
        (0, vitest_1.expect)(result.checks[0].result).toBe('pass');
    });
});
// ─── Status Command ──────────────────────────────────────────────
(0, vitest_1.describe)('clawforge status', () => {
    let tempDir;
    (0, vitest_1.beforeEach)(() => {
        tempDir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'clawforge-status-'));
    });
    (0, vitest_1.afterEach)(() => {
        (0, fs_1.rmSync)(tempDir, { recursive: true, force: true });
    });
    (0, vitest_1.it)('reports not found when no .clawstack exists', () => {
        const result = (0, status_js_1.status)({ cwd: tempDir });
        (0, vitest_1.expect)(result.found).toBe(false);
        (0, vitest_1.expect)(result.report).toContain('clawforge init');
    });
    (0, vitest_1.it)('shows agent status after init', async () => {
        const dbPath = (0, path_1.join)(tempDir, 'test.db');
        const initResult = await (0, init_js_1.init)({ cwd: tempDir, dbPath });
        const statusResult = (0, status_js_1.status)({ cwd: tempDir, dbPath });
        (0, vitest_1.expect)(statusResult.found).toBe(true);
        (0, vitest_1.expect)(statusResult.agentId).toBe(initResult.agent.agentId);
        (0, vitest_1.expect)(statusResult.agentName).toContain('openclaw-');
        (0, vitest_1.expect)(statusResult.platform).toBe('openclaw');
        (0, vitest_1.expect)(statusResult.activeSessions).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(statusResult.report).toContain('ClawForge Agent Status');
    });
    (0, vitest_1.it)('reports correct cost data', async () => {
        const dbPath = (0, path_1.join)(tempDir, 'test.db');
        const initResult = await (0, init_js_1.init)({ cwd: tempDir, dbPath });
        // Record some cost against the session
        const graph = new index_js_1.SessionGraph(dbPath);
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
        const statusResult = (0, status_js_1.status)({ cwd: tempDir, dbPath });
        (0, vitest_1.expect)(statusResult.totalCost).not.toBeNull();
        (0, vitest_1.expect)(statusResult.totalCost.tokens).toBe(1500);
        (0, vitest_1.expect)(statusResult.totalCost.costUsd).toBeCloseTo(0.012, 3);
        (0, vitest_1.expect)(statusResult.totalCost.calls).toBe(1);
    });
});
// ─── Audit Command ───────────────────────────────────────────────
(0, vitest_1.describe)('clawforge audit', () => {
    let tempDir;
    (0, vitest_1.beforeEach)(() => {
        tempDir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'clawforge-audit-'));
    });
    (0, vitest_1.afterEach)(() => {
        (0, fs_1.rmSync)(tempDir, { recursive: true, force: true });
    });
    (0, vitest_1.it)('runs all checks and produces a report', () => {
        const result = (0, audit_js_1.audit)({ openClawHome: tempDir });
        (0, vitest_1.expect)(result.checks.length).toBeGreaterThanOrEqual(5);
        (0, vitest_1.expect)(result.report).toContain('ClawForge Security Report');
    });
    (0, vitest_1.it)('detects insecure config when present', () => {
        // Write an insecure openclaw.json
        const configPath = (0, path_1.join)(tempDir, 'openclaw.json');
        (0, fs_1.writeFileSync)(configPath, JSON.stringify({
            gateway: {
                bind: '0.0.0.0',
                auth: { mode: 'token', token: 'changeme' },
            },
        }), { mode: 0o644 });
        // Point env to our temp config
        const originalEnv = process.env.OPENCLAW_CONFIG_PATH;
        process.env.OPENCLAW_CONFIG_PATH = configPath;
        const result = (0, audit_js_1.audit)({ openClawHome: tempDir });
        // Restore env
        if (originalEnv) {
            process.env.OPENCLAW_CONFIG_PATH = originalEnv;
        }
        else {
            delete process.env.OPENCLAW_CONFIG_PATH;
        }
        const gatewayCheck = result.checks.find(c => c.name === 'Gateway Binding');
        (0, vitest_1.expect)(gatewayCheck?.result).toBe('fail');
        const tokenCheck = result.checks.find(c => c.name === 'Token Strength');
        (0, vitest_1.expect)(tokenCheck?.result).toBe('fail');
    });
});
// ─── Init → Status Integration ───────────────────────────────────
(0, vitest_1.describe)('Integration: init → status flow', () => {
    let tempDir;
    (0, vitest_1.beforeEach)(() => {
        tempDir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'clawforge-integration-'));
    });
    (0, vitest_1.afterEach)(() => {
        (0, fs_1.rmSync)(tempDir, { recursive: true, force: true });
    });
    (0, vitest_1.it)('full lifecycle: init creates agent, status reads it back', async () => {
        const dbPath = (0, path_1.join)(tempDir, 'test.db');
        // Status before init
        const before = (0, status_js_1.status)({ cwd: tempDir, dbPath });
        (0, vitest_1.expect)(before.found).toBe(false);
        // Init
        const initResult = await (0, init_js_1.init)({ cwd: tempDir, dbPath });
        (0, vitest_1.expect)(initResult.agent.agentId).toBeDefined();
        (0, vitest_1.expect)(initResult.sessionId).toBeDefined();
        // Status after init
        const after = (0, status_js_1.status)({ cwd: tempDir, dbPath });
        (0, vitest_1.expect)(after.found).toBe(true);
        (0, vitest_1.expect)(after.agentId).toBe(initResult.agent.agentId);
        (0, vitest_1.expect)(after.activeSessions).toBeGreaterThanOrEqual(1);
    });
});
//# sourceMappingURL=clawforge.test.js.map