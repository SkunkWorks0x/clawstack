/**
 * ClawGuard Policy Engine — Configurable Security Policies
 *
 * Policies define what agents are allowed and blocked from doing.
 * Default policy: block external network, restrict file paths, limit process spawning.
 * Custom policies: users define allowed/blocked domains, paths, behaviors.
 * Policies stored as JSON, loaded at agent startup.
 */
import type { SecurityPolicy, ThreatDetection, NetworkRequestDetails, FileAccessDetails, ProcessSpawnDetails, CostAnomalyDetails } from './types.js';
export declare const DEFAULT_POLICY: SecurityPolicy;
export declare class PolicyEngine {
    private policy;
    constructor(policy?: Partial<SecurityPolicy>);
    getPolicy(): SecurityPolicy;
    updatePolicy(patch: Partial<SecurityPolicy>): void;
    /**
     * Load policy from JSON string.
     */
    loadFromJSON(json: string): void;
    /**
     * Export policy as JSON string.
     */
    toJSON(): string;
    evaluateNetworkRequest(details: NetworkRequestDetails): ThreatDetection | null;
    evaluateFileAccess(details: FileAccessDetails): ThreatDetection | null;
    evaluateProcessSpawn(details: ProcessSpawnDetails): ThreatDetection | null;
    evaluateCostAnomaly(details: CostAnomalyDetails): ThreatDetection | null;
    private domainMatches;
    private normalizePath;
    private mergeWithDefaults;
}
//# sourceMappingURL=policy-engine.d.ts.map