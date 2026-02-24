/**
 * ClawPipe Types — Deterministic Multi-Agent Pipeline Framework
 *
 * "Humans define the flow. Agents do the work."
 *
 * These types define pipeline definitions (parsed from YAML),
 * execution contexts, and result structures.
 */

// ─── Pipeline Definition (parsed from YAML) ─────────────────────

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
  timeout: number; // ms
  condition?: Condition;
}

export interface ParallelGroupDef {
  type: 'parallel';
  name: string;
  steps: SequentialStepDef[];
}

export interface Condition {
  step: string;      // which step's result to check
  field: string;     // which field in the result
  operator: ConditionOperator;
  value: unknown;    // value to compare against
  goto: string;      // step name to jump to if true
}

export type ConditionOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';

// ─── JSON Schema (lightweight subset) ────────────────────────────

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

// ─── Step Execution ──────────────────────────────────────────────

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

// ─── Pipeline Execution Results ──────────────────────────────────

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

// ─── Execution Options ───────────────────────────────────────────

export interface PipelineExecutionOptions {
  variables?: Record<string, unknown>;   // override definition variables
  agentId?: string;                      // pre-registered agent to use
  defaultTimeout?: number;               // ms, default 30000
  maxTotalCostUsd?: number;              // abort if exceeded
}

// ─── Variable Resolution Context ─────────────────────────────────

export interface ResolutionContext {
  variables: Record<string, unknown>;
  stepResults: Record<string, StepResult>;
}

// ─── Validation ──────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Parse Result ────────────────────────────────────────────────

export type ParseResult =
  | { ok: true; definition: PipelineDefinition }
  | { ok: false; errors: string[] };
