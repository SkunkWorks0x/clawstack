"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineExecutor = void 0;
exports.resolveVariables = resolveVariables;
const crypto_1 = require("crypto");
const shared_1 = require("@clawstack/shared");
const result_validator_js_1 = require("./result-validator.js");
const pipeline_parser_js_1 = require("./pipeline-parser.js");
const DEFAULT_TIMEOUT = 30000;
class PipelineExecutor {
    graph;
    bus;
    constructor(graph, bus) {
        this.graph = graph;
        this.bus = bus;
    }
    /**
     * Execute a pipeline definition with the given step executor.
     *
     * The StepExecutor callback is called for each step — it's the caller's
     * responsibility to invoke agents/skills. This lets ClawBudget's Smart Router
     * optimize model selection per step, and ClawGuard monitor each step independently.
     */
    async execute(definition, executor, options) {
        const pipelineId = (0, crypto_1.randomUUID)();
        const startTime = Date.now();
        const variables = { ...definition.variables, ...options?.variables };
        const defaultTimeout = options?.defaultTimeout ?? DEFAULT_TIMEOUT;
        const totalStepCount = (0, pipeline_parser_js_1.countSteps)(definition);
        // Register a pipeline agent if none provided
        let agentId = options?.agentId ?? null;
        if (!agentId) {
            const agent = this.graph.registerAgent({
                name: `pipeline:${definition.name}`,
                platform: 'openclaw',
                version: '1.0.0',
                dockerSandboxed: false,
                metadata: { pipelineId, pipelineName: definition.name },
            });
            agentId = agent.agentId;
        }
        // Create pipeline record in DB
        const db = this.graph.getDb();
        db.prepare(`
      INSERT INTO pipelines (pipeline_id, name, definition_yaml, status, created_at, started_at, total_steps, completed_steps, total_cost_usd)
      VALUES (?, ?, ?, 'running', datetime('now'), datetime('now'), ?, 0, 0)
    `).run(pipelineId, definition.name, definition.description || '', totalStepCount);
        const stepResults = {};
        const allStepResults = [];
        let completedSteps = 0;
        let totalCostUsd = 0;
        let pipelineStatus = 'completed';
        let jumpTo = null;
        try {
            for (let i = 0; i < definition.steps.length; i++) {
                const stepDef = definition.steps[i];
                // Handle conditional jump: skip steps until we reach the target
                if (jumpTo !== null) {
                    if (this.stepMatchesName(stepDef, jumpTo)) {
                        jumpTo = null; // Found the target, execute from here
                    }
                    else {
                        continue; // Skip this step
                    }
                }
                // Cost limit check
                if (options?.maxTotalCostUsd && totalCostUsd >= options.maxTotalCostUsd) {
                    pipelineStatus = 'failed';
                    break;
                }
                if (stepDef.type === 'parallel') {
                    // Execute parallel group
                    const results = await this.executeParallelGroup(pipelineId, agentId, stepDef, executor, { variables, stepResults }, defaultTimeout, completedSteps);
                    for (const result of results) {
                        stepResults[result.stepName] = result;
                        allStepResults.push(result);
                        completedSteps++;
                        totalCostUsd += result.costUsd;
                        if (result.status === 'failed' || result.status === 'timeout') {
                            pipelineStatus = 'failed';
                        }
                    }
                    if (pipelineStatus === 'failed')
                        break;
                }
                else {
                    // Execute sequential step
                    const result = await this.executeStep(pipelineId, agentId, stepDef, executor, { variables, stepResults }, defaultTimeout, completedSteps);
                    stepResults[result.stepName] = result;
                    allStepResults.push(result);
                    completedSteps++;
                    totalCostUsd += result.costUsd;
                    if (result.status === 'failed' || result.status === 'timeout') {
                        pipelineStatus = 'failed';
                        break;
                    }
                    // Check condition for branching
                    if (stepDef.condition) {
                        const shouldJump = this.evaluateCondition(stepDef.condition, stepResults);
                        if (shouldJump) {
                            jumpTo = stepDef.condition.goto;
                        }
                    }
                }
                // Update pipeline progress
                db.prepare(`
          UPDATE pipelines SET completed_steps = ?, total_cost_usd = ? WHERE pipeline_id = ?
        `).run(completedSteps, totalCostUsd, pipelineId);
            }
            // Finalize pipeline record
            db.prepare(`
        UPDATE pipelines SET status = ?, completed_at = datetime('now'), completed_steps = ?, total_cost_usd = ?
        WHERE pipeline_id = ?
      `).run(pipelineStatus, completedSteps, totalCostUsd, pipelineId);
            const result = {
                pipelineId,
                name: definition.name,
                status: pipelineStatus,
                steps: allStepResults,
                totalCostUsd,
                totalDurationMs: Date.now() - startTime,
                variables,
            };
            // Emit completion event
            const eventChannel = pipelineStatus === 'completed' ? 'pipeline.completed' : 'pipeline.failed';
            const lastFailed = allStepResults.find(s => s.status === 'failed' || s.status === 'timeout');
            await this.bus.emit((0, shared_1.createEvent)(eventChannel, 'clawpipe', {
                pipelineId,
                name: definition.name,
                status: pipelineStatus,
                totalCostUsd,
                completedSteps,
                totalSteps: totalStepCount,
                ...(lastFailed?.error ? { error: lastFailed.error } : {}),
            }, { agentId }));
            return result;
        }
        catch (err) {
            // Catastrophic failure
            db.prepare(`
        UPDATE pipelines SET status = 'failed', completed_at = datetime('now'), completed_steps = ?, total_cost_usd = ?
        WHERE pipeline_id = ?
      `).run(completedSteps, totalCostUsd, pipelineId);
            await this.bus.emit((0, shared_1.createEvent)('pipeline.failed', 'clawpipe', {
                pipelineId,
                name: definition.name,
                error: err.message,
                totalCostUsd,
                completedSteps,
            }, { agentId }));
            return {
                pipelineId,
                name: definition.name,
                status: 'failed',
                steps: allStepResults,
                totalCostUsd,
                totalDurationMs: Date.now() - startTime,
                variables,
            };
        }
    }
    async executeStep(pipelineId, agentId, stepDef, executor, context, defaultTimeout, stepNumber) {
        const stepId = (0, crypto_1.randomUUID)();
        const stepStart = Date.now();
        const timeout = stepDef.timeout || defaultTimeout;
        // Create a session for this step
        const session = this.graph.startSession(agentId, {
            pipelineId,
            pipelineStep: stepNumber,
        });
        // Create pipeline_step record
        const db = this.graph.getDb();
        db.prepare(`
      INSERT INTO pipeline_steps (step_id, pipeline_id, step_number, name, agent_id, session_id, status, input_schema, output_schema, result, cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, NULL, 0)
    `).run(stepId, pipelineId, stepNumber, stepDef.name, agentId, session.sessionId, JSON.stringify(stepDef.inputSchema || {}), JSON.stringify(stepDef.outputSchema || {}));
        try {
            // Resolve variable references in input
            const resolvedInput = resolveVariables(stepDef.input, context);
            // Validate input against schema
            if (stepDef.inputSchema) {
                const inputValidation = (0, result_validator_js_1.validateStepInput)(stepDef.name, resolvedInput, stepDef.inputSchema);
                if (!inputValidation.valid) {
                    throw new Error(inputValidation.errors.join('; '));
                }
            }
            // Execute with timeout
            const execResult = await withTimeout(executor({
                stepName: stepDef.name,
                skill: stepDef.skill,
                agent: stepDef.agent,
                input: resolvedInput,
                timeout,
                pipelineId,
                pipelineName: '', // Will be set by caller
            }), timeout, `Step "${stepDef.name}" timed out after ${timeout}ms`);
            // Validate output against schema
            if (stepDef.outputSchema) {
                const outputValidation = (0, result_validator_js_1.validateStepOutput)(stepDef.name, execResult.output, stepDef.outputSchema);
                if (!outputValidation.valid) {
                    throw new Error(outputValidation.errors.join('; '));
                }
            }
            // Calculate cost
            const costUsd = execResult.estimatedCostUsd ?? 0;
            // Record cost in Session Graph
            if (costUsd > 0 || execResult.inputTokens) {
                this.graph.recordCost({
                    sessionId: session.sessionId,
                    agentId,
                    model: execResult.model || 'unknown',
                    modelTier: 'unknown',
                    inputTokens: execResult.inputTokens ?? 0,
                    outputTokens: execResult.outputTokens ?? 0,
                    thinkingTokens: execResult.thinkingTokens ?? 0,
                    totalTokens: (execResult.inputTokens ?? 0) + (execResult.outputTokens ?? 0) + (execResult.thinkingTokens ?? 0),
                    estimatedCostUsd: costUsd,
                    routedBy: 'user',
                    originalModel: null,
                });
            }
            // End session successfully
            this.graph.endSession(session.sessionId, 'completed');
            // Update pipeline_step
            db.prepare(`
        UPDATE pipeline_steps SET status = 'completed', result = ?, cost_usd = ? WHERE step_id = ?
      `).run(JSON.stringify(execResult.output), costUsd, stepId);
            const stepResult = {
                stepName: stepDef.name,
                status: 'completed',
                output: execResult.output,
                costUsd,
                durationMs: Date.now() - stepStart,
                agentId,
                sessionId: session.sessionId,
            };
            // Emit step completed event
            await this.bus.emit((0, shared_1.createEvent)('pipeline.step_completed', 'clawpipe', {
                pipelineId,
                stepName: stepDef.name,
                stepId,
                status: 'completed',
                costUsd,
                durationMs: stepResult.durationMs,
            }, { sessionId: session.sessionId, agentId }));
            return stepResult;
        }
        catch (err) {
            const isTimeout = err.message.includes('timed out');
            const status = isTimeout ? 'timeout' : 'failed';
            this.graph.endSession(session.sessionId, 'error');
            db.prepare(`
        UPDATE pipeline_steps SET status = 'failed', result = ? WHERE step_id = ?
      `).run(JSON.stringify({ error: err.message }), stepId);
            await this.bus.emit((0, shared_1.createEvent)('pipeline.step_completed', 'clawpipe', {
                pipelineId,
                stepName: stepDef.name,
                stepId,
                status: 'failed',
                error: err.message,
            }, { sessionId: session.sessionId, agentId }));
            return {
                stepName: stepDef.name,
                status,
                output: null,
                costUsd: 0,
                durationMs: Date.now() - stepStart,
                agentId,
                sessionId: session.sessionId,
                error: err.message,
            };
        }
    }
    async executeParallelGroup(pipelineId, agentId, group, executor, context, defaultTimeout, startStepNumber) {
        const promises = group.steps.map((stepDef, idx) => this.executeStep(pipelineId, agentId, stepDef, executor, context, defaultTimeout, startStepNumber + idx));
        return Promise.all(promises);
    }
    evaluateCondition(condition, stepResults) {
        const targetResult = stepResults[condition.step];
        if (!targetResult || targetResult.status !== 'completed') {
            return false;
        }
        const output = targetResult.output;
        if (!output || typeof output !== 'object') {
            return false;
        }
        const fieldValue = getNestedValue(output, condition.field.split('.'));
        switch (condition.operator) {
            case 'eq': return fieldValue === condition.value;
            case 'neq': return fieldValue !== condition.value;
            case 'gt': return fieldValue > condition.value;
            case 'lt': return fieldValue < condition.value;
            case 'gte': return fieldValue >= condition.value;
            case 'lte': return fieldValue <= condition.value;
            case 'contains':
                if (typeof fieldValue === 'string')
                    return fieldValue.includes(condition.value);
                if (Array.isArray(fieldValue))
                    return fieldValue.includes(condition.value);
                return false;
            default:
                return false;
        }
    }
    stepMatchesName(stepDef, name) {
        if (stepDef.name === name)
            return true;
        if (stepDef.type === 'parallel') {
            return stepDef.steps.some(s => s.name === name);
        }
        return false;
    }
}
exports.PipelineExecutor = PipelineExecutor;
// ─── Variable Resolution ─────────────────────────────────────────
/**
 * Resolve variable references like ${variables.x} and ${steps.y.output.z}
 * in an input value. Handles strings, objects, and arrays recursively.
 */
