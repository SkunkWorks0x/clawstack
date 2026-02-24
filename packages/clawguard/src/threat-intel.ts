/**
 * ClawGuard Threat Intelligence — Behavioral Fingerprints & Signatures
 *
 * Every blocked attack becomes a detection signature.
 * Tracks threat history per skill via skill_trust table.
 * Stores behavioral fingerprints for known-bad patterns.
 * Community threat feed: shared signatures across ClawGuard users.
 */

import { createHash } from 'crypto';
import type { SessionGraph, BehaviorEvent, SkillTrust, ThreatLevel } from '@clawstack/shared';
import type { ThreatSignature } from './types.js';

export class ThreatIntel {
  private graph: SessionGraph;
  private signatures: Map<string, ThreatSignature> = new Map();

  constructor(graph: SessionGraph) {
    this.graph = graph;
    this.loadBuiltinSignatures();
  }

  // ─── Signature Management ─────────────────────────────────────

  /**
   * Register a new threat signature from a blocked attack.
   */
  registerSignature(sig: Omit<ThreatSignature, 'createdAt' | 'hitCount'>): ThreatSignature {
    const full: ThreatSignature = {
      ...sig,
      createdAt: new Date().toISOString(),
      hitCount: 0,
    };
    this.signatures.set(sig.signatureId, full);
    return full;
  }

  getSignature(signatureId: string): ThreatSignature | null {
    return this.signatures.get(signatureId) ?? null;
  }

  getAllSignatures(): ThreatSignature[] {
    return Array.from(this.signatures.values());
  }

  recordSignatureHit(signatureId: string): void {
    const sig = this.signatures.get(signatureId);
    if (sig) {
      sig.hitCount++;
    }
  }

  // ─── Skill Trust Management ───────────────────────────────────

  /**
   * Record a threat against a skill. Increments threatHistory
   * and may downgrade trust level.
   */
  recordSkillThreat(skillId: string, event: BehaviorEvent): void {
    const existing = this.graph.getSkillTrust(skillId);

    if (existing) {
      const newThreatHistory = existing.threatHistory + 1;
      const newTrustLevel = this.calculateTrustAfterThreat(
        existing.trustLevel,
        event.threatLevel,
        newThreatHistory
      );

      this.graph.setSkillTrust({
        ...existing,
        trustLevel: newTrustLevel,
        threatHistory: newThreatHistory,
        lastAuditAt: new Date().toISOString(),
        behavioralFingerprint: this.generateFingerprint(event),
      });
    } else {
      // First time seeing this skill — register as untrusted
      this.graph.setSkillTrust({
        skillId,
        skillName: (event.details.skillName as string) || skillId,
        publisher: (event.details.publisher as string) || 'unknown',
        trustLevel: 'untrusted',
        certifiedAt: null,
        lastAuditAt: new Date().toISOString(),
        threatHistory: 1,
        behavioralFingerprint: this.generateFingerprint(event),
      });
    }
  }

  /**
   * Check if a behavior event matches any known threat signature.
   */
  matchSignatures(event: BehaviorEvent): ThreatSignature[] {
    const matches: ThreatSignature[] = [];
    const eventStr = JSON.stringify(event.details);

    for (const sig of this.signatures.values()) {
      try {
        const regex = new RegExp(sig.pattern, 'i');
        if (regex.test(eventStr)) {
          matches.push(sig);
          sig.hitCount++;
        }
      } catch {
        // Invalid regex, skip
      }
    }

    return matches;
  }

  /**
   * Generate a behavioral fingerprint for a behavior event.
   */
  generateFingerprint(event: BehaviorEvent): string {
    const parts = [
      event.eventType,
      event.threatLevel,
      event.threatSignature || '',
      JSON.stringify(Object.keys(event.details).sort()),
    ];
    return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
  }

  /**
   * Get threat summary for a skill.
   */
  getSkillThreatProfile(skillId: string): {
    trust: SkillTrust | null;
    recentThreats: BehaviorEvent[];
    matchingSignatures: ThreatSignature[];
  } {
    const trust = this.graph.getSkillTrust(skillId);
    const allThreats = this.graph.getThreats(undefined, 'low');
    const recentThreats = allThreats.filter(
      t => t.details.skillId === skillId
    );

    const matchingSignatures: ThreatSignature[] = [];
    if (trust?.behavioralFingerprint) {
      for (const sig of this.signatures.values()) {
        if (sig.pattern && trust.behavioralFingerprint.includes(sig.signatureId)) {
          matchingSignatures.push(sig);
        }
      }
    }

    return { trust, recentThreats, matchingSignatures };
  }

