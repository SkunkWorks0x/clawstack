/**
 * ClawGuard Live Monitor — Real Blade Session Watcher
 *
 * Tails Blade's actual OpenClaw session files and prints every
 * intercepted event in styled ClawGuard format.
 *
 * Run: npx tsx scripts/live-monitor.ts
 *      npx tsx scripts/live-monitor.ts /path/to/sessions  (custom dir)
 *
 * Ctrl+C to stop.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SessionGraph, EventBus } from '@clawstack/shared';
import {
  OpenClawTailer,
  DEFAULT_SESSIONS_DIR,
  VERSION,
  OPENCLAW_SANDBOXED_POLICY,
} from '@clawstack/clawguard';
import type { TailerEvent } from '@clawstack/clawguard';

// ─── ANSI Colors ───────────────────────────────────────────────────

const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  bgRed:   '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

// ─── Helpers ───────────────────────────────────────────────────────

function ts(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${c.cyan}${h}:${m}:${s}${c.reset}`;
}

function line(char = '─', len = 62): string {
  return char.repeat(len);
}

/** Map action types to short display labels */
function actionLabel(action: TailerEvent['action']): string {
  switch (action) {
    case 'file_access':     return 'file       ';
    case 'network_request': return 'network.req';
    case 'process_spawn':   return 'process    ';
    case 'cost_event':      return 'cost       ';
    case 'tool_call':       return 'tool.call  ';
  }
}

/** Pick badge style based on whether the event was allowed + threat level */
function badge(event: TailerEvent): string {
  if (!event.allowed) {
    return `${c.bgRed}${c.bold} BLOCK ${c.reset}`;
  }
  if (event.threatLevel !== 'none') {
    return `${c.bgYellow}${c.bold} WARN  ${c.reset}`;
  }
  return `${c.bgGreen}${c.bold} ALLOW ${c.reset}`;
}

// ─── Main ──────────────────────────────────────────────────────────

function main() {
  const sessionsDir = process.argv[2] || DEFAULT_SESSIONS_DIR;

  // Persist to the project's SessionGraph DB so dashboard can read it
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dbPath = join(projectRoot, '.clawstack', 'session-graph.db');
  const graph = new SessionGraph(dbPath);
  const bus = new EventBus();

  // Reuse existing Blade agent or register a new one
  const existing = graph.listAgents().find(a => a.name === 'Blade');
  const agent = existing || graph.registerAgent({
    name: 'Blade',
    platform: 'openclaw',
    version: '2.1.0',
    dockerSandboxed: true,
    metadata: { role: 'code-assistant', owner: 'imani' },
  });
  const session = graph.startSession(agent.agentId);

  // ─── Stats ─────────────────────────────────────────────────────

  let eventsMonitored = 0;
  let threatsBlocked = 0;

  // ─── Header ────────────────────────────────────────────────────

  console.log();
  console.log(`${c.dim}${line()}${c.reset}`);
  console.log(`${c.bold}${c.white}  ⛨  ClawGuard Live Monitor v${VERSION}${c.reset}`);
  console.log(`${c.dim}${line()}${c.reset}`);
  console.log(`${c.dim}  Agent:    ${c.reset}${c.bold}${agent.name}${c.reset} ${c.dim}(${agent.agentId.slice(0, 8)})${c.reset}`);
  console.log(`${c.dim}  Session:  ${c.reset}${c.green}active${c.reset} ${c.dim}(${session.sessionId.slice(0, 8)})${c.reset}`);
  console.log(`${c.dim}  Watching: ${c.reset}${sessionsDir}`);
  console.log(`${c.dim}  Policy:   ${c.reset}openclaw-sandboxed v1.0.0 ${c.dim}│${c.reset} AutoKill: ${c.green}enabled${c.reset}`);
  console.log(`${c.dim}${line()}${c.reset}`);
  console.log(`${c.dim}  Tailing Blade activity… press Ctrl+C to stop.${c.reset}`);
  console.log();

  // ─── Event handler ─────────────────────────────────────────────

  function onEvent(event: TailerEvent) {
    eventsMonitored++;

    const tag = badge(event);
    const label = actionLabel(event.action);
    const tool = `${c.dim}${event.toolName}${c.reset}`;

    console.log(`  [${ts()}]  ${tag}  ${label}  ${tool}`);

    // Print threat details for blocked/warned events
    if (!event.allowed || event.threatLevel !== 'none') {
      if (!event.allowed) threatsBlocked++;
      console.log();
      console.log(`  ${c.red}${c.bold}⚠  THREAT DETECTED${c.reset}`);
      console.log(`  ${c.dim}${line('─', 58)}${c.reset}`);
      console.log(`  ${c.dim}│${c.reset}  Level:      ${c.red}${c.bold}${event.threatLevel.toUpperCase()}${c.reset}`);
      if (event.threatSignature) {
        console.log(`  ${c.dim}│${c.reset}  Signature:  ${c.yellow}${event.threatSignature}${c.reset}`);
      }
      console.log(`  ${c.dim}│${c.reset}  Action:     ${event.action} via ${event.toolName}`);
      if (!event.allowed) {
        console.log(`  ${c.dim}│${c.reset}  ${c.red}${c.bold}► Blocked${c.reset} — event prevented by policy`);
      }
      console.log(`  ${c.dim}${line('─', 58)}${c.reset}`);
      console.log();
    }
  }

  // ─── Start tailer ──────────────────────────────────────────────

  const tailer = new OpenClawTailer(graph, bus, {
    sessionsDir,
    agentId: agent.agentId,
    sessionId: session.sessionId,
    monitorConfig: {
      autoKill: true,
      policy: OPENCLAW_SANDBOXED_POLICY,
    },
    onEvent,
    onError: (err) => {
      console.error(`  ${c.red}[error]${c.reset} ${err.message}`);
    },
  });

  tailer.start();

  // ─── Graceful shutdown on Ctrl+C ──────────────────────────────

  function shutdown() {
    console.log();
    console.log(`${c.dim}${line()}${c.reset}`);
    console.log(`  ${c.bold}${c.white}Session Summary${c.reset}`);
    console.log(`  ${c.dim}${line('─', 58)}${c.reset}`);
    console.log(`  ${c.dim}├─${c.reset} Events monitored:  ${c.bold}${eventsMonitored}${c.reset}`);
    console.log(`  ${c.dim}├─${c.reset} Threats blocked:   ${c.red}${c.bold}${threatsBlocked}${c.reset}`);
    console.log(`  ${c.dim}└─${c.reset} Processed entries: ${c.bold}${tailer.getProcessedCount()}${c.reset}`);
    console.log(`  ${c.dim}${line('─', 58)}${c.reset}`);
    console.log();
    console.log(`  ${c.dim}ClawGuard — Process-level security. Can't prompt-inject a firewall.${c.reset}`);
    console.log();

    tailer.stop();
    graph.close();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
