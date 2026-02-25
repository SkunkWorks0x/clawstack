/**
 * ClawGuard Policy Engine — Configurable Security Policies
 *
 * Policies define what agents are allowed and blocked from doing.
 * Default policy: block external network, restrict file paths, limit process spawning.
 * Custom policies: users define allowed/blocked domains, paths, behaviors.
 * Policies stored as JSON, loaded at agent startup.
 */

import type {
  SecurityPolicy,
  NetworkPolicy,
  FilesystemPolicy,
  ProcessPolicy,
  CostAnomalyPolicy,
  ThreatDetection,
  NetworkRequestDetails,
  FileAccessDetails,
  ProcessSpawnDetails,
  CostAnomalyDetails,
} from './types.js';
import type { ThreatLevel } from '@clawstack/shared';

// ─── Default Policy ─────────────────────────────────────────────────

const DEFAULT_NETWORK_POLICY: NetworkPolicy = {
  allowedDomains: ['localhost', '127.0.0.1', '::1'],
  blockedDomains: [],
  blockExternalByDefault: true,
  maxRequestsPerMinute: 60,
  exfiltrationPatterns: [
    'base64=[A-Za-z0-9+/=]{100,}',       // large base64 in URL
    'data=[A-Fa-f0-9]{64,}',              // hex-encoded data
    '(password|secret|token|key)=',        // credential params
    '\\.(txt|csv|json|db|sqlite)$',        // file extension in URL path
  ],
};

const DEFAULT_FILESYSTEM_POLICY: FilesystemPolicy = {
  allowedPaths: ['.'],
  blockedPaths: [
    '/etc/passwd',
    '/etc/shadow',
    '/etc/ssh',
    '~/.ssh',
    '~/.gnupg',
    '~/.aws',
    '~/.config/gcloud',
    '~/.kube',
    '/proc',
    '/sys',
  ],
  blockWritesOutsideSandbox: true,
  sandboxRoot: '.',
};

const DEFAULT_PROCESS_POLICY: ProcessPolicy = {
  allowShellExec: false,
  allowedCommands: ['node', 'npm', 'npx', 'git', 'tsc', 'vitest'],
  blockedCommands: [
    'rm -rf /',
    'curl',
    'wget',
    'nc',
    'ncat',
    'socat',
    'dd',
    'mkfs',
    'shutdown',
    'reboot',
    'passwd',
    'useradd',
    'chmod 777',
  ],
  maxChildProcesses: 10,
};

const DEFAULT_COST_ANOMALY_POLICY: CostAnomalyPolicy = {
  spikeThresholdMultiplier: 3,
  windowSizeMs: 60_000,
  maxTokensPerMinute: 500_000,
};

export const DEFAULT_POLICY: SecurityPolicy = {
  name: 'default',
  version: '1.0.0',
  network: DEFAULT_NETWORK_POLICY,
  filesystem: DEFAULT_FILESYSTEM_POLICY,
  process: DEFAULT_PROCESS_POLICY,
  costAnomaly: DEFAULT_COST_ANOMALY_POLICY,
};

// ─── OpenClaw Sandboxed Policy ───────────────────────────────────────
// For agents running inside a Docker sandbox (e.g. Blade).
// Shell exec and process spawning are safe because the container IS the sandbox.
// Still blocks truly destructive commands that could break the container state.

const SANDBOXED_PROCESS_POLICY: ProcessPolicy = {
  allowShellExec: true,
  allowedCommands: [],  // Not used when allowShellExec is true
  blockedCommands: [
    'rm -rf /',
    'mkfs',
    'dd',
    'shutdown',
    'reboot',
  ],
  maxChildProcesses: 50,
};

export const OPENCLAW_SANDBOXED_POLICY: SecurityPolicy = {
  name: 'openclaw-sandboxed',
  version: '1.0.0',
  network: DEFAULT_NETWORK_POLICY,
  filesystem: DEFAULT_FILESYSTEM_POLICY,
  process: SANDBOXED_PROCESS_POLICY,
  costAnomaly: DEFAULT_COST_ANOMALY_POLICY,
};

