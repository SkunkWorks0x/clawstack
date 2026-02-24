/**
 * ClawGuard — Behavioral Runtime Security + Trust Certification
 * "The trust layer OpenClaw is missing."
 *
 * Runtime monitor OUTSIDE LLM context (cannot be prompt-injected).
 * Process-level network/file/memory monitoring.
 * Rogue agent kill switch. Threat intelligence feed.
 * ClawGuard Certified program for premium skill publishers.
 *
 * Unlike SecureClaw (~1,230 tokens in-context, prompt-injectable),
 * ClawGuard operates at process/network level. You can't prompt-inject
 * a network firewall.
 *
 * Revenue: Free → $19/mo → $2,500-10K/mo enterprise
 */
export declare const VERSION = "0.1.0";
export { RuntimeMonitor } from './runtime-monitor.js';
export type { MonitorConfig } from './runtime-monitor.js';
export { PolicyEngine, DEFAULT_POLICY } from './policy-engine.js';
export { KillSwitch } from './kill-switch.js';
export { ThreatIntel } from './threat-intel.js';
export type { SecurityPolicy, NetworkPolicy, FilesystemPolicy, ProcessPolicy, CostAnomalyPolicy, ThreatDetection, ThreatSignature, KillSwitchResult, NetworkRequestDetails, FileAccessDetails, ProcessSpawnDetails, CostAnomalyDetails, } from './types.js';
//# sourceMappingURL=index.d.ts.map