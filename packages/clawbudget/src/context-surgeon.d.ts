/**
 * Context Surgeon — Detect and prune bloated sessions
 *
 * The problem: OpenClaw sends 170K+ tokens per request, including full
 * conversation history, personality files, and stale tool outputs.
 * Users report Slack messages from 3 days ago still in context.
 *
 * Context Surgeon analyzes token distribution and recommends pruning:
 * - Flag sessions where tool outputs exceed 50% of total tokens
 * - Detect stale context (old messages still being replayed)
 * - Recommend pruning actions with estimated token savings
 * - Track context size over time per session
 */
export interface MessageProfile {
    role: 'system' | 'user' | 'assistant' | 'tool';
    tokens: number;
    timestamp?: string;
    toolName?: string;
    contentPreview?: string;
}
export interface SessionContextAnalysis {
    sessionId: string;
    totalTokens: number;
    messageCount: number;
    breakdown: {
        system: number;
        user: number;
        assistant: number;
        tool: number;
    };
    toolOutputPct: number;
    issues: ContextIssue[];
    recommendations: PruneRecommendation[];
    estimatedSavings: number;
}
export interface ContextIssue {
    type: 'tool_bloat' | 'stale_context' | 'duplicate_content' | 'oversized_message';
    severity: 'low' | 'medium' | 'high';
    description: string;
    tokenCost: number;
}
export interface PruneRecommendation {
    action: 'remove_old_tool_outputs' | 'summarize_conversation' | 'remove_stale_messages' | 'truncate_large_outputs';
    description: string;
    estimatedSavings: number;
    estimatedCostSavings: number;
}
export interface ContextSnapshot {
    sessionId: string;
    timestamp: string;
    totalTokens: number;
    messageCount: number;
}
export declare class ContextSurgeon {
    private static readonly STALE_HOURS;
    private static readonly TOOL_BLOAT_THRESHOLD;
    private static readonly OVERSIZED_MESSAGE_TOKENS;
    private static readonly TYPICAL_COST_PER_M_INPUT;
    private snapshots;
    /**
     * Analyze the token distribution of a session's context window.
     */
    analyze(sessionId: string, messages: MessageProfile[]): SessionContextAnalysis;
    /**
     * Get context size history for a session.
     */
    getHistory(sessionId: string): ContextSnapshot[];
    /**
     * Detect context growth trend for a session.
     */
    getGrowthRate(sessionId: string): {
        tokensPerMessage: number;
        trend: 'growing' | 'stable' | 'shrinking';
    } | null;
    private recordSnapshot;
}
//# sourceMappingURL=context-surgeon.d.ts.map