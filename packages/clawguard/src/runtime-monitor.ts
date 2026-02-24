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

import type { SessionGraph, BehaviorEvent, EventBus, ThreatLevel } from '@clawstack/shared';
import { createEvent } from '@clawstack/shared';
import { PolicyEngine } from './policy-engine.js';
import { KillSwitch } from './kill-switch.js';
import { ThreatIntel } from './threat-intel.js';
import type {
  ThreatDetection,
  NetworkRequestDetails,
  FileAccessDetails,
  ProcessSpawnDetails,
  CostAnomalyDetails,
  SecurityPolicy,
} from './types.js';

export interface MonitorConfig {
  policy?: Partial<SecurityPolicy>;
  autoKill?: boolean;
}

export class RuntimeMonitor {
  private graph: SessionGraph;
  private bus: EventBus;
  private policyEngine: PolicyEngine;
  private killSwitch: KillSwitch;
  private threatIntel: ThreatIntel;
  private autoKill: boolean;
  private costHistory: Map<string, { timestamp: number; tokens: number }[]> = new Map();

  constructor(graph: SessionGraph, bus: EventBus, config?: MonitorConfig) {
    this.graph = graph;
    this.bus = bus;
    this.policyEngine = new PolicyEngine(config?.policy);
    this.killSwitch = new KillSwitch(graph, bus);
    this.threatIntel = new ThreatIntel(graph);
    this.autoKill = config?.autoKill ?? true;
  }

  getPolicyEngine(): PolicyEngine {
    return this.policyEngine;
  }

  getKillSwitch(): KillSwitch {
    return this.killSwitch;
  }

  getThreatIntel(): ThreatIntel {
    return this.threatIntel;
  }

  // ─── Behavior Interception ────────────────────────────────────

  /**
   * Intercept and evaluate a network request.
   */
  async interceptNetworkRequest(
    sessionId: string,
    agentId: string,
    details: NetworkRequestDetails
  ): Promise<{ allowed: boolean; event: BehaviorEvent; detection: ThreatDetection | null }> {
    const detection = this.policyEngine.evaluateNetworkRequest(details);
    const sigMatches = this.threatIntel.matchSignatures({
      eventId: '',
      sessionId,
      agentId,
      eventType: 'network_request',
      timestamp: '',
      details: { ...details },
      threatLevel: detection?.threatLevel ?? 'none',
      threatSignature: detection?.threatSignature ?? null,
      blocked: detection?.blocked ?? false,
    });

    // Upgrade threat level if signature matches are more severe
    const finalDetection = this.upgradeFromSignatures(detection, sigMatches);

    const event = this.graph.recordBehavior({
      sessionId,
      agentId,
      eventType: 'network_request',
      details: { ...details },
      threatLevel: finalDetection?.threatLevel ?? 'none',
      threatSignature: finalDetection?.threatSignature ?? null,
      blocked: finalDetection?.blocked ?? false,
    });

    if (finalDetection) {
      await this.handleDetection(sessionId, agentId, event, finalDetection);
    }

    return {
      allowed: !finalDetection?.blocked,
      event,
      detection: finalDetection,
    };
  }

  /**
   * Intercept and evaluate a file system access.
   */
  async interceptFileAccess(
    sessionId: string,
    agentId: string,
    details: FileAccessDetails
  ): Promise<{ allowed: boolean; event: BehaviorEvent; detection: ThreatDetection | null }> {
    const detection = this.policyEngine.evaluateFileAccess(details);

    const event = this.graph.recordBehavior({
      sessionId,
      agentId,
      eventType: 'file_access',
      details: { ...details },
      threatLevel: detection?.threatLevel ?? 'none',
      threatSignature: detection?.threatSignature ?? null,
      blocked: detection?.blocked ?? false,
    });

    if (detection) {
      await this.handleDetection(sessionId, agentId, event, detection);
    }

    return {
      allowed: !detection?.blocked,
      event,
      detection,
    };
  }

  /**
   * Intercept and evaluate a process spawn.
   */
  async interceptProcessSpawn(
    sessionId: string,
    agentId: string,
    details: ProcessSpawnDetails
  ): Promise<{ allowed: boolean; event: BehaviorEvent; detection: ThreatDetection | null }> {
    const detection = this.policyEngine.evaluateProcessSpawn(details);

    const event = this.graph.recordBehavior({
      sessionId,
      agentId,
      eventType: 'process_spawn',
      details: { ...details },
      threatLevel: detection?.threatLevel ?? 'none',
      threatSignature: detection?.threatSignature ?? null,
      blocked: detection?.blocked ?? false,
    });

    if (detection) {
      await this.handleDetection(sessionId, agentId, event, detection);
    }

    return {
      allowed: !detection?.blocked,
      event,
      detection,
    };
  }

