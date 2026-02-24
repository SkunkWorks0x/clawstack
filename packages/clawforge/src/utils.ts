/**
 * ClawForge Utilities — System Detection & Security Checks
 *
 * Real OpenClaw paths and defaults based on verified documentation:
 * - Config: ~/.openclaw/openclaw.json
 * - Default port: 18789
 * - Default bind: loopback (127.0.0.1)
 * - CVE-2026-25253: Critical RCE in all versions < 2026.1.29
 */

import { execSync } from 'child_process';
import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { platform, arch, homedir } from 'os';

// ─── Exec ────────────────────────────────────────────────────────

export interface ExecResult {
  stdout: string;
  success: boolean;
}

export function exec(cmd: string): ExecResult {
  try {
    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return { stdout, success: true };
  } catch {
    return { stdout: '', success: false };
  }
}

// ─── System Info ─────────────────────────────────────────────────

export interface SystemInfo {
  os: string;
  arch: string;
  homeDir: string;
  openClawHome: string;
}

export function getSystemInfo(): SystemInfo {
  const home = homedir();
  return {
    os: platform(),
    arch: arch(),
    homeDir: home,
    openClawHome: process.env.OPENCLAW_HOME || join(home, '.openclaw'),
  };
}

// ─── OpenClaw Detection ─────────────────────────────────────────

