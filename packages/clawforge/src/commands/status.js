"use strict";
/**
 * clawforge status — Agent Status from Session Graph
 *
 * Reads .clawstack/config.json to find the local agent,
 * then queries the Agent Session Graph for live state.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.status = status;
const fs_1 = require("fs");
const path_1 = require("path");
const shared_1 = require("@clawstack/shared");
function status(opts) {
    const cwd = opts?.cwd || process.cwd();
    const configPath = (0, path_1.join)(cwd, '.clawstack', 'config.json');
    const notFound = {
        found: false, agentId: null, agentName: null, platform: null,
        version: null, dockerSandboxed: null, activeSessions: 0, totalCost: null,
    };
    if (!(0, fs_1.existsSync)(configPath)) {
        return { ...notFound, report: 'No ClawStack configuration found. Run `clawforge init` first.' };
    }
    let localConfig;
    try {
        localConfig = JSON.parse((0, fs_1.readFileSync)(configPath, 'utf-8'));
    }
    catch {
        return { ...notFound, report: 'Failed to read .clawstack/config.json — file may be corrupted.' };
    }
    const dbPath = opts?.dbPath || localConfig.dbPath;
    if (!(0, fs_1.existsSync)(dbPath)) {
        return {
            ...notFound,
            agentId: localConfig.agentId,
            report: `Session graph not found at ${dbPath}. Run \`clawforge init\` to reinitialize.`,
        };
    }
    const graph = new shared_1.SessionGraph(dbPath);
    const agent = graph.getAgent(localConfig.agentId);
    if (!agent) {
        graph.close();
        return {
            ...notFound,
            agentId: localConfig.agentId,
            report: `Agent ${localConfig.agentId} not found in session graph.`,
        };
    }
    const activeSessions = graph.getActiveSessions(agent.agentId);
    const cost = graph.getSessionCost(localConfig.sessionId);
    graph.close();
    const report = [
        '',
        '=== ClawForge Agent Status ===',
        '',
        `  Agent ID:    ${agent.agentId}`,
        `  Name:        ${agent.name}`,
        `  Platform:    ${agent.platform}`,
        `  Version:     ${agent.version}`,
        `  Sandboxed:   ${agent.dockerSandboxed ? 'Yes' : 'No'}`,
        `  Registered:  ${agent.createdAt}`,
        '',
        `  Active Sessions: ${activeSessions.length}`,
        `  Session Cost:    $${cost.costUsd.toFixed(4)} (${cost.tokens} tokens, ${cost.calls} calls)`,
        '',
    ].join('\n');
    return {
        found: true,
        agentId: agent.agentId,
        agentName: agent.name,
        platform: agent.platform,
        version: agent.version,
        dockerSandboxed: agent.dockerSandboxed,
        activeSessions: activeSessions.length,
        totalCost: cost,
        report,
    };
}
//# sourceMappingURL=status.js.map