  /**
   * Export signatures for community threat feed sharing.
   */
  exportSignatures(): string {
    const exportable = Array.from(this.signatures.values()).map(sig => ({
      signatureId: sig.signatureId,
      name: sig.name,
      description: sig.description,
      pattern: sig.pattern,
      category: sig.category,
      severity: sig.severity,
      hitCount: sig.hitCount,
    }));
    return JSON.stringify(exportable, null, 2);
  }

  /**
   * Import signatures from community threat feed.
   */
  importSignatures(json: string): number {
    const imported = JSON.parse(json) as ThreatSignature[];
    let count = 0;
    for (const sig of imported) {
      if (!this.signatures.has(sig.signatureId)) {
        this.signatures.set(sig.signatureId, {
          ...sig,
          createdAt: sig.createdAt || new Date().toISOString(),
          hitCount: 0,
        });
        count++;
      }
    }
    return count;
  }

  // ─── Private ──────────────────────────────────────────────────

  private calculateTrustAfterThreat(
    current: SkillTrust['trustLevel'],
    threat: ThreatLevel,
    totalThreats: number
  ): SkillTrust['trustLevel'] {
    // Critical threats always downgrade to untrusted
    if (threat === 'critical') return 'untrusted';

    // High threats downgrade one level
    if (threat === 'high') {
      const levels: SkillTrust['trustLevel'][] = ['untrusted', 'unknown', 'community', 'verified', 'certified'];
      const idx = levels.indexOf(current);
      return idx > 0 ? levels[idx - 1] : 'untrusted';
    }

    // Multiple medium threats degrade trust
    if (totalThreats >= 3 && current !== 'untrusted') {
      return 'unknown';
    }

    return current;
  }

  private loadBuiltinSignatures(): void {
    const builtins: Omit<ThreatSignature, 'createdAt' | 'hitCount'>[] = [
      {
        signatureId: 'SIG_EXFIL_BASE64',
        name: 'Base64 Data Exfiltration',
        description: 'Large base64-encoded data in outbound request, likely data exfiltration',
        pattern: 'base64=[A-Za-z0-9+/=]{100,}',
        category: 'network',
        severity: 'critical',
      },
      {
        signatureId: 'SIG_CRED_LEAK',
        name: 'Credential Leakage',
        description: 'Credentials or tokens detected in outbound traffic',
        pattern: '(password|secret|token|api_key|apikey|auth)\\s*[=:]\\s*\\S{8,}',
        category: 'network',
        severity: 'critical',
      },
      {
        signatureId: 'SIG_SSH_ACCESS',
        name: 'SSH Key Access',
        description: 'Agent attempted to access SSH keys or config',
        pattern: '\\.ssh[\\\\/](id_rsa|id_ed25519|authorized_keys|config)',
        category: 'filesystem',
        severity: 'critical',
      },
      {
        signatureId: 'SIG_REVERSE_SHELL',
        name: 'Reverse Shell',
        description: 'Pattern consistent with reverse shell attempt',
        pattern: '(nc|ncat|socat|bash -i).*\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}',
        category: 'process',
        severity: 'critical',
      },
      {
        signatureId: 'SIG_DESTRUCTIVE_CMD',
        name: 'Destructive Command',
        description: 'Potentially destructive system command detected',
        pattern: '(rm\\s+-rf\\s+/|mkfs|dd\\s+if=|format\\s+c:)',
        category: 'process',
        severity: 'critical',
      },
      {
        signatureId: 'SIG_PROMPT_INJECTION',
        name: 'Prompt Injection Artifact',
        description: 'Behavior consistent with prompt injection (unexpected tool calls or role changes)',
        pattern: '(ignore previous|disregard|you are now|new instructions|system prompt)',
        category: 'behavioral',
        severity: 'high',
      },
      {
        signatureId: 'SIG_COST_BOMB',
        name: 'Cost Bomb',
        description: 'Sudden massive token usage spike, possible attack cover traffic',
        pattern: 'spikeMultiplier.*(\\d{2,})',
        category: 'cost',
        severity: 'high',
      },
      {
        signatureId: 'SIG_CVE_2026_25253',
        name: 'CVE-2026-25253 WebSocket Hijack',
        description: 'Gateway URL manipulation consistent with CVE-2026-25253 exploit chain',
        pattern: 'gatewayUrl.*ws(s)?://(?!localhost|127\\.0\\.0\\.1)',
        category: 'network',
        severity: 'critical',
      },
      {
        signatureId: 'SIG_CLAWHAVOC',
        name: 'ClawHavoc Supply Chain',
        description: 'Behavioral pattern matching ClawHavoc malicious skill campaign',
        pattern: '(eval\\(atob|Function\\(|exec\\(.*decode)',
        category: 'behavioral',
        severity: 'critical',
      },
    ];

    for (const sig of builtins) {
      this.registerSignature(sig);
    }
  }
}
