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

import { randomBytes } from 'crypto';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SessionGraph, getEventBus, createEvent } from '@clawstack/shared';
import type { AgentIdentity } from '@clawstack/shared';
import {
  getSystemInfo,
  checkOpenClaw,
  checkDocker,
  checkGatewayBinding,
  checkTokenStrength,
  checkDockerSandbox,
  checkConfigPermissions,
  checkExposedPorts,
  checkOpenClawVersion,
  formatReportCard,
  type SecurityCheck,
} from '../utils.js';

export interface InitResult {
  agent: AgentIdentity;
  sessionId: string;
  clawstackDir: string;
  checks: SecurityCheck[];
  report: string;
}

export interface InitOptions {
  dbPath?: string;
  cwd?: string;
}

export async function init(opts?: InitOptions): Promise<InitResult> {
  const cwd = opts?.cwd || process.cwd();
  const system = getSystemInfo();
  const openClaw = checkOpenClaw(system.openClawHome);
  const docker = checkDocker();

  // ── Security checks ─────────────────────────────────────────
  const checks: SecurityCheck[] = [
    { name: 'Operating System', result: 'pass', detail: `${system.os} ${system.arch}` },

    openClaw.installed
      ? { name: 'OpenClaw Installed', result: 'pass', detail: `Version ${openClaw.version}` }
      : { name: 'OpenClaw Installed', result: 'fail', detail: 'Not found. Install: curl -fsSL https://openclaw.ai/install.sh | bash' },

    checkOpenClawVersion(openClaw.version),

    docker.installed
      ? docker.running
        ? { name: 'Docker', result: 'pass' as const, detail: 'Installed and running' }
        : { name: 'Docker', result: 'warn' as const, detail: 'Installed but not running — sandbox unavailable' }
      : { name: 'Docker', result: 'fail' as const, detail: 'Not installed — required for agent sandboxing' },

    checkGatewayBinding(openClaw.config),

    checkTokenStrength(openClaw.config),

    checkDockerSandbox(openClaw.config, docker.running),

    ...(openClaw.configExists ? [checkConfigPermissions(openClaw.configPath)] : []),

    checkExposedPorts(),
  ];

  // ── Create .clawstack/ directory ────────────────────────────
  const clawstackDir = join(cwd, '.clawstack');
  if (!existsSync(clawstackDir)) {
    mkdirSync(clawstackDir, { recursive: true, mode: 0o700 });
  }

  // ── Generate secure token ──────────────────────────────────
  const clawstackToken = randomBytes(32).toString('hex');

  // ── Register agent in Session Graph ────────────────────────
  const dbPath = opts?.dbPath || join(clawstackDir, 'session-graph.db');
  const graph = new SessionGraph(dbPath);

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
  const bus = getEventBus();
  await bus.emit(createEvent(
    'session.started',
    'clawforge',
    {
      action: 'init',
      agentId: agent.agentId,
      os: system.os,
      openClawVersion: openClaw.version,
      dockerSandboxed: docker.running,
    },
    { sessionId: session.sessionId, agentId: agent.agentId },
  ));

  // ── Write local config ─────────────────────────────────────
  const localConfig = {
    agentId: agent.agentId,
    sessionId: session.sessionId,
    createdAt: new Date().toISOString(),
    openClawHome: system.openClawHome,
    dbPath,
  };

  writeFileSync(
    join(clawstackDir, 'config.json'),
    JSON.stringify(localConfig, null, 2),
    { mode: 0o600 },
  );

  const report = formatReportCard(checks);
  graph.close();

  return { agent, sessionId: session.sessionId, clawstackDir, checks, report };
}
