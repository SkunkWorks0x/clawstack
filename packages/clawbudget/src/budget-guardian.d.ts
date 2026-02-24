/**
 * Budget Guardian — Hard spending limits that actually stop execution
 *
 * The #1 pain point: agents burning $200/day with no kill switch.
 * Budget Guardian enforces per-session, per-day, per-month caps.
 * When a limit is hit, the session is terminated immediately.
 *
 * Integration:
 * - Reads/writes budget_configs and cost_records via SessionGraph
 * - Emits cost.recorded, cost.limit_warning, cost.limit_exceeded on EventBus
 * - Subscribes to behavior.blocked from ClawGuard for cost anomaly correlation
 */
import type { SessionGraph, EventBus, CostRecord, BudgetConfig } from '@clawstack/shared';
export interface CostInput {
    sessionId: string;
    agentId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    thinkingTokens?: number;
    routedBy?: 'user' | 'smart_router';
    originalModel?: string | null;
}
export interface BudgetCheckResult {
    allowed: boolean;
    costRecord: CostRecord;
    warnings: string[];
    limitExceeded: 'session' | 'daily' | 'monthly' | null;
    sessionCostUsd: number;
    dailyCostUsd: number;
    monthlyCostUsd: number;
}
export interface CostAnomaly {
    agentId: string;
    sessionId: string | null;
    type: 'blocked_with_high_cost' | 'cost_spike';
    description: string;
    costUsd: number;
    timestamp: string;
}
export declare class BudgetGuardian {
    private graph;
    private bus;
    private anomalies;
    private unsubscribers;
    constructor(graph: SessionGraph, bus: EventBus);
    /**
     * Record an API call's cost and enforce budget limits.
     * Returns whether the call is allowed to proceed.
     */
    recordAndCheck(input: CostInput): Promise<BudgetCheckResult>;
    /**
     * Configure budget limits for an agent.
     */
    setBudget(config: BudgetConfig): void;
    /**
     * Get current spend summary for an agent/session.
     */
    getSpendSummary(agentId: string, sessionId?: string): {
        session: {
            costUsd: number;
            tokens: number;
            calls: number;
        } | null;
        daily: {
            costUsd: number;
            tokens: number;
            calls: number;
        };
        monthly: number;
        budget: BudgetConfig | null;
    };
    /**
     * Get recorded cost anomalies (from ClawGuard correlation).
     */
    getAnomalies(): CostAnomaly[];
    /**
     * Clean up subscriptions.
     */
    destroy(): void;
    private getMonthlyCost;
    /**
     * Subscribe to ClawGuard's behavior.blocked events to correlate
     * security blocks with cost anomalies.
     */
    private subscribeToGuardEvents;
}
//# sourceMappingURL=budget-guardian.d.ts.map