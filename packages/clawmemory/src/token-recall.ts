/**
 * Token-Budgeted Recall — Retrieve ONLY What Fits
 *
 * Given a query and a token budget, returns the most relevant memories
 * ranked by: relevance to query, confidence, recency, access frequency.
 *
 * Hard token cap — never exceeds the budget. Tracks what was recalled
 * and updates access stats for learning over time.
 *
 * Extends SessionGraph's queryMemory with relevance scoring.
 */

import { SessionGraph, EventBus, createEvent } from '@clawstack/shared';
import type { MemoryEntity, MemoryRelation } from '@clawstack/shared';
import type { RecallOptions, RecallResult } from './types.js';

// ─── Relevance Scoring ───────────────────────────────────────────

interface ScoredEntity {
  entity: MemoryEntity;
  score: number;
  breakdown: {
    relevance: number;
    confidence: number;
    recency: number;
    frequency: number;
  };
}

/**
 * Compute relevance score between a query and entity content.
 * Uses term-frequency matching (lightweight BM25-like scoring without external deps).
 */
function computeRelevance(query: string, entity: MemoryEntity): number {
  if (!query) return 0.5; // neutral if no query

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return 0.5;

  const entityText = `${entity.name} ${entity.content}`.toLowerCase();
  const entityTerms = new Set(tokenize(entityText));

  // Count matching terms
  let matches = 0;
  for (const term of queryTerms) {
    if (entityTerms.has(term)) matches++;
    // Also check substring matches for compound terms
    for (const eTerm of entityTerms) {
      if (eTerm.includes(term) || term.includes(eTerm)) {
        matches += 0.5;
        break;
      }
    }
  }

  // Normalize to 0-1
  return Math.min(matches / queryTerms.length, 1.0);
}

/**
 * Simple tokenizer: lowercase, split on non-alphanumeric, filter short tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1);
}

/**
 * Compute recency score. More recent = higher score.
 * Uses exponential decay: score = e^(-age_days * decay_rate)
 */
function computeRecency(lastAccessedAt: string): number {
  const now = Date.now();
  const accessed = new Date(lastAccessedAt).getTime();
  const ageDays = (now - accessed) / (1000 * 60 * 60 * 24);

  // Decay rate: entities accessed today = ~1.0, 7 days ago = ~0.5, 30 days = ~0.14
  return Math.exp(-ageDays * 0.1);
}

/**
 * Compute frequency score. More frequently accessed = higher score.
 * Uses logarithmic scale to prevent runaway scores.
 */
function computeFrequency(accessCount: number): number {
  if (accessCount <= 0) return 0;
  // log(1 + count) / log(1 + max_reasonable_count)
  // Caps at ~100 accesses
  return Math.min(Math.log(1 + accessCount) / Math.log(101), 1.0);
}

// ─── Token-Budgeted Recall Class ─────────────────────────────────

export class TokenRecall {
  private graph: SessionGraph;
  private bus: EventBus;

  constructor(graph: SessionGraph, bus: EventBus) {
    this.graph = graph;
    this.bus = bus;
  }