  /**
   * Intercept and evaluate token/cost anomalies.
   */
  async interceptCostEvent(
    sessionId: string,
    agentId: string,
    tokens: number
  ): Promise<{ anomaly: boolean; event: BehaviorEvent; detection: ThreatDetection | null }> {
    // Track cost history for spike detection
    const now = Date.now();
    const windowMs = this.policyEngine.getPolicy().costAnomaly.windowSizeMs;

    if (!this.costHistory.has(sessionId)) {
      this.costHistory.set(sessionId, []);
    }
    const history = this.costHistory.get(sessionId)!;
    history.push({ timestamp: now, tokens });

    // Prune entries outside window
    const cutoff = now - windowMs;
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift();
    }

    // Calculate average and spike
    const totalTokens = history.reduce((sum, h) => sum + h.tokens, 0);
    const avgTokens = history.length > 1
      ? (totalTokens - tokens) / (history.length - 1)
      : tokens;
    const spikeMultiplier = avgTokens > 0 ? tokens / avgTokens : 1;

    const anomalyDetails: CostAnomalyDetails = {
      currentTokens: tokens,
      averageTokens: avgTokens,
      spikeMultiplier,
      windowMs,
    };

    const detection = this.policyEngine.evaluateCostAnomaly(anomalyDetails);

    const event = this.graph.recordBehavior({
      sessionId,
      agentId,
      eventType: 'tool_call',
      details: { ...anomalyDetails, type: 'cost_anomaly' },
      threatLevel: detection?.threatLevel ?? 'none',
      threatSignature: detection?.threatSignature ?? null,
      blocked: detection?.blocked ?? false,
    });

    if (detection) {
      await this.handleDetection(sessionId, agentId, event, detection);
    }

    return {
      anomaly: detection !== null,
      event,
      detection,
    };
  }

  // ─── Internal ─────────────────────────────────────────────────

  private async handleDetection(
    sessionId: string,
    agentId: string,
    event: BehaviorEvent,
    detection: ThreatDetection
  ): Promise<void> {
    // Emit behavior.detected on Event Bus
    await this.bus.emit(createEvent(
      'behavior.detected',
      'clawguard',
      {
        eventId: event.eventId,
        eventType: detection.eventType,
        threatLevel: detection.threatLevel,
        threatSignature: detection.threatSignature,
        description: detection.description,
        blocked: detection.blocked,
      },
      { sessionId, agentId }
    ));

    // If blocked, also emit behavior.blocked
    if (detection.blocked) {
      await this.bus.emit(createEvent(
        'behavior.blocked',
        'clawguard',
        {
          eventId: event.eventId,
          eventType: detection.eventType,
          threatLevel: detection.threatLevel,
          threatSignature: detection.threatSignature,
          description: detection.description,
        },
        { sessionId, agentId }
      ));
    }

    // Record skill threat if skill info is available
    if (event.details.skillId) {
      this.threatIntel.recordSkillThreat(event.details.skillId as string, event);
    }

    // Auto-kill on critical threats
    if (this.autoKill && detection.threatLevel === 'critical') {
      await this.killSwitch.kill(
        sessionId,
        agentId,
        event,
        detection.description
      );
    }
  }

  private upgradeFromSignatures(
    detection: ThreatDetection | null,
    sigMatches: { severity: ThreatLevel }[]
  ): ThreatDetection | null {
    if (sigMatches.length === 0) return detection;

    const levels: ThreatLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
    const maxSigLevel = sigMatches.reduce((max, sig) => {
      const sigIdx = levels.indexOf(sig.severity);
      const maxIdx = levels.indexOf(max);
      return sigIdx > maxIdx ? sig.severity : max;
    }, 'none' as ThreatLevel);

    if (!detection) {
      // Signature matched but policy didn't catch it
      return {
        eventType: 'network_request',
        threatLevel: maxSigLevel,
        threatSignature: 'SIG_MATCH',
        description: `Matched ${sigMatches.length} threat signature(s)`,
        evidence: { signatureCount: sigMatches.length },
        blocked: levels.indexOf(maxSigLevel) >= levels.indexOf('high'),
      };
    }

    // Upgrade if signature is more severe
    const detIdx = levels.indexOf(detection.threatLevel);
    const sigIdx = levels.indexOf(maxSigLevel);
    if (sigIdx > detIdx) {
      return {
        ...detection,
        threatLevel: maxSigLevel,
        blocked: detection.blocked || sigIdx >= levels.indexOf('high'),
      };
    }

    return detection;
  }
}
