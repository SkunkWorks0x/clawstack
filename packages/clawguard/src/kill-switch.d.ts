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
import type { KillSwitchResult } from './types.js';
export declare class KillSwitch {
    private graph;
    private bus;
    constructor(graph: SessionGraph, bus: EventBus);
    /**
     * Evaluate whether a session should be killed based on recent threats.
     * Returns true if kill was triggered.
     */
    evaluate(sessionId: string, agentId: string): Promise<KillSwitchResult | null>;
    /**
     * Immediately kill a session. Called when a critical threat is detected in real-time.
     */
    kill(sessionId: string, agentId: string, triggerEvent: BehaviorEvent, reason: string): Promise<KillSwitchResult>;
    private execute;
    private buildKillReason;
}
//# sourceMappingURL=kill-switch.d.ts.map