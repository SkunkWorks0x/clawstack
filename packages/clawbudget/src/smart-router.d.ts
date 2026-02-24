/**
 * Smart Router — Automatic model selection by task complexity
 *
 * The insight: 60-70% of agent API calls are simple tasks that don't need
 * Opus at $5/$25 per M tokens. Route them to Haiku at $1/$5 and save 80%.
 *
 * Classification heuristics:
 * - Simple: short prompts, lookup keywords, no tool use → Haiku ($0.001/call)
 * - Medium: moderate prompts, summarize/draft, some tools → Sonnet ($0.01/call)
 * - Complex: long prompts, refactor/architect keywords, many tools → Opus ($0.15/call)
 *
 * Records all routing decisions in Session Graph via routed_by and original_model fields.
 */
import type { ModelTier } from '@clawstack/shared';
export type TaskComplexity = 'simple' | 'medium' | 'complex';
export interface RoutingInput {
    prompt: string;
    toolCount?: number;
    hasCodeContext?: boolean;
    hasImages?: boolean;
    requestedModel?: string;
}
export interface RoutingDecision {
    complexity: TaskComplexity;
    recommendedTier: ModelTier;
    recommendedModel: string;
    originalModel: string | null;
    wasRouted: boolean;
    reason: string;
    estimatedSavings: number;
    signals: ComplexitySignals;
}
export interface ComplexitySignals {
    promptTokenEstimate: number;
    keywordScore: number;
    toolScore: number;
    codeScore: number;
    totalScore: number;
}
export declare class SmartRouter {
    private complexityThresholds;
    private enabled;
    constructor(opts?: {
        simpleThreshold?: number;
        complexThreshold?: number;
        enabled?: boolean;
    });
    /**
     * Classify a task and recommend the optimal model.
     */
    route(input: RoutingInput): RoutingDecision;
    /**
     * Get complexity classification without routing.
     */
    classify(prompt: string): TaskComplexity;
    /**
     * Enable/disable routing (disabled = always use requested model).
     */
    setEnabled(enabled: boolean): void;
    isEnabled(): boolean;
    private analyzeComplexity;
    private scoreToComplexity;
    private calculateSavings;
    private buildReason;
}
//# sourceMappingURL=smart-router.d.ts.map