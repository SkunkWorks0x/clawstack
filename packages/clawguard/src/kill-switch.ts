/**
 * ClawGuard Kill Switch — Emergency Session Termination
 *
 * When threat level hits critical:
 * 1. Terminate the agent session immediately
 * 2. Log the full event chain that triggered it
 * 3. Emit behavior.blocked on the Event Bus
 * 4. Record in Session Graph with threat signature
 */

import type { SessionGraph, BehaviorEvent, EventBus } from '@clawstack/shared';
import { createEvent } from '@clawstack/shared';
import type { KillSwitchResult } from './types.js';

export class KillSwitch {
  private graph: SessionGraph;
  private bus: EventBus;

  constructor(graph: SessionGraph, bus: EventBus) {
    this.graph = graph;
    this.bus = bus;
  }

  /**
   * Evaluate whether a session should be killed based on recent threats.
   * Returns true if kill was triggered.
   */
  async evaluate(sessionId: string, agentId: string): Promise<KillSwitchResult | null> {
    const threats = this.graph.getThreats(sessionId, 'critical');

    if (threats.length === 0) return null;

    // Get full event chain for this session (all threats, not just critical)
    const eventChain = this.graph.getThreats(sessionId, 'low');

    const reason = this.buildKillReason(threats);

    return this.execute(sessionId, agentId, reason, eventChain);
  }

  /**
   * Immediately kill a session. Called when a critical threat is detected in real-time.
   */
  async kill(
    sessionId: string,
    agentId: string,
    triggerEvent: BehaviorEvent,
    reason: string
  ): Promise<KillSwitchResult> {
    // Get full event chain leading to this kill
    const eventChain = this.graph.getThreats(sessionId, 'low');
    eventChain.unshift(triggerEvent);

    return this.execute(sessionId, agentId, reason, eventChain);
  }

  private async execute(
    sessionId: string,
    agentId: string,
    reason: string,
    eventChain: BehaviorEvent[]
  ): Promise<KillSwitchResult> {
    const timestamp = new Date().toISOString();

    // 1. Terminate the session in the Session Graph
    this.graph.endSession(sessionId, 'terminated');

    // 2. Record the kill event itself as a behavior event
    this.graph.recordBehavior({
      sessionId,
      agentId,
      eventType: 'tool_call',
      details: {
        action: 'kill_switch_triggered',
        reason,
        eventChainLength: eventChain.length,
        criticalEvents: eventChain.filter(e => e.threatLevel === 'critical').length,
      },
      threatLevel: 'critical',
      threatSignature: 'KILL_SWITCH',
      blocked: true,
    });

    // 3. Emit behavior.blocked on the Event Bus
    await this.bus.emit(createEvent(
      'behavior.blocked',
      'clawguard',
      {
        action: 'kill_switch',
        sessionId,
        agentId,
        reason,
        eventChainLength: eventChain.length,
        timestamp,
      },
      { sessionId, agentId }
    ));

    return {
      sessionId,
      agentId,
      terminated: true,
      reason,
      eventChain,
      timestamp,
    };
  }

  private buildKillReason(threats: BehaviorEvent[]): string {
    const signatures = threats
      .map(t => t.threatSignature)
      .filter(Boolean);

    const uniqueSigs = [...new Set(signatures)];

    if (uniqueSigs.length === 0) {
      return `Kill switch triggered: ${threats.length} critical threat(s) detected`;
    }

    return `Kill switch triggered: ${uniqueSigs.join(', ')} (${threats.length} critical event(s))`;
  }
}
