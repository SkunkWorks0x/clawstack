/**
 * Model Pricing Database — Feb 2026 rates
 *
 * Source: Anthropic and OpenAI pricing pages.
 * Prices are per million tokens.
 *
 * VERIFIED: Cross-referenced against official docs and community reports.
 * OpenClaw users burning $200+/day primarily due to full context replay
 * and heartbeat polling at 170K+ tokens per check.
 */
import type { ModelTier } from '@clawstack/shared';
export interface ModelPricing {
    model: string;
    tier: ModelTier;
    provider: 'anthropic' | 'openai' | 'google' | 'other';
    inputPerMillion: number;
    outputPerMillion: number;
    contextWindow: number;
}
/**
 * Look up pricing for a model.
 */
export declare function getModelPricing(model: string): ModelPricing | null;
/**
 * Add or override pricing for a model.
 */
export declare function addModelPricing(pricing: ModelPricing): void;
/**
 * Estimate USD cost for a given token usage.
 */
export declare function estimateCost(model: string, inputTokens: number, outputTokens: number): number;
/**
 * Classify a model string to a tier.
 */
export declare function classifyModelTier(model: string): ModelTier;
/**
 * Get the cheapest model for a given tier.
 */
export declare function getCheapestModel(tier: ModelTier): ModelPricing | null;
/**
 * List all known models.
 */
export declare function listModels(): ModelPricing[];
//# sourceMappingURL=model-pricing.d.ts.map