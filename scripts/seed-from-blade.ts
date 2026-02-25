/**
 * Seed-from-Blade — SessionGraph Database Inspector
 *
 * Reads the persistent SessionGraph database (the same one the live
 * monitor writes to) and prints a summary of all stored data.
 *
 * Run: npx tsx scripts/seed-from-blade.ts
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import Database from 'better-sqlite3';

// ─── Resolve DB path ────────────────────────────────────────────────

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.argv[2] || join(projectRoot, '.clawstack', 'session-graph.db');

if (!existsSync(dbPath)) {
  console.error(`\n  Database not found: ${dbPath}`);
  console.error('  Run "npx tsx scripts/live-monitor.ts" first to generate data.\n');
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });

// ─── ANSI helpers ───────────────────────────────────────────────────

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
};

function line(char = '─', len = 62): string {
  return char.repeat(len);
}

function section(title: string): void {
  console.log();
  console.log(`  ${c.bold}${c.white}${title}${c.reset}`);
  console.log(`  ${c.dim}${line('─', 58)}${c.reset}`);
}

// ─── Agents ─────────────────────────────────────────────────────────

section('Registered Agents');

const agents = db.prepare('SELECT * FROM agents ORDER BY created_at').all() as any[];

if (agents.length === 0) {
  console.log(`  ${c.dim}(none)${c.reset}`);
} else {
  for (const a of agents) {
    const meta = a.metadata ? JSON.parse(a.metadata) : {};
    console.log(`  ${c.cyan}${a.name}${c.reset}`);
    console.log(`    ID:        ${c.dim}${a.agent_id}${c.reset}`);
    console.log(`    Platform:  ${a.platform} v${a.version}`);
    console.log(`    Sandboxed: ${a.docker_sandboxed ? `${c.green}yes${c.reset}` : `${c.red}no${c.reset}`}`);
    console.log(`    Created:   ${a.created_at}`);
    if (meta.role) console.log(`    Role:      ${meta.role}`);
  }
}

// ─── Sessions ───────────────────────────────────────────────────────

section('Sessions');

const sessionStats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
    SUM(CASE WHEN status = 'terminated' THEN 1 ELSE 0 END) as terminated,
    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errored
  FROM sessions
`).get() as any;

console.log(`  Total:      ${c.bold}${sessionStats.total}${c.reset}`);
console.log(`  Active:     ${c.green}${sessionStats.active}${c.reset}`);
console.log(`  Completed:  ${sessionStats.completed}`);
if (sessionStats.terminated > 0)
  console.log(`  Terminated: ${c.yellow}${sessionStats.terminated}${c.reset}`);
if (sessionStats.errored > 0)
  console.log(`  Error:      ${c.red}${sessionStats.errored}${c.reset}`);

// Per-agent session breakdown
const perAgent = db.prepare(`
  SELECT a.name, s.status, COUNT(*) as cnt
  FROM sessions s
  JOIN agents a ON s.agent_id = a.agent_id
  GROUP BY a.name, s.status
  ORDER BY a.name
`).all() as any[];

if (perAgent.length > 0) {
  console.log();
  for (const row of perAgent) {
    console.log(`    ${c.dim}${row.name}${c.reset} → ${row.status}: ${row.cnt}`);
  }
}

// ─── Behavior Events ────────────────────────────────────────────────

section('Behavior Events');

const eventStats = db.prepare(`
  SELECT
    COUNT(*) as total,
    COALESCE(SUM(CASE WHEN blocked = 1 THEN 1 ELSE 0 END), 0) as blocked,
    COALESCE(SUM(CASE WHEN threat_level = 'critical' THEN 1 ELSE 0 END), 0) as critical,
    COALESCE(SUM(CASE WHEN threat_level = 'high' THEN 1 ELSE 0 END), 0) as high,
    COALESCE(SUM(CASE WHEN threat_level = 'medium' THEN 1 ELSE 0 END), 0) as medium,
    COALESCE(SUM(CASE WHEN threat_level = 'low' THEN 1 ELSE 0 END), 0) as low,
    COALESCE(SUM(CASE WHEN threat_level = 'none' OR threat_level IS NULL THEN 1 ELSE 0 END), 0) as clean
  FROM behavior_events
`).get() as any;

console.log(`  Total events:     ${c.bold}${eventStats.total}${c.reset}`);
console.log(`  Clean (no threat): ${c.green}${eventStats.clean}${c.reset}`);
console.log(`  Low:              ${eventStats.low}`);
console.log(`  Medium:           ${c.yellow}${eventStats.medium}${c.reset}`);
console.log(`  High:             ${c.red}${eventStats.high}${c.reset}`);
console.log(`  Critical:         ${c.red}${c.bold}${eventStats.critical}${c.reset}`);
console.log(`  ${c.red}Blocked:          ${c.bold}${eventStats.blocked}${c.reset}`);

// Event type breakdown
const byType = db.prepare(`
  SELECT event_type, COUNT(*) as cnt,
         SUM(CASE WHEN blocked = 1 THEN 1 ELSE 0 END) as blocked
  FROM behavior_events
  GROUP BY event_type
  ORDER BY cnt DESC
`).all() as any[];

if (byType.length > 0) {
  console.log();
  console.log(`  ${c.dim}By event type:${c.reset}`);
  for (const row of byType) {
    const blocked = row.blocked > 0 ? ` ${c.red}(${row.blocked} blocked)${c.reset}` : '';
    console.log(`    ${row.event_type}: ${row.cnt}${blocked}`);
  }
}

// Threat signatures
const signatures = db.prepare(`
  SELECT threat_signature, threat_level, COUNT(*) as cnt
  FROM behavior_events
  WHERE threat_signature IS NOT NULL AND threat_signature != ''
  GROUP BY threat_signature
  ORDER BY cnt DESC
  LIMIT 10
`).all() as any[];

if (signatures.length > 0) {
  console.log();
  console.log(`  ${c.dim}Top threat signatures:${c.reset}`);
  for (const row of signatures) {
    const levelColor = row.threat_level === 'critical' || row.threat_level === 'high'
      ? c.red : c.yellow;
    console.log(`    ${levelColor}${row.threat_signature}${c.reset} (${row.threat_level}) × ${row.cnt}`);
  }
}

// Recent blocked events
const recentBlocked = db.prepare(`
  SELECT be.*, a.name as agent_name
  FROM behavior_events be
  JOIN sessions s ON be.session_id = s.session_id
  JOIN agents a ON s.agent_id = a.agent_id
  WHERE be.blocked = 1
  ORDER BY be.timestamp DESC
  LIMIT 5
`).all() as any[];

if (recentBlocked.length > 0) {
  console.log();
  console.log(`  ${c.dim}Recent blocked events:${c.reset}`);
  for (const row of recentBlocked) {
    const details = row.details ? JSON.parse(row.details) : {};
    const tool = details.toolName || details.tool || row.event_type;
    console.log(`    ${c.red}BLOCKED${c.reset} ${row.agent_name} → ${tool} [${row.threat_level}] ${c.dim}${row.timestamp}${c.reset}`);
    if (row.threat_signature) {
      console.log(`      ${c.yellow}${row.threat_signature}${c.reset}`);
    }
  }
}

// ─── Cost Records ───────────────────────────────────────────────────

section('Cost Records');

const costStats = db.prepare(`
  SELECT
    COUNT(*) as calls,
    COALESCE(SUM(total_tokens), 0) as tokens,
    COALESCE(SUM(estimated_cost_usd), 0) as cost
  FROM cost_records
`).get() as any;

console.log(`  API calls:    ${costStats.calls}`);
console.log(`  Total tokens: ${costStats.tokens.toLocaleString()}`);
console.log(`  Total cost:   $${costStats.cost.toFixed(4)}`);

// ─── Memory Entities ────────────────────────────────────────────────

section('Memory Entities');

const memStats = db.prepare(`
  SELECT entity_type, COUNT(*) as cnt
  FROM memory_entities
  GROUP BY entity_type
  ORDER BY cnt DESC
`).all() as any[];

if (memStats.length === 0) {
  console.log(`  ${c.dim}(none)${c.reset}`);
} else {
  for (const row of memStats) {
    console.log(`  ${row.entity_type}: ${row.cnt}`);
  }
}

// ─── Skill Trust ────────────────────────────────────────────────────

section('Skill Trust');

const skillStats = db.prepare(`
  SELECT trust_level, COUNT(*) as cnt
  FROM skill_trust
  GROUP BY trust_level
  ORDER BY cnt DESC
`).all() as any[];

if (skillStats.length === 0) {
  console.log(`  ${c.dim}(none)${c.reset}`);
} else {
  for (const row of skillStats) {
    const color = row.trust_level === 'certified' ? c.green
      : row.trust_level === 'untrusted' ? c.red
      : row.trust_level === 'unknown' ? c.yellow
      : c.reset;
    console.log(`  ${color}${row.trust_level}${c.reset}: ${row.cnt}`);
  }
}

// ─── Pipelines ──────────────────────────────────────────────────────

section('Pipelines');

const pipeStats = db.prepare(`
  SELECT status, COUNT(*) as cnt
  FROM pipelines
  GROUP BY status
  ORDER BY cnt DESC
`).all() as any[];

if (pipeStats.length === 0) {
  console.log(`  ${c.dim}(none)${c.reset}`);
} else {
  for (const row of pipeStats) {
    console.log(`  ${row.status}: ${row.cnt}`);
  }
}

// ─── Summary ────────────────────────────────────────────────────────

console.log();
console.log(`  ${c.dim}${line()}${c.reset}`);
console.log(`  ${c.bold}${c.white}Summary${c.reset}`);
console.log(`  ${c.dim}${line('─', 58)}${c.reset}`);
console.log(`  Agents:     ${agents.length}`);
console.log(`  Sessions:   ${sessionStats.total}`);
console.log(`  Events:     ${eventStats.total} (${c.red}${eventStats.blocked} blocked${c.reset})`);
console.log(`  Cost:       $${costStats.cost.toFixed(4)} across ${costStats.calls} calls`);
console.log(`  Memory:     ${memStats.reduce((s: number, r: any) => s + r.cnt, 0)} entities`);
console.log(`  DB path:    ${c.dim}${dbPath}${c.reset}`);
console.log(`  ${c.dim}${line('─', 58)}${c.reset}`);
console.log();

db.close();
