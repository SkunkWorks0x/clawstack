/**
 * clawforge audit — Security Audit for Existing OpenClaw Installation
 *
 * Checks:
 *  1. Gateway binding (loopback vs 0.0.0.0)
 *  2. Token strength (length, placeholder detection)
 *  3. Docker sandbox status
 *  4. Exposed ports (18789)
 *  5. Config file permissions (should be 600)
 *  6. Version security (CVE-2026-25253 check)
 */

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

export interface AuditResult {
  checks: SecurityCheck[];
  report: string;
}

export interface AuditOptions {
  openClawHome?: string;
}

export function audit(opts?: AuditOptions): AuditResult {
  const system = getSystemInfo();
  const openClawHome = opts?.openClawHome || system.openClawHome;
  const openClaw = checkOpenClaw(openClawHome);
  const docker = checkDocker();

  const checks: SecurityCheck[] = [
    checkGatewayBinding(openClaw.config),
    checkTokenStrength(openClaw.config),
    checkDockerSandbox(openClaw.config, docker.running),
    checkExposedPorts(),
    openClaw.configExists
      ? checkConfigPermissions(openClaw.configPath)
      : { name: 'Config Permissions', result: 'warn' as const, detail: `Config not found at ${openClaw.configPath}` },
    checkOpenClawVersion(openClaw.version),
  ];

  return { checks, report: formatReportCard(checks) };
}
