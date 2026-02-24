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

export const VERSION = '0.1.0';

// ─── Pipeline Parser ─────────────────────────────────────────────
export { parsePipeline, validateAndTransform, getAllStepNames, countSteps } from './pipeline-parser.js';

// ─── Pipeline Executor ───────────────────────────────────────────
export { PipelineExecutor, resolveVariables } from './pipeline-executor.js';

// ─── Result Validator ────────────────────────────────────────────
export {
  validateSchema,
  validateStepOutput,
  validateStepInput,
  validateStepCompatibility,
} from './result-validator.js';

// ─── Pipeline Registry ───────────────────────────────────────────
export { PipelineRegistry } from './pipeline-registry.js';
export type { PipelineRecord, PipelineStepRecord, PipelineCostSummary } from './pipeline-registry.js';

// ─── Types ───────────────────────────────────────────────────────
export type {
  PipelineDefinition,
  PipelineStepDef,
  SequentialStepDef,
  ParallelGroupDef,
  Condition,
  ConditionOperator,
  JsonSchema,
  StepExecutionContext,
  StepExecutionResult,
  StepExecutor,
  StepResult,
  PipelineResult,
  PipelineExecutionOptions,
  ResolutionContext,
  ValidationResult,
  ParseResult,
} from './types.js';
