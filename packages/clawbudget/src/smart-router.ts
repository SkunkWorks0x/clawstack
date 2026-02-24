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
import { getCheapestModel, type ModelPricing } from './model-pricing.js';

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
  estimatedSavings: number; // fraction saved vs original (0 to 1)
  signals: ComplexitySignals;
}

export interface ComplexitySignals {
  promptTokenEstimate: number;
  keywordScore: number;
  toolScore: number;
  codeScore: number;
  totalScore: number;
}

// ─── Keyword Sets ─────────────────────────────────────────────────

const SIMPLE_KEYWORDS = new Set([
  'weather', 'time', 'date', 'lookup', 'define', 'translate',
  'convert', 'calculate', 'what is', 'who is', 'when did',
  'how many', 'list', 'find', 'search', 'check', 'status',
  'remind', 'timer', 'alarm', 'note', 'hello', 'hi', 'thanks',
]);

const COMPLEX_KEYWORDS = new Set([
  'refactor', 'architect', 'design', 'implement', 'migrate',
  'optimize', 'debug', 'analyze', 'review', 'rewrite',
  'plan', 'strategy', 'compare', 'evaluate', 'explain why',
  'write a function', 'write a class', 'build', 'create app',
  'fix bug', 'security audit', 'performance', 'benchmark',
]);

// ─── Smart Router ─────────────────────────────────────────────────

export class SmartRouter {
  private complexityThresholds: { simple: number; complex: number };
  private enabled: boolean;

  constructor(opts?: { simpleThreshold?: number; complexThreshold?: number; enabled?: boolean }) {
    this.complexityThresholds = {
      simple: opts?.simpleThreshold ?? 30,
      complex: opts?.complexThreshold ?? 70,
    };
    this.enabled = opts?.enabled ?? true;
  }

  /**
   * Classify a task and recommend the optimal model.
   */
  route(input: RoutingInput): RoutingDecision {
    const signals = this.analyzeComplexity(input);
    const complexity = this.scoreToComplexity(signals.totalScore);
    const tierMap: Record<TaskComplexity, ModelTier> = {
      simple: 'haiku',
      medium: 'sonnet',
      complex: 'opus',
    };
    const recommendedTier = tierMap[complexity];
    const recommendedModelPricing = getCheapestModel(recommendedTier);
    const recommendedModel = recommendedModelPricing?.model ?? `claude-${recommendedTier}-4-5`;

    const wasRouted = this.enabled && !!input.requestedModel && recommendedModel !== input.requestedModel;
    const estimatedSavings = this.calculateSavings(input.requestedModel, recommendedModelPricing);

    return {
      complexity,
      recommendedTier,
      recommendedModel,
      originalModel: wasRouted ? input.requestedModel! : null,
      wasRouted,
      reason: this.buildReason(complexity, signals),
      estimatedSavings: wasRouted ? estimatedSavings : 0,
      signals,
    };
  }

  /**
   * Get complexity classification without routing.
   */
  classify(prompt: string): TaskComplexity {
    const signals = this.analyzeComplexity({ prompt });
    return this.scoreToComplexity(signals.totalScore);
  }

  /**
   * Enable/disable routing (disabled = always use requested model).
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // ─── Private ────────────────────────────────────────────────────

  private analyzeComplexity(input: RoutingInput): ComplexitySignals {
    const prompt = input.prompt.toLowerCase();

    // Estimate token count (~4 chars per token)
    const promptTokenEstimate = Math.ceil(input.prompt.length / 4);

    // Keyword scoring
    let keywordScore = 50; // neutral default
    const words = prompt.split(/\s+/);

    for (const word of words) {
      if (SIMPLE_KEYWORDS.has(word)) keywordScore -= 10;
    }
    // Check multi-word simple patterns
    for (const kw of SIMPLE_KEYWORDS) {
      if (kw.includes(' ') && prompt.includes(kw)) keywordScore -= 15;
    }
    for (const kw of COMPLEX_KEYWORDS) {
      if (prompt.includes(kw)) keywordScore += 15;
    }

    keywordScore = Math.max(0, Math.min(100, keywordScore));

    // Tool usage scoring
    let toolScore = 0;
    if (input.toolCount !== undefined) {
      if (input.toolCount === 0) toolScore = 10;
      else if (input.toolCount <= 2) toolScore = 40;
      else if (input.toolCount <= 5) toolScore = 60;
      else toolScore = 80;
    }

    // Code context scoring
    let codeScore = 0;
    if (input.hasCodeContext) codeScore += 30;
    if (input.hasImages) codeScore += 20;
    // Check for code patterns in prompt
    if (/```[\s\S]*```/.test(input.prompt)) codeScore += 25;
    if (/function\s|class\s|import\s|const\s|let\s|var\s/.test(input.prompt)) codeScore += 15;
    codeScore = Math.min(100, codeScore);

    // Length scoring
    let lengthScore: number;
    if (promptTokenEstimate < 50) lengthScore = 10;
    else if (promptTokenEstimate < 200) lengthScore = 30;
    else if (promptTokenEstimate < 1000) lengthScore = 60;
    else lengthScore = 85;

    // Weighted total
    const totalScore = Math.round(
      keywordScore * 0.35 +
      lengthScore * 0.25 +
      toolScore * 0.20 +
      codeScore * 0.20
    );

    return {
      promptTokenEstimate,
      keywordScore,
      toolScore,
      codeScore,
      totalScore,
    };
  }

  private scoreToComplexity(score: number): TaskComplexity {
    if (score <= this.complexityThresholds.simple) return 'simple';
    if (score >= this.complexityThresholds.complex) return 'complex';
    return 'medium';
  }

  private calculateSavings(
    originalModel: string | undefined,
    recommended: ModelPricing | null
  ): number {
    if (!originalModel || !recommended) return 0;

    // Approximate: compare input price ratios
    const originalPricing = getCheapestModel(
      originalModel.includes('opus') ? 'opus' : originalModel.includes('sonnet') ? 'sonnet' : 'haiku'
    );
    if (!originalPricing) return 0;

    if (originalPricing.inputPerMillion === 0) return 0;
    return Math.max(0, 1 - (recommended.inputPerMillion / originalPricing.inputPerMillion));
  }

  private buildReason(complexity: TaskComplexity, signals: ComplexitySignals): string {
    const parts: string[] = [];

    if (complexity === 'simple') {
      parts.push('Short prompt');
      if (signals.keywordScore < 30) parts.push('lookup/simple keywords detected');
      if (signals.toolScore <= 10) parts.push('no tool usage');
    } else if (complexity === 'complex') {
      if (signals.keywordScore > 70) parts.push('complex task keywords');
      if (signals.promptTokenEstimate > 500) parts.push(`long prompt (~${signals.promptTokenEstimate} tokens)`);
      if (signals.codeScore > 30) parts.push('code context present');
      if (signals.toolScore > 60) parts.push('multiple tools needed');
    } else {
      parts.push('moderate complexity');
    }

    return parts.join(', ') || `score: ${signals.totalScore}`;
  }
}
