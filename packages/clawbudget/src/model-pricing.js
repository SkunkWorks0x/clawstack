"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getModelPricing = getModelPricing;
exports.addModelPricing = addModelPricing;
exports.estimateCost = estimateCost;
exports.classifyModelTier = classifyModelTier;
exports.getCheapestModel = getCheapestModel;
exports.listModels = listModels;
/**
 * Known model pricing as of Feb 2026.
 * Users can extend via addModelPricing().
 */
const PRICING_DB = new Map();
// ─── Anthropic Models ─────────────────────────────────────────────
const anthropicModels = [
    { model: 'claude-haiku-4-5', tier: 'haiku', provider: 'anthropic', inputPerMillion: 1.00, outputPerMillion: 5.00, contextWindow: 200_000 },
    { model: 'claude-sonnet-4-5', tier: 'sonnet', provider: 'anthropic', inputPerMillion: 3.00, outputPerMillion: 15.00, contextWindow: 200_000 },
    { model: 'claude-sonnet-4-6', tier: 'sonnet', provider: 'anthropic', inputPerMillion: 3.00, outputPerMillion: 15.00, contextWindow: 200_000 },
    { model: 'claude-opus-4-5', tier: 'opus', provider: 'anthropic', inputPerMillion: 5.00, outputPerMillion: 25.00, contextWindow: 200_000 },
    { model: 'claude-opus-4-6', tier: 'opus', provider: 'anthropic', inputPerMillion: 5.00, outputPerMillion: 25.00, contextWindow: 200_000 },
];
// ─── OpenAI Models ────────────────────────────────────────────────
const openaiModels = [
    { model: 'gpt-4o', tier: 'sonnet', provider: 'openai', inputPerMillion: 2.50, outputPerMillion: 10.00, contextWindow: 128_000 },
    { model: 'gpt-4o-mini', tier: 'haiku', provider: 'openai', inputPerMillion: 0.15, outputPerMillion: 0.60, contextWindow: 128_000 },
    { model: 'o3', tier: 'opus', provider: 'openai', inputPerMillion: 2.00, outputPerMillion: 8.00, contextWindow: 200_000 },
    { model: 'o3-mini', tier: 'sonnet', provider: 'openai', inputPerMillion: 1.10, outputPerMillion: 4.40, contextWindow: 200_000 },
];
// Initialize pricing DB
for (const m of [...anthropicModels, ...openaiModels]) {
    PRICING_DB.set(m.model, m);
}
/**
 * Look up pricing for a model.
 */
function getModelPricing(model) {
    return PRICING_DB.get(model) ?? null;
}
/**
 * Add or override pricing for a model.
 */
function addModelPricing(pricing) {
    PRICING_DB.set(pricing.model, pricing);
}
/**
 * Estimate USD cost for a given token usage.
 */
function estimateCost(model, inputTokens, outputTokens) {
    const pricing = getModelPricing(model);
    if (!pricing)
        return 0;
    const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
    return inputCost + outputCost;
}
/**
 * Classify a model string to a tier.
 */
function classifyModelTier(model) {
    const pricing = getModelPricing(model);
    if (pricing)
        return pricing.tier;
    // Fallback heuristics for unknown models
    const lower = model.toLowerCase();
    if (lower.includes('haiku') || lower.includes('mini') || lower.includes('flash'))
        return 'haiku';
    if (lower.includes('sonnet') || lower.includes('4o') || lower.includes('pro'))
        return 'sonnet';
    if (lower.includes('opus') || lower.includes('o3') || lower.includes('o1'))
        return 'opus';
    return 'unknown';
}
/**
 * Get the cheapest model for a given tier.
 */
function getCheapestModel(tier) {
    let cheapest = null;
    for (const pricing of PRICING_DB.values()) {
        if (pricing.tier !== tier)
            continue;
        if (!cheapest || pricing.inputPerMillion < cheapest.inputPerMillion) {
            cheapest = pricing;
        }
    }
    return cheapest;
}
/**
 * List all known models.
 */
function listModels() {
    return Array.from(PRICING_DB.values());
}
//# sourceMappingURL=model-pricing.js.map