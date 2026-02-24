/**
 * Pipeline Registry — Store and retrieve pipeline definitions.
 *
 * Saves pipelines to Session Graph (pipelines + pipeline_steps tables).
 * Tracks execution history per pipeline.
 * Calculates total cost across all steps.
 */
import type { SessionGraph } from '@clawstack/shared';
import type { PipelineDefinition } from './types.js';
import type { PipelineStatus } from '@clawstack/shared';
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
    stepCosts: {
        stepName: string;
        costUsd: number;
    }[];
    executionCount: number;
}
export declare class PipelineRegistry {
    private graph;
    constructor(graph: SessionGraph);
    /**
     * Save a pipeline definition to the registry (without executing it).
     * Returns the pipeline ID.
     */
    save(definition: PipelineDefinition, yamlSource: string): string;
    /**
     * Load a pipeline record by ID.
     */
    load(pipelineId: string): PipelineRecord | null;
    /**
     * Get all steps for a pipeline execution.
     */
    getSteps(pipelineId: string): PipelineStepRecord[];
    /**
     * List all pipelines, ordered by creation date (newest first).
     */
    list(limit?: number): PipelineRecord[];
    /**
     * List pipelines by name (execution history for a named pipeline).
     */
    getHistory(name: string, limit?: number): PipelineRecord[];
    /**
     * Get cost summary for a specific pipeline execution.
     */
    getCostSummary(pipelineId: string): PipelineCostSummary | null;
    /**
     * Get aggregate cost across all executions of a named pipeline.
     */
    getAggregateCost(name: string): {
        totalCostUsd: number;
        executionCount: number;
        avgCostUsd: number;
    };
    /**
     * Delete a pipeline and its steps.
     */
    delete(pipelineId: string): boolean;
}
//# sourceMappingURL=pipeline-registry.d.ts.map