export interface OpenClawConfig {
  gateway?: {
    port?: number;
    bind?: string;
    mode?: string;
    auth?: {
      mode?: string;
      token?: string;
    };
  };
  agents?: {
    defaults?: {
      sandbox?: {
        mode?: string;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface OpenClawStatus {
  installed: boolean;
  version: string | null;
  configPath: string;
  configExists: boolean;
  config: OpenClawConfig | null;
}

export function checkOpenClaw(openClawHome: string): OpenClawStatus {
  const configPath = process.env.OPENCLAW_CONFIG_PATH || join(openClawHome, 'openclaw.json');

  const versionResult = exec('openclaw --version');

  let configExists = false;
  let config: OpenClawConfig | null = null;

  try {
    const raw = readFileSync(configPath, 'utf-8');
    config = JSON.parse(raw) as OpenClawConfig;
    configExists = true;
  } catch {
    // Config doesn't exist or isn't parseable
  }

  return {
    installed: versionResult.success,
    version: versionResult.success
      ? versionResult.stdout.replace(/^openclaw\s*/i, '').trim()
      : null,
    configPath,
    configExists,
    config,
  };
}

// ─── Docker Detection ────────────────────────────────────────────

export interface DockerStatus {
  installed: boolean;
  running: boolean;
  version: string | null;
}

export function checkDocker(): DockerStatus {
  const versionResult = exec('docker --version');
  if (!versionResult.success) {
    return { installed: false, running: false, version: null };
  }

  const pingResult = exec('docker info');
  return {
    installed: true,
    running: pingResult.success,
    version: versionResult.stdout,
  };
}

// ─── Security Checks ────────────────────────────────────────────

export type CheckResult = 'pass' | 'warn' | 'fail';

export interface SecurityCheck {
  name: string;
  result: CheckResult;
  detail: string;
}

export function checkGatewayBinding(config: OpenClawConfig | null): SecurityCheck {
  if (!config) {
    return { name: 'Gateway Binding', result: 'warn', detail: 'No config file found — cannot verify gateway binding' };
  }

  const bind = config.gateway?.bind;
  const mode = config.gateway?.mode;

  if (!bind && !mode) {
    return { name: 'Gateway Binding', result: 'warn', detail: 'No gateway.bind specified — defaults to loopback (verify)' };
  }

  if (bind === 'loopback' || bind === '127.0.0.1' || mode === 'local') {
    return { name: 'Gateway Binding', result: 'pass', detail: 'Gateway bound to loopback only' };
  }

  if (bind === '0.0.0.0' || bind === 'lan' || bind === 'custom') {
    return {
      name: 'Gateway Binding',
      result: 'fail',
      detail: `Gateway bound to "${bind}" — exposed to network. CVE-2026-25253 risk.`,
    };
  }

  return { name: 'Gateway Binding', result: 'warn', detail: `Gateway bind: "${bind}" — verify this is intentional` };
}

export function checkTokenStrength(config: OpenClawConfig | null): SecurityCheck {
  if (!config) {
    return { name: 'Token Strength', result: 'warn', detail: 'No config file found — cannot verify token' };
  }

  const authMode = config.gateway?.auth?.mode;
  const token = config.gateway?.auth?.token;

  if (!authMode) {
    return { name: 'Token Strength', result: 'warn', detail: 'No auth mode configured' };
  }

  if (authMode !== 'token') {
    return { name: 'Token Strength', result: 'warn', detail: `Auth mode is "${authMode}", not token-based` };
  }

  if (!token) {
    return { name: 'Token Strength', result: 'fail', detail: 'Token auth enabled but no token set' };
  }

  const PLACEHOLDER_TOKENS = ['replace-with-long-random-token', 'changeme', 'default', 'test'];
  if (PLACEHOLDER_TOKENS.includes(token)) {
    return { name: 'Token Strength', result: 'fail', detail: 'Default/placeholder token detected — generate a secure token' };
  }

  if (token.length < 32) {
    return { name: 'Token Strength', result: 'fail', detail: `Token too short (${token.length} chars) — minimum 32 recommended` };
  }

  return { name: 'Token Strength', result: 'pass', detail: `Token set (${token.length} chars)` };
}

export function checkDockerSandbox(config: OpenClawConfig | null, dockerRunning: boolean): SecurityCheck {
  if (!dockerRunning) {
    return { name: 'Docker Sandbox', result: 'fail', detail: 'Docker not running — sandbox unavailable' };
  }

  const sandbox = config?.agents?.defaults?.sandbox;
  if (!sandbox) {
    return { name: 'Docker Sandbox', result: 'warn', detail: 'No sandbox configuration found — agents run unsandboxed' };
  }

  if (sandbox.mode === 'all') {
    return { name: 'Docker Sandbox', result: 'pass', detail: 'All agents sandboxed in Docker' };
  }

  if (sandbox.mode === 'non-main') {
    return { name: 'Docker Sandbox', result: 'pass', detail: 'Non-main agents sandboxed in Docker' };
  }

  return { name: 'Docker Sandbox', result: 'warn', detail: `Sandbox mode: "${sandbox.mode}" — verify this is intentional` };
}

export function checkConfigPermissions(configPath: string): SecurityCheck {
  try {
    const stat = statSync(configPath);
    const mode = (stat.mode & 0o777).toString(8);

    // Fail if group or world readable
    if (stat.mode & 0o044) {
      return {
        name: 'Config Permissions',
        result: 'fail',
        detail: `Config permissions ${mode} — readable by others. Should be 600.`,
      };
    }

    return { name: 'Config Permissions', result: 'pass', detail: `Config permissions: ${mode}` };
  } catch {
    return { name: 'Config Permissions', result: 'warn', detail: 'Could not check config file permissions' };
  }
}

export function checkExposedPorts(): SecurityCheck {
  const result = exec('lsof -i :18789 -sTCP:LISTEN -P -n');

  if (!result.success || !result.stdout) {
    return { name: 'Exposed Ports', result: 'pass', detail: 'Port 18789 not listening' };
  }

  if (result.stdout.includes('*:18789') || result.stdout.includes('0.0.0.0:18789')) {
    return { name: 'Exposed Ports', result: 'fail', detail: 'Port 18789 bound to 0.0.0.0 — exposed to all interfaces' };
  }

  if (result.stdout.includes('127.0.0.1:18789') || result.stdout.includes('localhost:18789')) {
    return { name: 'Exposed Ports', result: 'pass', detail: 'Port 18789 bound to loopback only' };
  }

  return { name: 'Exposed Ports', result: 'warn', detail: 'Port 18789 listening — verify binding' };
}

export function checkOpenClawVersion(version: string | null): SecurityCheck {
  if (!version) {
    return { name: 'Version Security', result: 'warn', detail: 'Cannot determine OpenClaw version' };
  }

  // CVE-2026-25253: Critical One-Click RCE — all versions before 2026.1.29
  try {
    const parts = version.split('.');
    if (parts.length >= 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);

      if (year < 2026 || (year === 2026 && month < 1) || (year === 2026 && month === 1 && day < 29)) {
        return {
          name: 'Version Security',
          result: 'fail',
          detail: `Version ${version} vulnerable to CVE-2026-25253 (One-Click RCE). Upgrade to 2026.1.29+.`,
        };
      }
    }
  } catch {
    // Can't parse — fall through
  }

  return { name: 'Version Security', result: 'pass', detail: `Version ${version} — no known critical CVEs` };
}

// ─── Report Formatting ──────────────────────────────────────────

const CHECK_ICONS: Record<CheckResult, string> = {
  pass: '[PASS]',
  warn: '[WARN]',
  fail: '[FAIL]',
};

export function formatSecurityCheck(check: SecurityCheck): string {
  return `  ${CHECK_ICONS[check.result]} ${check.name}: ${check.detail}`;
}

export function formatReportCard(checks: SecurityCheck[]): string {
  const pass = checks.filter(c => c.result === 'pass').length;
  const warn = checks.filter(c => c.result === 'warn').length;
  const fail = checks.filter(c => c.result === 'fail').length;

  const lines: string[] = [
    '',
    '=== ClawForge Security Report ===',
    '',
    ...checks.map(formatSecurityCheck),
    '',
    `Score: ${pass} passed, ${warn} warnings, ${fail} failures`,
    '',
  ];

  if (fail > 0) {
    lines.push('Action Required: Fix FAIL items before deploying agents.');
  } else if (warn > 0) {
    lines.push('Review: Check WARN items for potential issues.');
  } else {
    lines.push('All checks passed. Ready for secure agent deployment.');
  }

  return lines.join('\n');
}
