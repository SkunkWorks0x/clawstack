/**
 * Knowledge Graph — Structured Storage with Traversal
 *
 * Entity nodes with type, content, confidence, workspace.
 * Relationship edges with type, weight, evidence.
 * Graph traversal: given an entity, find all related entities N hops away.
 * Workspace isolation: personal memories don't contaminate work project.
 *
 * Built on SessionGraph's memory_entities and memory_relations tables.
 * No separate graph DB — SQLite is the graph store.
 */
import { SessionGraph } from '@clawstack/shared';
import type { MemoryEntity, EntityType } from '@clawstack/shared';
import type { GraphEdge, TraversalResult, GraphQueryOptions } from './types.js';
export declare class KnowledgeGraph {
    private graph;
    constructor(graph: SessionGraph);
    /**
     * Get a single entity by ID.
     */
    getEntity(entityId: string): MemoryEntity | null;
    /**
     * Find entities by name (case-insensitive, partial match).
     */
    findEntities(agentId: string, nameQuery: string, options?: {
        workspace?: string;
        entityType?: EntityType;
        limit?: number;
    }): MemoryEntity[];
    /**
     * Get all entities for an agent in a workspace.
     */
    listEntities(agentId: string, options?: {
        workspace?: string;
        entityType?: EntityType;
        limit?: number;
    }): MemoryEntity[];
    /**
     * Get direct relations for an entity (both outgoing and incoming).
     */
    getRelations(entityId: string): GraphEdge[];
    /**
     * Traverse the knowledge graph from a starting entity, up to N hops.
     * Returns all reachable entities within the depth limit.
     *
     * BFS traversal with weight filtering — weak edges can be excluded.
     */
    traverse(entityId: string, options?: GraphQueryOptions): TraversalResult | null;
    /**
     * Find all entities related to a query entity by type.
     * E.g., "find all tools that Alice uses" — traverse from Alice, filter for 'tool' type.
     */
    findRelatedByType(entityId: string, targetType: EntityType, options?: {
        workspace?: string;
        maxDepth?: number;
    }): MemoryEntity[];
    /**
     * Get workspace-isolated entity count and stats.
     */
    getWorkspaceStats(agentId: string, workspace: string): {
        entityCount: number;
        relationCount: number;
        topEntities: MemoryEntity[];
        entityTypes: Record<string, number>;
    };
    /**
     * Delete an entity and all its relations.
     */
    deleteEntity(entityId: string): boolean;
    /**
     * Merge two entities: keep the higher-confidence one, transfer relations, delete the other.
     */
    mergeEntities(keepId: string, mergeId: string): MemoryEntity | null;
    private mapEntity;
    private mapRelation;
}
//# sourceMappingURL=knowledge-graph.d.ts.map