  /**
   * Recall memories within a hard token budget.
   *
   * Scoring formula:
   *   score = (relevance × relevanceWeight) + (confidence × confidenceWeight) +
   *           (recency × recencyWeight) + (frequency × frequencyWeight)
   *
   * Where weights are configurable and default to a balanced mix.
   */
  async recall(options: RecallOptions): Promise<RecallResult> {
    const {
      agentId,
      workspace,
      tokenBudget,
      query,
      preferredTypes,
      recencyWeight = 0.3,
      frequencyWeight = 0.2,
      confidenceWeight = 0.5,
      includeRelations = false,
    } = options;

    // Calculate relevance weight as complement
    const totalWeight = recencyWeight + frequencyWeight + confidenceWeight;
    const relevanceWeight = query ? Math.max(1.0 - totalWeight, 0) : 0;

    // Fetch all candidate entities for this agent+workspace
    const db = this.graph.getDb();
    const candidates = db.prepare(`
      SELECT * FROM memory_entities
      WHERE agent_id = ? AND workspace = ?
      ORDER BY confidence DESC
    `).all(agentId, workspace) as any[];

    // Score each candidate
    const scored: ScoredEntity[] = candidates.map(row => {
      const entity = this.mapEntity(row);

      const relevance = query ? computeRelevance(query, entity) : 0.5;
      const confidence = entity.confidence;
      const recency = computeRecency(entity.lastAccessedAt);
      const frequency = computeFrequency(entity.accessCount);

      const score =
        relevance * relevanceWeight +
        confidence * confidenceWeight +
        recency * recencyWeight +
        frequency * frequencyWeight;

      return {
        entity,
        score,
        breakdown: { relevance, confidence, recency, frequency },
      };
    });

    // Boost preferred types
    if (preferredTypes && preferredTypes.length > 0) {
      const typeSet = new Set(preferredTypes);
      for (const s of scored) {
        if (typeSet.has(s.entity.entityType)) {
          s.score += 0.1; // mild boost
        }
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Fill within token budget (hard cap)
    const results: MemoryEntity[] = [];
    let tokensUsed = 0;

    for (const s of scored) {
      const cost = s.entity.tokenCost || 1; // minimum 1 token
      if (tokensUsed + cost > tokenBudget) continue; // skip, try smaller ones
      tokensUsed += cost;
      results.push(s.entity);
    }

    // Update access stats for recalled entities
    const now = new Date().toISOString();
    const updateStmt = db.prepare(`
      UPDATE memory_entities SET last_accessed_at = ?, access_count = access_count + 1
      WHERE entity_id = ?
    `);

    for (const entity of results) {
      updateStmt.run(now, entity.entityId);

      // Emit access event
      await this.bus.emit(createEvent(
        'memory.entity_accessed',
        'clawmemory',
        {
          entityId: entity.entityId,
          entityType: entity.entityType,
          name: entity.name,
          recallScore: scored.find(s => s.entity.entityId === entity.entityId)?.score ?? 0,
        },
        { agentId }
      ));
    }

    // Optionally gather relations between recalled entities
    let relations: MemoryRelation[] = [];
    if (includeRelations && results.length > 1) {
      const entityIds = new Set(results.map(e => e.entityId));
      const allRelations = db.prepare(`
        SELECT * FROM memory_relations
        WHERE source_entity_id IN (${Array.from(entityIds).map(() => '?').join(',')})
          AND target_entity_id IN (${Array.from(entityIds).map(() => '?').join(',')})
      `).all(...Array.from(entityIds), ...Array.from(entityIds)) as any[];

      relations = allRelations.map(r => this.mapRelation(r));
    }

    return {
      entities: results,
      relations,
      tokensUsed,
      tokensRemaining: tokenBudget - tokensUsed,
      totalCandidates: candidates.length,
      returnedCount: results.length,
    };
  }

  /**
   * Quick recall: highest-confidence entities within budget, no scoring.
   * Delegates to SessionGraph.queryMemory for backward compatibility.
   */
  quickRecall(agentId: string, workspace: string, tokenBudget: number): MemoryEntity[] {
    return this.graph.queryMemory(agentId, workspace, tokenBudget);
  }

  // ─── Row Mappers ────────────────────────────────────────────────

  private mapEntity(row: any): MemoryEntity {
    return {
      entityId: row.entity_id,
      agentId: row.agent_id,
      entityType: row.entity_type,
      name: row.name,
      content: row.content,
      workspace: row.workspace,
      confidence: row.confidence,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
      accessCount: row.access_count,
      tokenCost: row.token_cost,
    };
  }

  private mapRelation(row: any): MemoryRelation {
    return {
      relationId: row.relation_id,
      sourceEntityId: row.source_entity_id,
      targetEntityId: row.target_entity_id,
      relationType: row.relation_type,
      weight: row.weight,
      evidence: row.evidence,
      createdAt: row.created_at,
    };
  }
}