function resolveVariables(value, context) {
    if (typeof value === 'string') {
        // Check if entire string is a single variable reference → return resolved type
        const fullMatch = value.match(/^\$\{(.+)\}$/);
        if (fullMatch) {
            return resolvePath(fullMatch[1], context);
        }
        // Embedded references → string interpolation
        return value.replace(/\$\{([^}]+)\}/g, (_, path) => {
            const resolved = resolvePath(path, context);
            return String(resolved ?? '');
        });
    }
    if (Array.isArray(value)) {
        return value.map(v => resolveVariables(v, context));
    }
    if (value && typeof value === 'object') {
        const result = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = resolveVariables(v, context);
        }
        return result;
    }
    return value;
}
function resolvePath(path, context) {
    const parts = path.split('.');
    if (parts[0] === 'variables') {
        return getNestedValue(context.variables, parts.slice(1));
    }
    if (parts[0] === 'steps') {
        const stepName = parts[1];
        const stepResult = context.stepResults[stepName];
        if (!stepResult) {
            throw new Error(`Variable resolution failed: step "${stepName}" has no result yet`);
        }
        if (stepResult.status !== 'completed') {
            throw new Error(`Variable resolution failed: step "${stepName}" did not complete successfully`);
        }
        // ${steps.x.output} → the full output
        // ${steps.x.output.field} → a field in the output
        if (parts[2] === 'output') {
            if (parts.length === 3) {
                return stepResult.output;
            }
            return getNestedValue(stepResult.output, parts.slice(3));
        }
        throw new Error(`Variable resolution failed: unknown step property "${parts[2]}"`);
    }
    throw new Error(`Variable resolution failed: unknown root "${parts[0]}"`);
}
function getNestedValue(obj, path) {
    let current = obj;
    for (const key of path) {
        if (current === null || current === undefined)
            return undefined;
        if (typeof current !== 'object')
            return undefined;
        current = current[key];
    }
    return current;
}
// ─── Timeout Utility ─────────────────────────────────────────────
function withTimeout(promise, ms, message) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then((val) => { clearTimeout(timer); resolve(val); }, (err) => { clearTimeout(timer); reject(err); });
    });
}
//# sourceMappingURL=pipeline-executor.js.map