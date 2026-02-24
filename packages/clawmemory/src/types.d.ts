/**
 * ClawMemory Types — Internal types for the memory layer
 *
 * Shared types (MemoryEntity, MemoryRelation, EntityType, RelationType)
 * are defined in @clawstack/shared. These are ClawMemory-specific.
 */
import type { MemoryEntity, MemoryRelation, EntityType, RelationType } from '@clawstack/shared';
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
    source: string;
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
    minConfidence?: number;
    source?: string;
}
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
    nodes: Map<string, GraphNode>;
    depth: number;
    totalEntities: number;
    totalRelations: number;
}
export interface GraphQueryOptions {
    workspace?: string;
    maxDepth?: number;
    minWeight?: number;
    entityTypes?: EntityType[];
    limit?: number;
}
export interface RecallOptions {
    agentId: string;
    workspace: string;
    tokenBudget: number;
    query?: string;
    preferredTypes?: EntityType[];
    recencyWeight?: number;
    frequencyWeight?: number;
    confidenceWeight?: number;
    includeRelations?: boolean;
}
export interface RecallResult {
    entities: MemoryEntity[];
    relations: MemoryRelation[];
    tokensUsed: number;
    tokensRemaining: number;
    totalCandidates: number;
    returnedCount: number;
}
export interface CompactionInput {
    agentId: string;
    sessionId: string;
    workspace: string;
    contextText: string;
    preserveEntityIds?: string[];
}
export interface CompactionResult {
    extracted: ExtractionResult;
    preservedCount: number;
    injectionReady: MemoryEntity[];
    injectionTokens: number;
}
export interface InjectionOptions {
    agentId: string;
    workspace: string;
    tokenBudget: number;
    priorityEntityIds?: string[];
}
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
//# sourceMappingURL=types.d.ts.map