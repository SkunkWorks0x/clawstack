/**
 * clawforge status — Agent Status from Session Graph
 *
 * Reads .clawstack/config.json to find the local agent,
 * then queries the Agent Session Graph for live state.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { SessionGraph } from '@clawstack/shared';

export interface StatusResult {
  found: boolean;
  agentId: string | null;
  agentName: string | null;
  platform: string | null;
  version: string | null;
  dockerSandboxed: boolean | null;
  activeSessions: number;
  totalCost: { tokens: number; costUsd: number; calls: number } | null;
  report: string;
}

export interface StatusOptions {
  cwd?: string;
  dbPath?: string;
}

export function status(opts?: StatusOptions): StatusResult {
  const cwd = opts?.cwd || process.cwd();
  const configPath = join(cwd, '.clawstack', 'config.json');

  const notFound: Omit<StatusResult, 'report'> = {
    found: false, agentId: null, agentName: null, platform: null,
    version: null, dockerSandboxed: null, activeSessions: 0, totalCost: null,
  };

  if (!existsSync(configPath)) {
    return { ...notFound, report: 'No ClawStack configuration found. Run `clawforge init` first.' };
  }

  let localConfig: { agentId: string; sessionId: string; dbPath: string };
  try {
    localConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return { ...notFound, report: 'Failed to read .clawstack/config.json — file may be corrupted.' };
  }

  const dbPath = opts?.dbPath || localConfig.dbPath;

  if (!existsSync(dbPath)) {
    return {
      ...notFound,
      agentId: localConfig.agentId,
      report: `Session graph not found at ${dbPath}. Run \`clawforge init\` to reinitialize.`,
    };
  }

  const graph = new SessionGraph(dbPath);
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
