"use strict";
/**
 * clawforge init — Secure OpenClaw Setup
 *
 * 1. Detects OS + arch
 * 2. Checks OpenClaw installation + version (CVE check)
 * 3. Verifies Docker is running
 * 4. Checks gateway binding (must be loopback, not 0.0.0.0)
 * 5. Generates secure tokens
 * 6. Creates .clawstack/ directory
 * 7. Registers agent in the Agent Session Graph
 * 8. Emits session.started to Event Bus
 * 9. Outputs security report card
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = init;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const shared_1 = require("@clawstack/shared");
const utils_js_1 = require("../utils.js");
async function init(opts) {
    const cwd = opts?.cwd || process.cwd();
    const system = (0, utils_js_1.getSystemInfo)();
    const openClaw = (0, utils_js_1.checkOpenClaw)(system.openClawHome);
    const docker = (0, utils_js_1.checkDocker)();
    // ── Security checks ─────────────────────────────────────────
    const checks = [
        { name: 'Operating System', result: 'pass', detail: `${system.os} ${system.arch}` },
        openClaw.installed
            ? { name: 'OpenClaw Installed', result: 'pass', detail: `Version ${openClaw.version}` }
            : { name: 'OpenClaw Installed', result: 'fail', detail: 'Not found. Install: curl -fsSL https://openclaw.ai/install.sh | bash' },
        (0, utils_js_1.checkOpenClawVersion)(openClaw.version),
        docker.installed
            ? docker.running
                ? { name: 'Docker', result: 'pass', detail: 'Installed and running' }
                : { name: 'Docker', result: 'warn', detail: 'Installed but not running — sandbox unavailable' }
            : { name: 'Docker', result: 'fail', detail: 'Not installed — required for agent sandboxing' },
        (0, utils_js_1.checkGatewayBinding)(openClaw.config),
        (0, utils_js_1.checkTokenStrength)(openClaw.config),
        (0, utils_js_1.checkDockerSandbox)(openClaw.config, docker.running),
        ...(openClaw.configExists ? [(0, utils_js_1.checkConfigPermissions)(openClaw.configPath)] : []),
        (0, utils_js_1.checkExposedPorts)(),
    ];
    // ── Create .clawstack/ directory ────────────────────────────
    const clawstackDir = (0, path_1.join)(cwd, '.clawstack');
    if (!(0, fs_1.existsSync)(clawstackDir)) {
        (0, fs_1.mkdirSync)(clawstackDir, { recursive: true, mode: 0o700 });
    }
    // ── Generate secure token ──────────────────────────────────
    const clawstackToken = (0, crypto_1.randomBytes)(32).toString('hex');
    // ── Register agent in Session Graph ────────────────────────
    const dbPath = opts?.dbPath || (0, path_1.join)(clawstackDir, 'session-graph.db');
    const graph = new shared_1.SessionGraph(dbPath);
    const agent = graph.registerAgent({
        name: `openclaw-${system.os}-${Date.now()}`,
        platform: 'openclaw',
        version: openClaw.version || 'unknown',
        dockerSandboxed: docker.running,
        metadata: {
            os: system.os,
            arch: system.arch,
            openClawHome: system.openClawHome,
            openClawVersion: openClaw.version,
            configPath: openClaw.configPath,
            clawstackToken,
        },
    });
    // ── Start session ──────────────────────────────────────────
    const session = graph.startSession(agent.agentId);
    // ── Emit session.started event ─────────────────────────────
    const bus = (0, shared_1.getEventBus)();
    await bus.emit((0, shared_1.createEvent)('session.started', 'clawforge', {
        action: 'init',
        agentId: agent.agentId,
        os: system.os,
        openClawVersion: openClaw.version,
        dockerSandboxed: docker.running,
    }, { sessionId: session.sessionId, agentId: agent.agentId }));
    // ── Write local config ─────────────────────────────────────
    const localConfig = {
        agentId: agent.agentId,
        sessionId: session.sessionId,
        createdAt: new Date().toISOString(),
        openClawHome: system.openClawHome,
        dbPath,
    };
    (0, fs_1.writeFileSync)((0, path_1.join)(clawstackDir, 'config.json'), JSON.stringify(localConfig, null, 2), { mode: 0o600 });
    const report = (0, utils_js_1.formatReportCard)(checks);
    graph.close();
    return { agent, sessionId: session.sessionId, clawstackDir, checks, report };
}
//# sourceMappingURL=init.js.map