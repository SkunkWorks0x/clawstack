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
  timestamp?: string; // ISO 8601
  toolName?: string;
  contentPreview?: string; // first 100 chars
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
  estimatedSavings: number; // tokens that could be saved
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
  estimatedSavings: number; // tokens
  estimatedCostSavings: number; // USD per request (at typical rates)
}

export interface ContextSnapshot {
  sessionId: string;
  timestamp: string;
  totalTokens: number;
  messageCount: number;
}

export class ContextSurgeon {
  private static readonly STALE_HOURS = 24;
  private static readonly TOOL_BLOAT_THRESHOLD = 0.50; // 50%
  private static readonly OVERSIZED_MESSAGE_TOKENS = 10_000;
  private static readonly TYPICAL_COST_PER_M_INPUT = 3.0; // Sonnet rate for savings estimate

  private snapshots: Map<string, ContextSnapshot[]> = new Map();

  /**
   * Analyze the token distribution of a session's context window.
   */
  analyze(sessionId: string, messages: MessageProfile[]): SessionContextAnalysis {
    const breakdown = { system: 0, user: 0, assistant: 0, tool: 0 };
    let totalTokens = 0;

    for (const msg of messages) {
      totalTokens += msg.tokens;
      breakdown[msg.role] += msg.tokens;
    }

    const toolOutputPct = totalTokens > 0 ? breakdown.tool / totalTokens : 0;
    const issues: ContextIssue[] = [];
    const recommendations: PruneRecommendation[] = [];

    // Check tool output bloat
    if (toolOutputPct > ContextSurgeon.TOOL_BLOAT_THRESHOLD) {
      issues.push({
        type: 'tool_bloat',
        severity: toolOutputPct > 0.7 ? 'high' : 'medium',
        description: `Tool outputs are ${(toolOutputPct * 100).toFixed(0)}% of context (${breakdown.tool.toLocaleString()} tokens)`,
        tokenCost: breakdown.tool,
      });

      const saveable = Math.floor(breakdown.tool * 0.6); // can typically remove 60% of tool outputs
      recommendations.push({
        action: 'remove_old_tool_outputs',
        description: `Remove or summarize old tool outputs to save ~${saveable.toLocaleString()} tokens`,
        estimatedSavings: saveable,
        estimatedCostSavings: (saveable / 1_000_000) * ContextSurgeon.TYPICAL_COST_PER_M_INPUT,
      });
    }

    // Check stale context
    const now = new Date();
    const staleMessages = messages.filter(m => {
      if (!m.timestamp) return false;
      const age = (now.getTime() - new Date(m.timestamp).getTime()) / (1000 * 60 * 60);
      return age > ContextSurgeon.STALE_HOURS;
    });

    if (staleMessages.length > 0) {
      const staleTokens = staleMessages.reduce((sum, m) => sum + m.tokens, 0);
      issues.push({
        type: 'stale_context',
        severity: staleTokens > 50_000 ? 'high' : staleTokens > 10_000 ? 'medium' : 'low',
        description: `${staleMessages.length} messages older than ${ContextSurgeon.STALE_HOURS}h still in context (${staleTokens.toLocaleString()} tokens)`,
        tokenCost: staleTokens,
      });

      recommendations.push({
        action: 'remove_stale_messages',
        description: `Remove ${staleMessages.length} stale messages to save ~${staleTokens.toLocaleString()} tokens`,
        estimatedSavings: staleTokens,
        estimatedCostSavings: (staleTokens / 1_000_000) * ContextSurgeon.TYPICAL_COST_PER_M_INPUT,
      });
    }

    // Check oversized individual messages
    const oversized = messages.filter(m => m.tokens > ContextSurgeon.OVERSIZED_MESSAGE_TOKENS);
    if (oversized.length > 0) {
      const oversizedTokens = oversized.reduce((sum, m) => sum + m.tokens, 0);
      issues.push({
        type: 'oversized_message',
        severity: oversized.some(m => m.tokens > 50_000) ? 'high' : 'medium',
        description: `${oversized.length} messages exceed ${ContextSurgeon.OVERSIZED_MESSAGE_TOKENS.toLocaleString()} tokens each`,
        tokenCost: oversizedTokens,
      });

      const trimmable = Math.floor(oversizedTokens * 0.5);
      recommendations.push({
        action: 'truncate_large_outputs',
        description: `Truncate ${oversized.length} oversized messages to save ~${trimmable.toLocaleString()} tokens`,
        estimatedSavings: trimmable,
        estimatedCostSavings: (trimmable / 1_000_000) * ContextSurgeon.TYPICAL_COST_PER_M_INPUT,
      });
    }

    // Check for long conversation that could be summarized
    if (messages.length > 20 && totalTokens > 50_000) {
      const oldMessages = messages.slice(0, Math.floor(messages.length * 0.6));
      const oldTokens = oldMessages.reduce((sum, m) => sum + m.tokens, 0);
      const summaryTokens = Math.min(2000, Math.floor(oldTokens * 0.1)); // summary is ~10% size
      const savings = oldTokens - summaryTokens;

      recommendations.push({
        action: 'summarize_conversation',
        description: `Summarize first ${oldMessages.length} messages to save ~${savings.toLocaleString()} tokens`,
        estimatedSavings: savings,
        estimatedCostSavings: (savings / 1_000_000) * ContextSurgeon.TYPICAL_COST_PER_M_INPUT,
      });
    }

    const estimatedSavings = recommendations.reduce((sum, r) => sum + r.estimatedSavings, 0);

    // Record snapshot for tracking
    this.recordSnapshot(sessionId, totalTokens, messages.length);

    return {
      sessionId,
      totalTokens,
      messageCount: messages.length,
      breakdown,
      toolOutputPct,
      issues,
      recommendations,
      estimatedSavings,
    };
  }

  /**
   * Get context size history for a session.
   */
  getHistory(sessionId: string): ContextSnapshot[] {
    return this.snapshots.get(sessionId) ?? [];
  }

  /**
   * Detect context growth trend for a session.
   */
  getGrowthRate(sessionId: string): { tokensPerMessage: number; trend: 'growing' | 'stable' | 'shrinking' } | null {
    const history = this.snapshots.get(sessionId);
    if (!history || history.length < 2) return null;

    const first = history[0];
    const last = history[history.length - 1];
    const messageDelta = last.messageCount - first.messageCount;

    if (messageDelta === 0) return { tokensPerMessage: 0, trend: 'stable' };

    const tokensPerMessage = (last.totalTokens - first.totalTokens) / messageDelta;

    let trend: 'growing' | 'stable' | 'shrinking';
    if (tokensPerMessage > 500) trend = 'growing';
    else if (tokensPerMessage < -100) trend = 'shrinking';
    else trend = 'stable';

    return { tokensPerMessage, trend };
  }

  private recordSnapshot(sessionId: string, totalTokens: number, messageCount: number): void {
    if (!this.snapshots.has(sessionId)) {
      this.snapshots.set(sessionId, []);
    }

    this.snapshots.get(sessionId)!.push({
      sessionId,
      timestamp: new Date().toISOString(),
      totalTokens,
      messageCount,
    });
  }
}
