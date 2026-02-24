/**
 * ClawGuard Runtime Monitor — Behavioral Security at Process Level
 *
 * Sits OUTSIDE the LLM context window. Cannot be prompt-injected.
 * SecureClaw puts rules inside the agent's context (~1,230 tokens of natural language).
 * A clever prompt injection overrides them.
 * ClawGuard operates at process/network level. You can't prompt-inject a network firewall.
 *
 * Watches agent behavior by intercepting:
 * - Network requests (flag external URLs, detect data exfiltration patterns)
 * - File system access (flag writes outside sandbox, sensitive path access)
 * - Process spawning (detect shell exec, child processes)
 * - Token/cost anomalies (sudden spikes = possible attack cover traffic)
 *
 * Reads behavior events from the Agent Session Graph.
 * Writes threat assessments back.
 */
import type { SessionGraph, BehaviorEvent, EventBus } from '@clawstack/shared';
import { PolicyEngine } from './policy-engine.js';
import { KillSwitch } from './kill-switch.js';
import { ThreatIntel } from './threat-intel.js';
import type { ThreatDetection, NetworkRequestDetails, FileAccessDetails, ProcessSpawnDetails, SecurityPolicy } from './types.js';
export interface MonitorConfig {
    policy?: Partial<SecurityPolicy>;
    autoKill?: boolean;
}
export declare class RuntimeMonitor {
    private graph;
    private bus;
    private policyEngine;
    private killSwitch;
    private threatIntel;
    private autoKill;
    private costHistory;
    constructor(graph: SessionGraph, bus: EventBus, config?: MonitorConfig);
    getPolicyEngine(): PolicyEngine;
    getKillSwitch(): KillSwitch;
    getThreatIntel(): ThreatIntel;
    /**
     * Intercept and evaluate a network request.
     */
    interceptNetworkRequest(sessionId: string, agentId: string, details: NetworkRequestDetails): Promise<{
        allowed: boolean;
        event: BehaviorEvent;
        detection: ThreatDetection | null;
    }>;
    /**
     * Intercept and evaluate a file system access.
     */
    interceptFileAccess(sessionId: string, agentId: string, details: FileAccessDetails): Promise<{
        allowed: boolean;
        event: BehaviorEvent;
        detection: ThreatDetection | null;
    }>;
    /**
     * Intercept and evaluate a process spawn.
     */
    interceptProcessSpawn(sessionId: string, agentId: string, details: ProcessSpawnDetails): Promise<{
        allowed: boolean;
        event: BehaviorEvent;
        detection: ThreatDetection | null;
    }>;
    /**
     * Intercept and evaluate token/cost anomalies.
     */
    interceptCostEvent(sessionId: string, agentId: string, tokens: number): Promise<{
        anomaly: boolean;
        event: BehaviorEvent;
        detection: ThreatDetection | null;
    }>;
    private handleDetection;
    private upgradeFromSignatures;
}
//# sourceMappingURL=runtime-monitor.d.ts.map