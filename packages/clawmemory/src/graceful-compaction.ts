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

import { SessionGraph, EventBus, createEvent } from '@clawstack/shared';
import type { MemoryEntity } from '@clawstack/shared';
import { SmartCapture } from './smart-capture.js';
import { TokenRecall } from './token-recall.js';
import type {
  CompactionInput,
  CompactionResult,
  InjectionOptions,
  RecallResult,
} from './types.js';

export class GracefulCompaction {
  private graph: SessionGraph;
  private bus: EventBus;
  private capture: SmartCapture;
  private recall: TokenRecall;

  constructor(graph: SessionGraph, bus: EventBus) {
    this.graph = graph;
    this.bus = bus;
    this.capture = new SmartCapture(graph, bus);
    this.recall = new TokenRecall(graph, bus);
  }

  /**
   * Pre-compaction: extract all knowledge from context before it's destroyed.
   *
   * Call this BEFORE context compaction happens.
   * Returns extracted facts + the entities ready to inject after compaction.
   */
  async beforeCompaction(input: CompactionInput): Promise<CompactionResult> {
    const { agentId, sessionId, workspace, contextText, preserveEntityIds } = input;

    // Phase 1: Extract entities and relations from the context
    const extracted = await this.capture.extract(contextText, {
      agentId,
      sessionId,
      workspace,
      minConfidence: 0.2, // Lower threshold during compaction — preserve more
      source: 'pre-compaction',
    });

    // Phase 2: Mark preserved entities
    let preservedCount = 0;
    if (preserveEntityIds && preserveEntityIds.length > 0) {
      const db = this.graph.getDb();
      for (const entityId of preserveEntityIds) {
        // Boost confidence of preserved entities so they survive recall ranking
        db.prepare(`
          UPDATE memory_entities SET confidence = MIN(confidence + 0.2, 1.0)
          WHERE entity_id = ?
        `).run(entityId);
        preservedCount++;
      }
    }

    // Phase 3: Prepare injection candidates (what to put back after compaction)
    // Use a generous budget for preparation — actual injection will be capped
    const injectionCandidates = await this.recall.recall({
      agentId,
      workspace,
      tokenBudget: 4096, // generous prep budget
      confidenceWeight: 0.6,
      recencyWeight: 0.3,
      frequencyWeight: 0.1,
    });

    return {
      extracted,
      preservedCount,
      injectionReady: injectionCandidates.entities,
      injectionTokens: injectionCandidates.tokensUsed,
    };
  }

  /**
   * Post-compaction: inject critical memories back into context.
   *
   * Call this AFTER context compaction has happened.
   * Returns memories formatted for context injection within the token budget.
   */
  async afterCompaction(options: InjectionOptions): Promise<RecallResult> {
    const {
      agentId,
      workspace,
      tokenBudget,
      priorityEntityIds,
    } = options;

    // If we have priority entities, boost them first
    if (priorityEntityIds && priorityEntityIds.length > 0) {
      const db = this.graph.getDb();
      for (const entityId of priorityEntityIds) {
        db.prepare(`
          UPDATE memory_entities SET last_accessed_at = datetime('now')
          WHERE entity_id = ?
        `).run(entityId);
      }
    }

    // Recall within the injection budget
    return this.recall.recall({
      agentId,
      workspace,
      tokenBudget,
      confidenceWeight: 0.5,
      recencyWeight: 0.4,    // Favor recent memories post-compaction
      frequencyWeight: 0.1,
      includeRelations: true, // Include relationships for richer context
    });
  }

  /**
   * Format recalled memories for context injection.
   * Returns a structured text block suitable for inserting into agent context.
   */
  formatForInjection(result: RecallResult): string {
    if (result.entities.length === 0) return '';

    const lines: string[] = [
      '--- Restored Memories ---',
    ];

    // Group by type for readability
    const byType = new Map<string, MemoryEntity[]>();
    for (const entity of result.entities) {
      const existing = byType.get(entity.entityType) ?? [];
      existing.push(entity);
      byType.set(entity.entityType, existing);
    }

    for (const [type, entities] of byType) {
      lines.push(`\n[${type.toUpperCase()}]`);
      for (const e of entities) {
        const confidence = Math.round(e.confidence * 100);
        lines.push(`- ${e.name} (${confidence}%): ${e.content}`);
      }
    }

    // Include relationships if present
    if (result.relations.length > 0) {
      lines.push('\n[RELATIONSHIPS]');
      const entityNames = new Map<string, string>();
      for (const e of result.entities) {
        entityNames.set(e.entityId, e.name);
      }

      for (const rel of result.relations) {
        const source = entityNames.get(rel.sourceEntityId) ?? rel.sourceEntityId;
        const target = entityNames.get(rel.targetEntityId) ?? rel.targetEntityId;
        lines.push(`- ${source} --[${rel.relationType}]--> ${target}`);
      }
    }

    lines.push(`\n--- ${result.tokensUsed} tokens | ${result.returnedCount} memories ---`);

    return lines.join('\n');
  }

  /**
   * Full compaction cycle: extract → store → recall → format.
   * Convenience method that runs the complete pre+post flow.
   */
  async compactionCycle(
    input: CompactionInput,
    injectionBudget: number,
  ): Promise<{ compaction: CompactionResult; injection: RecallResult; formatted: string }> {
    // Pre-compaction: extract knowledge
    const compaction = await this.beforeCompaction(input);

    // Post-compaction: recall and format
    const injection = await this.afterCompaction({
      agentId: input.agentId,
      workspace: input.workspace,
      tokenBudget: injectionBudget,
      priorityEntityIds: input.preserveEntityIds,
    });

    const formatted = this.formatForInjection(injection);

    return { compaction, injection, formatted };
  }
}
