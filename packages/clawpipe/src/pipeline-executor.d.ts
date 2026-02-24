/**
 * Pipeline Executor — Run pipelines deterministically.
 *
 * Execute steps in defined order. Parallel steps run concurrently,
 * collect all results before next step. Context managed per-step
 * (no accumulation — each step gets clean context + its inputs).
 * Timeout per step. Full audit trail.
 *
 * Integration:
 * - SessionGraph: creates sessions, records costs, writes pipeline state
 * - EventBus: emits pipeline.step_completed, pipeline.completed, pipeline.failed
 * - ClawBudget: Smart Router can optimize model per step (via StepExecutor)
 * - ClawGuard: can monitor each step's session independently
 */
import type { SessionGraph, EventBus } from '@clawstack/shared';
import type { PipelineDefinition, StepExecutor, PipelineResult, PipelineExecutionOptions, ResolutionContext } from './types.js';
export declare class PipelineExecutor {
    private graph;
    private bus;
    constructor(graph: SessionGraph, bus: EventBus);
    /**
     * Execute a pipeline definition with the given step executor.
     *
     * The StepExecutor callback is called for each step — it's the caller's
     * responsibility to invoke agents/skills. This lets ClawBudget's Smart Router
     * optimize model selection per step, and ClawGuard monitor each step independently.
     */
    execute(definition: PipelineDefinition, executor: StepExecutor, options?: PipelineExecutionOptions): Promise<PipelineResult>;
    private executeStep;
    private executeParallelGroup;
    private evaluateCondition;
    private stepMatchesName;
}
/**
 * Resolve variable references like ${variables.x} and ${steps.y.output.z}
 * in an input value. Handles strings, objects, and arrays recursively.
 */
export declare function resolveVariables(value: unknown, context: ResolutionContext): unknown;
//# sourceMappingURL=pipeline-executor.d.ts.map