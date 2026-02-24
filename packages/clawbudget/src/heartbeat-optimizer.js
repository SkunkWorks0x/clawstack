"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeartbeatOptimizer = void 0;
class HeartbeatOptimizer {
    callHistory = new Map();
    windowMs;
    /**
     * @param windowMs Time window to analyze for patterns (default: 24 hours)
     */
    constructor(windowMs = 24 * 60 * 60 * 1000) {
        this.windowMs = windowMs;
    }
    /**
     * Record an API call for pattern detection.
     */
    recordCall(call) {
        if (!this.callHistory.has(call.promptHash)) {
            this.callHistory.set(call.promptHash, []);
        }
        this.callHistory.get(call.promptHash).push(call);
        // Prune old records outside window
        this.pruneOldRecords(call.promptHash);
    }
    /**
     * Detect repeated polling patterns.
     */
    detectPatterns() {
        const patterns = [];
        for (const [hash, calls] of this.callHistory) {
            if (calls.length < 3)
                continue; // need at least 3 calls to detect a pattern
            const intervals = [];
            for (let i = 1; i < calls.length; i++) {
                const interval = new Date(calls[i].timestamp).getTime() - new Date(calls[i - 1].timestamp).getTime();
                intervals.push(interval);
            }
            const avgIntervalMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            // Check if intervals are roughly consistent (within 2x of average)
            const isRegular = intervals.every(i => i > avgIntervalMs * 0.3 && i < avgIntervalMs * 3);
            if (!isRegular)
                continue;
            const totalCostUsd = calls.reduce((sum, c) => sum + c.costUsd, 0);
            const totalTokens = calls.reduce((sum, c) => sum + c.inputTokens + c.outputTokens, 0);
            const unchangedResponses = calls.filter(c => !c.responseChanged).length;
            const changedResponses = calls.filter(c => c.responseChanged).length;
            patterns.push({
                promptHash: hash,
                callCount: calls.length,
                totalCostUsd,
                totalTokens,
                avgIntervalMs,
                unchangedResponses,
                changedResponses,
                wasteRatio: calls.length > 0 ? unchangedResponses / calls.length : 0,
                firstSeen: calls[0].timestamp,
                lastSeen: calls[calls.length - 1].timestamp,
            });
        }
        // Sort by total cost descending (biggest waste first)
        return patterns.sort((a, b) => b.totalCostUsd - a.totalCostUsd);
    }
    /**
     * Generate optimization recommendations for detected patterns.
     */
    recommend() {
        const patterns = this.detectPatterns();
        const recommendations = [];
        for (const pattern of patterns) {
            if (pattern.wasteRatio < 0.3)
                continue; // less than 30% waste, not worth optimizing
            const currentCallsPerDay = (24 * 60 * 60 * 1000) / pattern.avgIntervalMs;
            const avgCostPerCall = pattern.totalCostUsd / pattern.callCount;
            const currentCostPerDay = currentCallsPerDay * avgCostPerCall;
            // Recommend interval based on change frequency
            let recommendedIntervalMs;
            let reason;
            if (pattern.changedResponses === 0) {
                // Never changes — dramatically reduce frequency
                recommendedIntervalMs = Math.max(pattern.avgIntervalMs * 6, 4 * 60 * 60 * 1000); // at least 4 hours
                reason = 'Response never changed in observation window — polling is pure waste';
            }
            else {
                // Calculate optimal interval: time between actual changes
                const changeRate = pattern.changedResponses / pattern.callCount;
                const effectiveInterval = pattern.avgIntervalMs / changeRate;
                // Don't go below 2x current interval even if changes are frequent
                recommendedIntervalMs = Math.max(effectiveInterval * 0.8, pattern.avgIntervalMs * 2);
                reason = `Only ${(changeRate * 100).toFixed(0)}% of polls detected changes`;
            }
            const recommendedCallsPerDay = (24 * 60 * 60 * 1000) / recommendedIntervalMs;
            const projectedCostPerDay = recommendedCallsPerDay * avgCostPerCall;
            const dailySavings = currentCostPerDay - projectedCostPerDay;
            recommendations.push({
                promptHash: pattern.promptHash,
                currentIntervalMs: pattern.avgIntervalMs,
                recommendedIntervalMs,
                currentCostPerDay,
                projectedCostPerDay,
                dailySavings,
                monthlySavings: dailySavings * 30,
                reason,
            });
        }
        // Sort by daily savings descending
        return recommendations.sort((a, b) => b.dailySavings - a.dailySavings);
    }
    /**
     * Calculate total savings potential across all detected patterns.
     */
    totalSavingsPotential() {
        const recs = this.recommend();
        const dailySavings = recs.reduce((sum, r) => sum + r.dailySavings, 0);
        return {
            dailySavings,
            monthlySavings: dailySavings * 30,
            patternCount: recs.length,
        };
    }
    /**
     * Clear all recorded call history.
     */
    clear() {
        this.callHistory.clear();
    }
    pruneOldRecords(hash) {
        const calls = this.callHistory.get(hash);
        if (!calls)
            return;
        const cutoff = Date.now() - this.windowMs;
        const pruned = calls.filter(c => new Date(c.timestamp).getTime() >= cutoff);
        this.callHistory.set(hash, pruned);
    }
}
exports.HeartbeatOptimizer = HeartbeatOptimizer;
//# sourceMappingURL=heartbeat-optimizer.js.map