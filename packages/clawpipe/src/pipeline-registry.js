"use strict";
/**
 * Pipeline Registry — Store and retrieve pipeline definitions.
 *
 * Saves pipelines to Session Graph (pipelines + pipeline_steps tables).
 * Tracks execution history per pipeline.
 * Calculates total cost across all steps.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineRegistry = void 0;
const crypto_1 = require("crypto");
class PipelineRegistry {
    graph;
    constructor(graph) {
        this.graph = graph;
    }
    /**
     * Save a pipeline definition to the registry (without executing it).
     * Returns the pipeline ID.
     */
    save(definition, yamlSource) {
        const pipelineId = (0, crypto_1.randomUUID)();
        const db = this.graph.getDb();
        let totalSteps = 0;
        for (const step of definition.steps) {
            if (step.type === 'parallel') {
                totalSteps += step.steps.length;
            }
            else {
                totalSteps += 1;
            }
        }
        db.prepare(`
      INSERT INTO pipelines (pipeline_id, name, definition_yaml, status, created_at, total_steps, completed_steps, total_cost_usd)
      VALUES (?, ?, ?, 'pending', datetime('now'), ?, 0, 0)
    `).run(pipelineId, definition.name, yamlSource, totalSteps);
        return pipelineId;
    }
    /**
     * Load a pipeline record by ID.
     */
    load(pipelineId) {
        const db = this.graph.getDb();
        const row = db.prepare('SELECT * FROM pipelines WHERE pipeline_id = ?').get(pipelineId);
        if (!row)
            return null;
        return mapPipelineRow(row);
    }
    /**
     * Get all steps for a pipeline execution.
     */
    getSteps(pipelineId) {
        const db = this.graph.getDb();
        const rows = db.prepare('SELECT * FROM pipeline_steps WHERE pipeline_id = ? ORDER BY step_number').all(pipelineId);
        return rows.map(mapStepRow);
    }
    /**
     * List all pipelines, ordered by creation date (newest first).
     */
    list(limit = 50) {
        const db = this.graph.getDb();
        const rows = db.prepare('SELECT * FROM pipelines ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit);
        return rows.map(mapPipelineRow);
    }
    /**
     * List pipelines by name (execution history for a named pipeline).
     */
    getHistory(name, limit = 20) {
        const db = this.graph.getDb();
        const rows = db.prepare('SELECT * FROM pipelines WHERE name = ? ORDER BY created_at DESC LIMIT ?').all(name, limit);
        return rows.map(mapPipelineRow);
    }
    /**
     * Get cost summary for a specific pipeline execution.
     */
    getCostSummary(pipelineId) {
        const pipeline = this.load(pipelineId);
        if (!pipeline)
            return null;
        const steps = this.getSteps(pipelineId);
        const stepCosts = steps.map(s => ({
            stepName: s.name,
            costUsd: s.costUsd,
        }));
        // Count how many executions of this pipeline name exist
        const db = this.graph.getDb();
        const countRow = db.prepare('SELECT COUNT(*) as count FROM pipelines WHERE name = ?').get(pipeline.name);
        return {
            pipelineId,
            name: pipeline.name,
            totalCostUsd: pipeline.totalCostUsd,
            stepCosts,
            executionCount: countRow.count,
        };
    }
    /**
     * Get aggregate cost across all executions of a named pipeline.
     */
    getAggregateCost(name) {
        const db = this.graph.getDb();
        const row = db.prepare(`
      SELECT
        COALESCE(SUM(total_cost_usd), 0) as total_cost,
        COUNT(*) as exec_count
      FROM pipelines WHERE name = ?
    `).get(name);
        return {
            totalCostUsd: row.total_cost,
            executionCount: row.exec_count,
            avgCostUsd: row.exec_count > 0 ? row.total_cost / row.exec_count : 0,
        };
    }
    /**
     * Delete a pipeline and its steps.
     */
    delete(pipelineId) {
        const db = this.graph.getDb();
        // Clear pipeline references from sessions before deleting (FK constraint)
        db.prepare('UPDATE sessions SET pipeline_id = NULL, pipeline_step = NULL WHERE pipeline_id = ?').run(pipelineId);
        db.prepare('DELETE FROM pipeline_steps WHERE pipeline_id = ?').run(pipelineId);
        const result = db.prepare('DELETE FROM pipelines WHERE pipeline_id = ?').run(pipelineId);
        return result.changes > 0;
    }
}
exports.PipelineRegistry = PipelineRegistry;
// ─── Row Mappers ─────────────────────────────────────────────────
function mapPipelineRow(row) {
    return {
        pipelineId: row.pipeline_id,
        name: row.name,
        definitionYaml: row.definition_yaml,
        status: row.status,
        createdAt: row.created_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        totalSteps: row.total_steps,
        completedSteps: row.completed_steps,
        totalCostUsd: row.total_cost_usd,
    };
}
function mapStepRow(row) {
    let result = null;
    if (row.result) {
        try {
            result = JSON.parse(row.result);
        }
        catch {
            result = row.result;
        }
    }
    return {
        stepId: row.step_id,
        pipelineId: row.pipeline_id,
        stepNumber: row.step_number,
        name: row.name,
        agentId: row.agent_id,
        sessionId: row.session_id,
        status: row.status,
        inputSchema: row.input_schema,
        outputSchema: row.output_schema,
        result,
        costUsd: row.cost_usd,
    };
}
//# sourceMappingURL=pipeline-registry.js.map