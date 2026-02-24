/**
 * ClawGuard Threat Intelligence — Behavioral Fingerprints & Signatures
 *
 * Every blocked attack becomes a detection signature.
 * Tracks threat history per skill via skill_trust table.
 * Stores behavioral fingerprints for known-bad patterns.
 * Community threat feed: shared signatures across ClawGuard users.
 */
import type { SessionGraph, BehaviorEvent, SkillTrust } from '@clawstack/shared';
import type { ThreatSignature } from './types.js';
export declare class ThreatIntel {
    private graph;
    private signatures;
    constructor(graph: SessionGraph);
    /**
     * Register a new threat signature from a blocked attack.
     */
    registerSignature(sig: Omit<ThreatSignature, 'createdAt' | 'hitCount'>): ThreatSignature;
    getSignature(signatureId: string): ThreatSignature | null;
    getAllSignatures(): ThreatSignature[];
    recordSignatureHit(signatureId: string): void;
    /**
     * Record a threat against a skill. Increments threatHistory
     * and may downgrade trust level.
     */
    recordSkillThreat(skillId: string, event: BehaviorEvent): void;
    /**
     * Check if a behavior event matches any known threat signature.
     */
    matchSignatures(event: BehaviorEvent): ThreatSignature[];
    /**
     * Generate a behavioral fingerprint for a behavior event.
     */
    generateFingerprint(event: BehaviorEvent): string;
    /**
     * Get threat summary for a skill.
     */
    getSkillThreatProfile(skillId: string): {
        trust: SkillTrust | null;
        recentThreats: BehaviorEvent[];
        matchingSignatures: ThreatSignature[];
    };
    /**
     * Export signatures for community threat feed sharing.
     */
    exportSignatures(): string;
    /**
     * Import signatures from community threat feed.
     */
    importSignatures(json: string): number;
    private calculateTrustAfterThreat;
    private loadBuiltinSignatures;
}
//# sourceMappingURL=threat-intel.d.ts.map