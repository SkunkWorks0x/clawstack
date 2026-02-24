/**
 * ClawPipe Types — Deterministic Multi-Agent Pipeline Framework
 *
 * "Humans define the flow. Agents do the work."
 *
 * These types define pipeline definitions (parsed from YAML),
 * execution contexts, and result structures.
 */
export interface PipelineDefinition {
    name: string;
    description?: string;
    variables: Record<string, unknown>;
    steps: PipelineStepDef[];
}
export type PipelineStepDef = SequentialStepDef | ParallelGroupDef;
export interface SequentialStepDef {
    type: 'sequential';
    name: string;
    skill?: string;
    agent?: string;
    input: Record<string, unknown>;
    inputSchema?: JsonSchema;
    outputSchema?: JsonSchema;
    timeout: number;
    condition?: Condition;
}
export interface ParallelGroupDef {
    type: 'parallel';
    name: string;
    steps: SequentialStepDef[];
}
export interface Condition {
    step: string;
    field: string;
    operator: ConditionOperator;
    value: unknown;
    goto: string;
}
export type ConditionOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';
export interface JsonSchema {
    type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
    properties?: Record<string, JsonSchema>;
    required?: string[];
    items?: JsonSchema;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    enum?: unknown[];
}
export interface StepExecutionContext {
    stepName: string;
    skill?: string;
    agent?: string;
    input: Record<string, unknown>;
    timeout: number;
    pipelineId: string;
    pipelineName: string;
}
export interface StepExecutionResult {
    output: unknown;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    thinkingTokens?: number;
    estimatedCostUsd?: number;
}
export type StepExecutor = (context: StepExecutionContext) => Promise<StepExecutionResult>;
export interface StepResult {
    stepName: string;
    status: 'completed' | 'failed' | 'skipped' | 'timeout';
    output: unknown;
    costUsd: number;
    durationMs: number;
    agentId: string | null;
    sessionId: string | null;
    error?: string;
}
export interface PipelineResult {
    pipelineId: string;
    name: string;
    status: 'completed' | 'failed';
    steps: StepResult[];
    totalCostUsd: number;
    totalDurationMs: number;
    variables: Record<string, unknown>;
}
export interface PipelineExecutionOptions {
    variables?: Record<string, unknown>;
    agentId?: string;
    defaultTimeout?: number;
    maxTotalCostUsd?: number;
}
export interface ResolutionContext {
    variables: Record<string, unknown>;
    stepResults: Record<string, StepResult>;
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}
export type ParseResult = {
    ok: true;
    definition: PipelineDefinition;
} | {
    ok: false;
    errors: string[];
};
//# sourceMappingURL=types.d.ts.map