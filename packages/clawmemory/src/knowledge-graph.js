"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnowledgeGraph = void 0;
class KnowledgeGraph {
    graph;
    constructor(graph) {
        this.graph = graph;
    }
    /**
     * Get a single entity by ID.
     */
    getEntity(entityId) {
        const db = this.graph.getDb();
        const row = db.prepare('SELECT * FROM memory_entities WHERE entity_id = ?').get(entityId);
        if (!row)
            return null;
        return this.mapEntity(row);
    }
    /**
     * Find entities by name (case-insensitive, partial match).
     */
    findEntities(agentId, nameQuery, options) {
        const db = this.graph.getDb();
        const limit = options?.limit ?? 20;
        let sql = 'SELECT * FROM memory_entities WHERE agent_id = ? AND LOWER(name) LIKE LOWER(?)';
        const params = [agentId, `%${nameQuery}%`];
        if (options?.workspace) {
            sql += ' AND workspace = ?';
            params.push(options.workspace);
        }
        if (options?.entityType) {
            sql += ' AND entity_type = ?';
            params.push(options.entityType);
        }
        sql += ' ORDER BY confidence DESC, access_count DESC LIMIT ?';
        params.push(limit);
        const rows = db.prepare(sql).all(...params);
        return rows.map(r => this.mapEntity(r));
    }
    /**
     * Get all entities for an agent in a workspace.
     */
    listEntities(agentId, options) {
        const db = this.graph.getDb();
        const limit = options?.limit ?? 100;
        let sql = 'SELECT * FROM memory_entities WHERE agent_id = ?';
        const params = [agentId];
        if (options?.workspace) {
            sql += ' AND workspace = ?';
            params.push(options.workspace);
        }
        if (options?.entityType) {
            sql += ' AND entity_type = ?';
            params.push(options.entityType);
        }
        sql += ' ORDER BY confidence DESC, last_accessed_at DESC LIMIT ?';
        params.push(limit);
        const rows = db.prepare(sql).all(...params);
        return rows.map(r => this.mapEntity(r));
    }
    /**
     * Get direct relations for an entity (both outgoing and incoming).
     */
    getRelations(entityId) {
        const db = this.graph.getDb();
        const edges = [];
        // Outgoing relations
        const outgoing = db.prepare(`
      SELECT r.*, e.* FROM memory_relations r
      JOIN memory_entities e ON r.target_entity_id = e.entity_id
      WHERE r.source_entity_id = ?
      ORDER BY r.weight DESC
    `).all(entityId);
        for (const row of outgoing) {
            edges.push({
                relation: this.mapRelation(row),
                targetEntity: this.mapEntity(row),
                direction: 'outgoing',
            });
        }
        // Incoming relations
        const incoming = db.prepare(`
      SELECT r.*, e.* FROM memory_relations r
      JOIN memory_entities e ON r.source_entity_id = e.entity_id
      WHERE r.target_entity_id = ?
      ORDER BY r.weight DESC
    `).all(entityId);
        for (const row of incoming) {
            edges.push({
                relation: this.mapRelation(row),
                targetEntity: this.mapEntity(row),
                direction: 'incoming',
            });
        }
        return edges;
    }
    /**
     * Traverse the knowledge graph from a starting entity, up to N hops.
     * Returns all reachable entities within the depth limit.
     *
     * BFS traversal with weight filtering — weak edges can be excluded.
     */
    traverse(entityId, options) {
        const maxDepth = options?.maxDepth ?? 2;
        const minWeight = options?.minWeight ?? 0.1;
        const entityTypes = options?.entityType ? new Set(options.entityTypes) : null;
        const limit = options?.limit ?? 50;
        const rootEntity = this.getEntity(entityId);
        if (!rootEntity)
            return null;
        // Apply workspace filter
        if (options?.workspace && rootEntity.workspace !== options.workspace)
            return null;
        const nodes = new Map();
        const visited = new Set();
        const queue = [{ entityId, depth: 0 }];
        let totalRelations = 0;
        while (queue.length > 0 && nodes.size < limit) {
            const current = queue.shift();
            if (visited.has(current.entityId))
                continue;
            visited.add(current.entityId);
            const entity = current.entityId === entityId
                ? rootEntity
                : this.getEntity(current.entityId);
            if (!entity)
                continue;
            // Apply entity type filter
            if (entityTypes && !entityTypes.has(entity.entityType))
                continue;
            // Apply workspace filter
            if (options?.workspace && entity.workspace !== options.workspace)
                continue;
            const relations = this.getRelations(current.entityId);
            const filteredRelations = relations.filter(e => e.relation.weight >= minWeight);
            nodes.set(current.entityId, {
                entity,
                relations: filteredRelations,
            });
            totalRelations += filteredRelations.length;
            // Queue neighbors if within depth limit
            if (current.depth < maxDepth) {
                for (const edge of filteredRelations) {
                    const neighborId = edge.direction === 'outgoing'
                        ? edge.relation.targetEntityId
                        : edge.relation.sourceEntityId;
                    if (!visited.has(neighborId)) {
                        queue.push({ entityId: neighborId, depth: current.depth + 1 });
                    }
                }
            }
        }
        return {
            rootEntity,
            nodes,
            depth: maxDepth,
            totalEntities: nodes.size,
            totalRelations,
        };
    }
    /**
     * Find all entities related to a query entity by type.
     * E.g., "find all tools that Alice uses" — traverse from Alice, filter for 'tool' type.
     */
    findRelatedByType(entityId, targetType, options) {
        const result = this.traverse(entityId, {
            maxDepth: options?.maxDepth ?? 2,
            workspace: options?.workspace,
        });
        if (!result)
            return [];
        const related = [];
        for (const [id, node] of result.nodes) {
            if (id !== entityId && node.entity.entityType === targetType) {
                related.push(node.entity);
            }
        }
        return related.sort((a, b) => b.confidence - a.confidence);
    }
    /**
     * Get workspace-isolated entity count and stats.
     */
    getWorkspaceStats(agentId, workspace) {
        const db = this.graph.getDb();
        const entityCount = db.prepare('SELECT COUNT(*) as count FROM memory_entities WHERE agent_id = ? AND workspace = ?').get(agentId, workspace).count;
        const relationCount = db.prepare(`
      SELECT COUNT(*) as count FROM memory_relations r
      JOIN memory_entities e ON r.source_entity_id = e.entity_id
      WHERE e.agent_id = ? AND e.workspace = ?
    `).get(agentId, workspace).count;
        const topEntities = this.listEntities(agentId, { workspace, limit: 5 });
        const typeRows = db.prepare(`
      SELECT entity_type, COUNT(*) as count FROM memory_entities
      WHERE agent_id = ? AND workspace = ?
      GROUP BY entity_type
    `).all(agentId, workspace);
        const entityTypes = {};
        for (const row of typeRows) {
            entityTypes[row.entity_type] = row.count;
        }
        return { entityCount, relationCount, topEntities, entityTypes };
    }
    /**
     * Delete an entity and all its relations.
     */
    deleteEntity(entityId) {
        const db = this.graph.getDb();
        const entity = this.getEntity(entityId);
        if (!entity)
            return false;
        // Delete relations first (foreign key constraint)
        db.prepare('DELETE FROM memory_relations WHERE source_entity_id = ? OR target_entity_id = ?')
            .run(entityId, entityId);
        db.prepare('DELETE FROM memory_entities WHERE entity_id = ?').run(entityId);
        return true;
    }
    /**
     * Merge two entities: keep the higher-confidence one, transfer relations, delete the other.
     */
    mergeEntities(keepId, mergeId) {
        const db = this.graph.getDb();
        const keep = this.getEntity(keepId);
        const merge = this.getEntity(mergeId);
        if (!keep || !merge)
            return null;
        // Transfer incoming relations from merge -> keep
        db.prepare(`
      UPDATE memory_relations SET target_entity_id = ?
      WHERE target_entity_id = ? AND source_entity_id != ?
    `).run(keepId, mergeId, keepId);
        // Transfer outgoing relations from merge -> keep
        db.prepare(`
      UPDATE memory_relations SET source_entity_id = ?
      WHERE source_entity_id = ? AND target_entity_id != ?
    `).run(keepId, mergeId, keepId);
        // Delete any self-referential relations created by the transfer
        db.prepare('DELETE FROM memory_relations WHERE source_entity_id = target_entity_id').run();
        // Delete remaining relations pointing to/from merge entity
        db.prepare('DELETE FROM memory_relations WHERE source_entity_id = ? OR target_entity_id = ?')
            .run(mergeId, mergeId);
        // Update keep entity with merged confidence
        const newConfidence = Math.min((keep.confidence + merge.confidence) / 2 + 0.1, 1.0);
        const newAccessCount = keep.accessCount + merge.accessCount;
        db.prepare(`
      UPDATE memory_entities SET confidence = ?, access_count = ?
      WHERE entity_id = ?
    `).run(newConfidence, newAccessCount, keepId);
        // Delete merged entity
        db.prepare('DELETE FROM memory_entities WHERE entity_id = ?').run(mergeId);
        return this.getEntity(keepId);
    }
    // ─── Row Mappers ────────────────────────────────────────────────
    mapEntity(row) {
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
    mapRelation(row) {
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
exports.KnowledgeGraph = KnowledgeGraph;
//# sourceMappingURL=knowledge-graph.js.map