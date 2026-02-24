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

import type { SessionGraph, EventBus, BusEvent, CostRecord, BudgetConfig, ModelTier } from '@clawstack/shared';
import { createEvent } from '@clawstack/shared';
import { estimateCost, classifyModelTier } from './model-pricing.js';

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

export class BudgetGuardian {
  private graph: SessionGraph;
  private bus: EventBus;
  private anomalies: CostAnomaly[] = [];
  private unsubscribers: Array<() => void> = [];

  constructor(graph: SessionGraph, bus: EventBus) {
    this.graph = graph;
    this.bus = bus;
    this.subscribeToGuardEvents();
  }

  /**
   * Record an API call's cost and enforce budget limits.
   * Returns whether the call is allowed to proceed.
   */
  async recordAndCheck(input: CostInput): Promise<BudgetCheckResult> {
    const totalTokens = input.inputTokens + input.outputTokens + (input.thinkingTokens ?? 0);
    const costUsd = estimateCost(input.model, input.inputTokens, input.outputTokens + (input.thinkingTokens ?? 0));
    const modelTier = classifyModelTier(input.model);

    // Write cost record to Session Graph
    const costRecord = this.graph.recordCost({
      sessionId: input.sessionId,
      agentId: input.agentId,
      model: input.model,
      modelTier,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      thinkingTokens: input.thinkingTokens ?? 0,
      totalTokens,
      estimatedCostUsd: costUsd,
      routedBy: input.routedBy ?? 'user',
      originalModel: input.originalModel ?? null,
    });

    // Emit cost.recorded
    await this.bus.emit(createEvent(
      'cost.recorded',
      'clawbudget',
      {
        costId: costRecord.costId,
        model: input.model,
        modelTier,
        tokens: totalTokens,
        costUsd,
      },
      { sessionId: input.sessionId, agentId: input.agentId }
    ));

    // Check budget
    const budget = this.graph.getBudget(input.agentId);
    if (!budget) {
      return {
        allowed: true,
        costRecord,
        warnings: [],
        limitExceeded: null,
        sessionCostUsd: costUsd,
        dailyCostUsd: costUsd,
        monthlyCostUsd: costUsd,
      };
    }

    const sessionCost = this.graph.getSessionCost(input.sessionId);
    const dailyCost = this.graph.getAgentDailyCost(input.agentId);
    const monthlyCost = this.getMonthlyCost(input.agentId);

    const warnings: string[] = [];
    let limitExceeded: 'session' | 'daily' | 'monthly' | null = null;

    // Check alert thresholds (warning before hard stop)
    const thresholdPct = budget.alertThresholdPct / 100;

    if (sessionCost.costUsd >= budget.maxPerSession * thresholdPct && sessionCost.costUsd < budget.maxPerSession) {
      warnings.push(`Session cost $${sessionCost.costUsd.toFixed(2)} reached ${budget.alertThresholdPct}% of $${budget.maxPerSession} limit`);
    }
    if (dailyCost.costUsd >= budget.maxPerDay * thresholdPct && dailyCost.costUsd < budget.maxPerDay) {
      warnings.push(`Daily cost $${dailyCost.costUsd.toFixed(2)} reached ${budget.alertThresholdPct}% of $${budget.maxPerDay} limit`);
    }
    if (monthlyCost >= budget.maxPerMonth * thresholdPct && monthlyCost < budget.maxPerMonth) {
      warnings.push(`Monthly cost $${monthlyCost.toFixed(2)} reached ${budget.alertThresholdPct}% of $${budget.maxPerMonth} limit`);
    }

    // Emit warnings
    if (warnings.length > 0) {
      await this.bus.emit(createEvent(
        'cost.limit_warning',
        'clawbudget',
        { warnings, sessionCostUsd: sessionCost.costUsd, dailyCostUsd: dailyCost.costUsd, monthlyCostUsd: monthlyCost },
        { sessionId: input.sessionId, agentId: input.agentId }
      ));
    }

    // Check hard limits
    if (sessionCost.costUsd >= budget.maxPerSession) {
      limitExceeded = 'session';
    } else if (dailyCost.costUsd >= budget.maxPerDay) {
      limitExceeded = 'daily';
    } else if (monthlyCost >= budget.maxPerMonth) {
      limitExceeded = 'monthly';
    }

    if (limitExceeded) {
      // Terminate session
      this.graph.endSession(input.sessionId, 'terminated');

      await this.bus.emit(createEvent(
        'cost.limit_exceeded',
        'clawbudget',
        {
          limitType: limitExceeded,
          sessionCostUsd: sessionCost.costUsd,
          dailyCostUsd: dailyCost.costUsd,
          monthlyCostUsd: monthlyCost,
          budget: {
            maxPerSession: budget.maxPerSession,
            maxPerDay: budget.maxPerDay,
            maxPerMonth: budget.maxPerMonth,
          },
        },
        { sessionId: input.sessionId, agentId: input.agentId }
      ));
    }

    return {
      allowed: !limitExceeded,
      costRecord,
      warnings,
      limitExceeded,
      sessionCostUsd: sessionCost.costUsd,
      dailyCostUsd: dailyCost.costUsd,
      monthlyCostUsd: monthlyCost,
    };
  }

  /**
   * Configure budget limits for an agent.
   */
  setBudget(config: BudgetConfig): void {
    this.graph.setBudget(config);
  }

  /**
   * Get current spend summary for an agent/session.
   */
  getSpendSummary(agentId: string, sessionId?: string): {
    session: { costUsd: number; tokens: number; calls: number } | null;
    daily: { costUsd: number; tokens: number; calls: number };
    monthly: number;
    budget: BudgetConfig | null;
  } {
    const daily = this.graph.getAgentDailyCost(agentId);
    const monthly = this.getMonthlyCost(agentId);
    const budget = this.graph.getBudget(agentId);
    const session = sessionId ? this.graph.getSessionCost(sessionId) : null;

    return { session, daily, monthly, budget };
  }

  /**
   * Get recorded cost anomalies (from ClawGuard correlation).
   */
  getAnomalies(): CostAnomaly[] {
    return [...this.anomalies];
  }

  /**
   * Clean up subscriptions.
   */
  destroy(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

  // ─── Private ────────────────────────────────────────────────────

  private getMonthlyCost(agentId: string): number {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const row = this.graph.getDb().prepare(`
      SELECT COALESCE(SUM(estimated_cost_usd), 0) as cost
      FROM cost_records WHERE agent_id = ? AND date(timestamp) >= ?
    `).get(agentId, monthStart) as any;
    return row.cost;
  }

  /**
   * Subscribe to ClawGuard's behavior.blocked events to correlate
   * security blocks with cost anomalies.
   */
  private subscribeToGuardEvents(): void {
    const unsub = this.bus.on('behavior.blocked', (event: BusEvent) => {
      if (!event.agentId) return;

      // When ClawGuard blocks an action, check if this agent has high recent cost
      const dailyCost = this.graph.getAgentDailyCost(event.agentId);

      if (dailyCost.costUsd > 0) {
        this.anomalies.push({
          agentId: event.agentId,
          sessionId: event.sessionId,
          type: 'blocked_with_high_cost',
          description: `ClawGuard blocked action for agent with $${dailyCost.costUsd.toFixed(2)} daily spend`,
          costUsd: dailyCost.costUsd,
          timestamp: event.timestamp,
        });
      }
    });

    this.unsubscribers.push(unsub);
  }
}
