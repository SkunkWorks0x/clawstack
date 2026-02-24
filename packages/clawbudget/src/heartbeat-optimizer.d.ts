/**
 * Heartbeat Optimizer — Convert expensive polling to lightweight checks
 *
 * The problem: OpenClaw's Heartbeat feature sends 170K-210K tokens per poll.
 * At 30-min intervals, one user spent $18.75 overnight on idle checks.
 * At 15-min intervals with Opus, polling alone costs $200+/day.
 *
 * The fix: Detect repeated identical API calls, calculate waste, and
 * recommend optimal polling intervals.
 *
 * This is pure money printing for ClawBudget Pro users.
 */
export interface ApiCallRecord {
    timestamp: string;
    promptHash: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    responseChanged: boolean;
}
export interface PollingPattern {
    promptHash: string;
    callCount: number;
    totalCostUsd: number;
    totalTokens: number;
    avgIntervalMs: number;
    unchangedResponses: number;
    changedResponses: number;
    wasteRatio: number;
    firstSeen: string;
    lastSeen: string;
}
export interface OptimizationRecommendation {
    promptHash: string;
    currentIntervalMs: number;
    recommendedIntervalMs: number;
    currentCostPerDay: number;
    projectedCostPerDay: number;
    dailySavings: number;
    monthlySavings: number;
    reason: string;
}
export declare class HeartbeatOptimizer {
    private callHistory;
    private windowMs;
    /**
     * @param windowMs Time window to analyze for patterns (default: 24 hours)
     */
    constructor(windowMs?: number);
    /**
     * Record an API call for pattern detection.
     */
    recordCall(call: ApiCallRecord): void;
    /**
     * Detect repeated polling patterns.
     */
    detectPatterns(): PollingPattern[];
    /**
     * Generate optimization recommendations for detected patterns.
     */
    recommend(): OptimizationRecommendation[];
    /**
     * Calculate total savings potential across all detected patterns.
     */
    totalSavingsPotential(): {
        dailySavings: number;
        monthlySavings: number;
        patternCount: number;
    };
    /**
     * Clear all recorded call history.
     */
    clear(): void;
    private pruneOldRecords;
}
//# sourceMappingURL=heartbeat-optimizer.d.ts.map