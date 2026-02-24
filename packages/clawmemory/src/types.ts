/**
 * ClawMemory Types — Internal types for the memory layer
 *
 * Shared types (MemoryEntity, MemoryRelation, EntityType, RelationType)
 * are defined in @clawstack/shared. These are ClawMemory-specific.
 */

import type { MemoryEntity, MemoryRelation, EntityType, RelationType } from '@clawstack/shared';

// ─── Smart Capture ───────────────────────────────────────────────

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
  stats: {
    inputLength: number;
    entitiesFound: number;
    relationsFound: number;
    entitiesStored: number;
    duplicatesMerged: number;
    belowThreshold: number;
  };
}

export interface ExtractedEntity {
  name: string;
  entityType: EntityType;
  content: string;
  confidence: number;
  source: string;        // where this was extracted from
}

export interface ExtractedRelation {
  sourceName: string;
  targetName: string;
  relationType: RelationType;
  weight: number;
  evidence: string;
}

export interface CaptureOptions {
  agentId: string;
  sessionId?: string;
  workspace?: string;
  minConfidence?: number;  // filter below this threshold (default 0.3)
  source?: string;         // label for extraction source
}

// ─── Knowledge Graph ─────────────────────────────────────────────

export interface GraphNode {
  entity: MemoryEntity;
  relations: GraphEdge[];
}

export interface GraphEdge {
  relation: MemoryRelation;
  targetEntity: MemoryEntity;
  direction: 'outgoing' | 'incoming';
}

export interface TraversalResult {
  rootEntity: MemoryEntity;
  nodes: Map<string, GraphNode>;  // entityId -> node
  depth: number;
  totalEntities: number;
  totalRelations: number;
}

export interface GraphQueryOptions {
  workspace?: string;
  maxDepth?: number;       // default 2
  minWeight?: number;      // min relation weight to traverse (default 0.1)
  entityTypes?: EntityType[];  // filter by type
  limit?: number;          // max entities to return
}

// ─── Token-Budgeted Recall ───────────────────────────────────────

export interface RecallOptions {
  agentId: string;
  workspace: string;
  tokenBudget: number;         // hard cap
  query?: string;              // relevance query
  preferredTypes?: EntityType[];
  recencyWeight?: number;      // 0-1, how much to weight recent access (default 0.3)
  frequencyWeight?: number;    // 0-1, how much to weight access count (default 0.2)
  confidenceWeight?: number;   // 0-1, how much to weight confidence (default 0.5)
  includeRelations?: boolean;  // include relations in output (default false)
}

export interface RecallResult {
  entities: MemoryEntity[];
  relations: MemoryRelation[];   // only if includeRelations=true
  tokensUsed: number;
  tokensRemaining: number;
  totalCandidates: number;
  returnedCount: number;
}

// ─── Graceful Compaction ─────────────────────────────────────────

export interface CompactionInput {
  agentId: string;
  sessionId: string;
  workspace: string;
  contextText: string;            // the context about to be compacted
  preserveEntityIds?: string[];   // entity IDs that must survive
}

export interface CompactionResult {
  extracted: ExtractionResult;
  preservedCount: number;
  injectionReady: MemoryEntity[];  // entities to inject after compaction
  injectionTokens: number;
}

export interface InjectionOptions {
  agentId: string;
  workspace: string;
  tokenBudget: number;
  priorityEntityIds?: string[];  // these get included first
}

// ─── Cross-Product Integration ───────────────────────────────────

export interface ThreatMemory {
  skillId: string;
  skillName: string;
  threatSignature: string;
  reason: string;
  blockedAt: string;
}

export interface CostContext {
  sessionId: string;
  totalCostUsd: number;
  modelTier: string;
}

export interface PipelineMemory {
  pipelineId: string;
  pipelineName: string;
  stepName: string;
  result: string;
  costUsd: number;
}
