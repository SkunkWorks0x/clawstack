/**
 * Pipeline Registry — Store and retrieve pipeline definitions.
 *
 * Saves pipelines to Session Graph (pipelines + pipeline_steps tables).
 * Tracks execution history per pipeline.
 * Calculates total cost across all steps.
 */

import { randomUUID } from 'crypto';
import type { SessionGraph } from '@clawstack/shared';
import type { PipelineDefinition } from './types.js';
import type { Pipeline, PipelineStep, PipelineStatus } from '@clawstack/shared';

export interface PipelineRecord {
  pipelineId: string;
  name: string;
  definitionYaml: string;
  status: PipelineStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  totalSteps: number;
  completedSteps: number;
  totalCostUsd: number;
}

export interface PipelineStepRecord {
  stepId: string;
  pipelineId: string;
  stepNumber: number;
  name: string;
  agentId: string | null;
  sessionId: string | null;
  status: string;
  inputSchema: string;
  outputSchema: string;
  result: unknown | null;
  costUsd: number;
}

export interface PipelineCostSummary {
  pipelineId: string;
  name: string;
  totalCostUsd: number;
  stepCosts: { stepName: string; costUsd: number }[];
  executionCount: number;
}

export class PipelineRegistry {
  private graph: SessionGraph;

  constructor(graph: SessionGraph) {
    this.graph = graph;
  }

  /**
   * Save a pipeline definition to the registry (without executing it).
   * Returns the pipeline ID.
   */
  save(definition: PipelineDefinition, yamlSource: string): string {
    const pipelineId = randomUUID();
    const db = this.graph.getDb();

    let totalSteps = 0;
    for (const step of definition.steps) {
      if (step.type === 'parallel') {
        totalSteps += step.steps.length;
      } else {
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
  load(pipelineId: string): PipelineRecord | null {
    const db = this.graph.getDb();
    const row = db.prepare('SELECT * FROM pipelines WHERE pipeline_id = ?').get(pipelineId) as any;
    if (!row) return null;
    return mapPipelineRow(row);
  }

  /**
   * Get all steps for a pipeline execution.
   */
  getSteps(pipelineId: string): PipelineStepRecord[] {
    const db = this.graph.getDb();
    const rows = db.prepare(
      'SELECT * FROM pipeline_steps WHERE pipeline_id = ? ORDER BY step_number'
    ).all(pipelineId) as any[];
    return rows.map(mapStepRow);
  }

  /**
   * List all pipelines, ordered by creation date (newest first).
   */
  list(limit = 50): PipelineRecord[] {
    const db = this.graph.getDb();
    const rows = db.prepare(
      'SELECT * FROM pipelines ORDER BY created_at DESC, rowid DESC LIMIT ?'
    ).all(limit) as any[];
    return rows.map(mapPipelineRow);
  }

  /**
   * List pipelines by name (execution history for a named pipeline).
   */
  getHistory(name: string, limit = 20): PipelineRecord[] {
    const db = this.graph.getDb();
    const rows = db.prepare(
      'SELECT * FROM pipelines WHERE name = ? ORDER BY created_at DESC LIMIT ?'
    ).all(name, limit) as any[];
    return rows.map(mapPipelineRow);
  }

  /**
   * Get cost summary for a specific pipeline execution.
   */
  getCostSummary(pipelineId: string): PipelineCostSummary | null {
    const pipeline = this.load(pipelineId);
    if (!pipeline) return null;

    const steps = this.getSteps(pipelineId);
    const stepCosts = steps.map(s => ({
      stepName: s.name,
      costUsd: s.costUsd,
    }));

    // Count how many executions of this pipeline name exist
    const db = this.graph.getDb();
    const countRow = db.prepare(
      'SELECT COUNT(*) as count FROM pipelines WHERE name = ?'
    ).get(pipeline.name) as any;

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
  getAggregateCost(name: string): { totalCostUsd: number; executionCount: number; avgCostUsd: number } {
    const db = this.graph.getDb();
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(total_cost_usd), 0) as total_cost,
        COUNT(*) as exec_count
      FROM pipelines WHERE name = ?
    `).get(name) as any;

    return {
      totalCostUsd: row.total_cost,
      executionCount: row.exec_count,
      avgCostUsd: row.exec_count > 0 ? row.total_cost / row.exec_count : 0,
    };
  }

  /**
   * Delete a pipeline and its steps.
   */
  delete(pipelineId: string): boolean {
    const db = this.graph.getDb();
    // Clear pipeline references from sessions before deleting (FK constraint)
    db.prepare('UPDATE sessions SET pipeline_id = NULL, pipeline_step = NULL WHERE pipeline_id = ?').run(pipelineId);
    db.prepare('DELETE FROM pipeline_steps WHERE pipeline_id = ?').run(pipelineId);
    const result = db.prepare('DELETE FROM pipelines WHERE pipeline_id = ?').run(pipelineId);
    return result.changes > 0;
  }
}

// ─── Row Mappers ─────────────────────────────────────────────────

function mapPipelineRow(row: any): PipelineRecord {
  return {
    pipelineId: row.pipeline_id,
    name: row.name,
    definitionYaml: row.definition_yaml,
    status: row.status as PipelineStatus,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    totalSteps: row.total_steps,
    completedSteps: row.completed_steps,
    totalCostUsd: row.total_cost_usd,
  };
}

function mapStepRow(row: any): PipelineStepRecord {
  let result: unknown = null;
  if (row.result) {
    try {
      result = JSON.parse(row.result);
    } catch {
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
