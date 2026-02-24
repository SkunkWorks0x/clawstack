/**
 * Token-Budgeted Recall — Retrieve ONLY What Fits
 *
 * Given a query and a token budget, returns the most relevant memories
 * ranked by: relevance to query, confidence, recency, access frequency.
 *
 * Hard token cap — never exceeds the budget. Tracks what was recalled
 * and updates access stats for learning over time.
 *
 * Extends SessionGraph's queryMemory with relevance scoring.
 */
import { SessionGraph, EventBus } from '@clawstack/shared';
import type { MemoryEntity } from '@clawstack/shared';
import type { RecallOptions, RecallResult } from './types.js';
export declare class TokenRecall {
    private graph;
    private bus;
    constructor(graph: SessionGraph, bus: EventBus);
    /**
     * Recall memories within a hard token budget.
     *
     * Scoring formula:
     *   score = (relevance × relevanceWeight) + (confidence × confidenceWeight) +
     *           (recency × recencyWeight) + (frequency × frequencyWeight)
     *
     * Where weights are configurable and default to a balanced mix.
     */
    recall(options: RecallOptions): Promise<RecallResult>;
    /**
     * Quick recall: highest-confidence entities within budget, no scoring.
     * Delegates to SessionGraph.queryMemory for backward compatibility.
     */
    quickRecall(agentId: string, workspace: string, tokenBudget: number): MemoryEntity[];
    private mapEntity;
    private mapRelation;
}
//# sourceMappingURL=token-recall.d.ts.map