/**
 * ClawGuard Types — Security Policy & Threat Detection
 *
 * These types are internal to ClawGuard. Shared types (BehaviorEvent,
 * ThreatLevel, SkillTrust, etc.) come from @clawstack/shared.
 */

import type { BehaviorEvent, ThreatLevel } from '@clawstack/shared';

// ─── Security Policies ─────────────────────────────────────────────

export interface SecurityPolicy {
  name: string;
  version: string;
  network: NetworkPolicy;
  filesystem: FilesystemPolicy;
  process: ProcessPolicy;
  costAnomaly: CostAnomalyPolicy;
}

export interface NetworkPolicy {
  allowedDomains: string[];
  blockedDomains: string[];
  blockExternalByDefault: boolean;
  maxRequestsPerMinute: number;
  exfiltrationPatterns: string[];
}

export interface FilesystemPolicy {
  allowedPaths: string[];
  blockedPaths: string[];
  blockWritesOutsideSandbox: boolean;
  sandboxRoot: string;
}

export interface ProcessPolicy {
  allowShellExec: boolean;
  allowedCommands: string[];
  blockedCommands: string[];
  maxChildProcesses: number;
}

export interface CostAnomalyPolicy {
  spikeThresholdMultiplier: number;
  windowSizeMs: number;
  maxTokensPerMinute: number;
}

// ─── Threat Detection ───────────────────────────────────────────────

export interface ThreatDetection {
  eventType: BehaviorEvent['eventType'];
  threatLevel: ThreatLevel;
  threatSignature: string;
  description: string;
  evidence: Record<string, unknown>;
  blocked: boolean;
}

export interface ThreatSignature {
  signatureId: string;
  name: string;
  description: string;
  pattern: string;
  category: 'network' | 'filesystem' | 'process' | 'cost' | 'behavioral';
  severity: ThreatLevel;
  createdAt: string;
  hitCount: number;
}

// ─── Kill Switch ────────────────────────────────────────────────────

export interface KillSwitchResult {
  sessionId: string;
  agentId: string;
  terminated: boolean;
  reason: string;
  eventChain: BehaviorEvent[];
  timestamp: string;
}

// ─── Runtime Monitor Input ──────────────────────────────────────────

export interface NetworkRequestDetails {
  url: string;
  method: string;
  hostname: string;
  port?: number;
  bodySize?: number;
}

export interface FileAccessDetails {
  path: string;
  operation: 'read' | 'write' | 'delete' | 'execute';
  size?: number;
}

export interface ProcessSpawnDetails {
  command: string;
  args: string[];
  cwd?: string;
}

export interface CostAnomalyDetails {
  currentTokens: number;
  averageTokens: number;
  spikeMultiplier: number;
  windowMs: number;
}
