/**
 * Graceful Compaction — Never Lose Knowledge Again
 *
 * Before context compaction destroys knowledge:
 * 1. Scan current context for extractable facts
 * 2. Write durable facts to knowledge graph
 * 3. After compaction, inject critical memories back from the graph
 *
 * Net result: compaction no longer destroys learned knowledge.
 *
 * Inspired by Cognee's ECL pipeline: Extract → Cognify → Load.
 * Adapted for ClawStack's context lifecycle.
 */
import { SessionGraph, EventBus } from '@clawstack/shared';
import type { CompactionInput, CompactionResult, InjectionOptions, RecallResult } from './types.js';
export declare class GracefulCompaction {
    private graph;
    private bus;
    private capture;
    private recall;
    constructor(graph: SessionGraph, bus: EventBus);
    /**
     * Pre-compaction: extract all knowledge from context before it's destroyed.
     *
     * Call this BEFORE context compaction happens.
     * Returns extracted facts + the entities ready to inject after compaction.
     */
    beforeCompaction(input: CompactionInput): Promise<CompactionResult>;
    /**
     * Post-compaction: inject critical memories back into context.
     *
     * Call this AFTER context compaction has happened.
     * Returns memories formatted for context injection within the token budget.
     */
    afterCompaction(options: InjectionOptions): Promise<RecallResult>;
    /**
     * Format recalled memories for context injection.
     * Returns a structured text block suitable for inserting into agent context.
     */
    formatForInjection(result: RecallResult): string;
    /**
     * Full compaction cycle: extract → store → recall → format.
     * Convenience method that runs the complete pre+post flow.
     */
    compactionCycle(input: CompactionInput, injectionBudget: number): Promise<{
        compaction: CompactionResult;
        injection: RecallResult;
        formatted: string;
    }>;
}
//# sourceMappingURL=graceful-compaction.d.ts.map