// ─── Policy Presets ──────────────────────────────────────────────────

export const POLICY_PRESETS: Record<string, SecurityPolicy> = {
  'default': DEFAULT_POLICY,
  'openclaw-sandboxed': OPENCLAW_SANDBOXED_POLICY,
};

// ─── Policy Engine ──────────────────────────────────────────────────

export class PolicyEngine {
  private policy: SecurityPolicy;

  constructor(policy?: Partial<SecurityPolicy>) {
    this.policy = this.mergeWithDefaults(policy);
  }

  getPolicy(): SecurityPolicy {
    return this.policy;
  }

  updatePolicy(patch: Partial<SecurityPolicy>): void {
    this.policy = this.mergeWithDefaults(patch);
  }

  /**
   * Load policy from JSON string.
   */
  loadFromJSON(json: string): void {
    const parsed = JSON.parse(json) as Partial<SecurityPolicy>;
    this.policy = this.mergeWithDefaults(parsed);
  }

  /**
   * Export policy as JSON string.
   */
  toJSON(): string {
    return JSON.stringify(this.policy, null, 2);
  }

  // ─── Evaluation Methods ─────────────────────────────────────────

  evaluateNetworkRequest(details: NetworkRequestDetails): ThreatDetection | null {
    const { network } = this.policy;

    // Check blocked domains
    if (network.blockedDomains.some(d => this.domainMatches(details.hostname, d))) {
      return {
        eventType: 'network_request',
        threatLevel: 'high',
        threatSignature: 'NET_BLOCKED_DOMAIN',
        description: `Network request to blocked domain: ${details.hostname}`,
        evidence: { ...details },
        blocked: true,
      };
    }

    // Check external access when blocked by default
    if (network.blockExternalByDefault) {
      const isAllowed = network.allowedDomains.some(d => this.domainMatches(details.hostname, d));
      if (!isAllowed) {
        return {
          eventType: 'network_request',
          threatLevel: 'high',
          threatSignature: 'NET_EXTERNAL_BLOCKED',
          description: `External network request blocked: ${details.hostname}`,
          evidence: { ...details },
          blocked: true,
        };
      }
    }

    // Check exfiltration patterns
    const fullUrl = details.url;
    for (const pattern of network.exfiltrationPatterns) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(fullUrl)) {
        return {
          eventType: 'network_request',
          threatLevel: 'critical',
          threatSignature: 'NET_DATA_EXFILTRATION',
          description: `Potential data exfiltration detected in URL: ${details.hostname}`,
          evidence: { ...details, matchedPattern: pattern },
          blocked: true,
        };
      }
    }

    return null;
  }

  evaluateFileAccess(details: FileAccessDetails): ThreatDetection | null {
    const { filesystem } = this.policy;
    const normalizedPath = this.normalizePath(details.path);

    // Check blocked paths
    for (const blocked of filesystem.blockedPaths) {
      const normalizedBlocked = this.normalizePath(blocked);
      if (normalizedPath.startsWith(normalizedBlocked)) {
        return {
          eventType: 'file_access',
          threatLevel: 'critical',
          threatSignature: 'FS_SENSITIVE_PATH',
          description: `Access to sensitive path: ${details.path}`,
          evidence: { ...details, matchedRule: blocked },
          blocked: true,
        };
      }
    }

    // Check writes outside sandbox
    if (details.operation === 'write' && filesystem.blockWritesOutsideSandbox) {
      const sandboxRoot = this.normalizePath(filesystem.sandboxRoot);
      if (!normalizedPath.startsWith(sandboxRoot)) {
        return {
          eventType: 'file_access',
          threatLevel: 'high',
          threatSignature: 'FS_WRITE_OUTSIDE_SANDBOX',
          description: `File write outside sandbox: ${details.path}`,
          evidence: { ...details, sandboxRoot: filesystem.sandboxRoot },
          blocked: true,
        };
      }
    }

    return null;
  }

  evaluateProcessSpawn(details: ProcessSpawnDetails): ThreatDetection | null {
    const { process: proc } = this.policy;
    const fullCommand = [details.command, ...details.args].join(' ');

    // Check if shell exec is blocked entirely
    if (!proc.allowShellExec) {
      const shellCommands = ['sh', 'bash', 'zsh', 'fish', 'csh', 'dash', 'cmd', 'powershell'];
      if (shellCommands.includes(details.command)) {
        return {
          eventType: 'process_spawn',
          threatLevel: 'high',
          threatSignature: 'PROC_SHELL_EXEC',
          description: `Shell execution blocked: ${details.command}`,
          evidence: { ...details },
          blocked: true,
        };
      }
    }

    // Check blocked commands
    for (const blocked of proc.blockedCommands) {
      if (fullCommand.includes(blocked) || details.command === blocked) {
        return {
          eventType: 'process_spawn',
          threatLevel: 'critical',
          threatSignature: 'PROC_BLOCKED_COMMAND',
          description: `Blocked command detected: ${blocked}`,
          evidence: { ...details, matchedRule: blocked },
          blocked: true,
        };
      }
    }

    // Check if command is in allowed list (when shell exec is disabled)
    if (!proc.allowShellExec) {
      const isAllowed = proc.allowedCommands.some(cmd =>
        details.command === cmd || details.command.endsWith('/' + cmd)
      );
      if (!isAllowed) {
        return {
          eventType: 'process_spawn',
          threatLevel: 'medium',
          threatSignature: 'PROC_UNLISTED_COMMAND',
          description: `Unlisted command: ${details.command}`,
          evidence: { ...details },
          blocked: false,
        };
      }
    }

    return null;
  }

  evaluateCostAnomaly(details: CostAnomalyDetails): ThreatDetection | null {
    const { costAnomaly } = this.policy;

    // Check token spike
    if (details.spikeMultiplier >= costAnomaly.spikeThresholdMultiplier) {
      const level: ThreatLevel = details.spikeMultiplier >= costAnomaly.spikeThresholdMultiplier * 2
        ? 'critical'
        : 'high';
      return {
        eventType: 'tool_call',
        threatLevel: level,
        threatSignature: 'COST_SPIKE_DETECTED',
        description: `Token cost spike: ${details.spikeMultiplier.toFixed(1)}x average (threshold: ${costAnomaly.spikeThresholdMultiplier}x)`,
        evidence: { ...details },
        blocked: level === 'critical',
      };
    }

    // Check absolute token rate
    if (details.currentTokens > costAnomaly.maxTokensPerMinute) {
      return {
        eventType: 'tool_call',
        threatLevel: 'high',
        threatSignature: 'COST_RATE_EXCEEDED',
        description: `Token rate exceeded: ${details.currentTokens} tokens/min (max: ${costAnomaly.maxTokensPerMinute})`,
        evidence: { ...details },
        blocked: false,
      };
    }

    return null;
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private domainMatches(hostname: string, pattern: string): boolean {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1);
      return hostname.endsWith(suffix) || hostname === pattern.slice(2);
    }
    return hostname === pattern;
  }

  private normalizePath(p: string): string {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return p.replace(/^~/, home).replace(/\/+$/, '');
  }

  private mergeWithDefaults(patch?: Partial<SecurityPolicy>): SecurityPolicy {
    if (!patch) return { ...DEFAULT_POLICY };
    return {
      name: patch.name ?? DEFAULT_POLICY.name,
      version: patch.version ?? DEFAULT_POLICY.version,
      network: { ...DEFAULT_POLICY.network, ...patch.network },
      filesystem: { ...DEFAULT_POLICY.filesystem, ...patch.filesystem },
      process: { ...DEFAULT_POLICY.process, ...patch.process },
      costAnomaly: { ...DEFAULT_POLICY.costAnomaly, ...patch.costAnomaly },
    };
  }
}
