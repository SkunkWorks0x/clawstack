/**
 * ClawPipe — Deterministic Multi-Agent Pipeline Framework
 * "Humans define the flow. Agents do the work."
 *
 * YAML-defined pipelines. Context managed per-step.
 * Results typed/validated between steps.
 * Parallel execution. Full audit trail.
 *
 * Integration: SessionGraph, EventBus, ClawBudget, ClawGuard.
 */
export declare const VERSION = "0.1.0";
export { parsePipeline, validateAndTransform, getAllStepNames, countSteps } from './pipeline-parser.js';
export { PipelineExecutor, resolveVariables } from './pipeline-executor.js';
export { validateSchema, validateStepOutput, validateStepInput, validateStepCompatibility, } from './result-validator.js';
export { PipelineRegistry } from './pipeline-registry.js';
export type { PipelineRecord, PipelineStepRecord, PipelineCostSummary } from './pipeline-registry.js';
export type { PipelineDefinition, PipelineStepDef, SequentialStepDef, ParallelGroupDef, Condition, ConditionOperator, JsonSchema, StepExecutionContext, StepExecutionResult, StepExecutor, StepResult, PipelineResult, PipelineExecutionOptions, ResolutionContext, ValidationResult, ParseResult, } from './types.js';
//# sourceMappingURL=index.d.ts.map