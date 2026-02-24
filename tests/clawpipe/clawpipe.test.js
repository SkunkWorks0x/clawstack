"use strict";
/**
 * ClawPipe Test Suite — Deterministic Multi-Agent Pipeline Framework
 *
 * Tests all four components:
 * 1. Pipeline Parser — YAML parsing, validation, step structures
 * 2. Result Validator — Schema validation, type checking
 * 3. Pipeline Executor — Sequential, parallel, conditions, timeout, cost, events
 * 4. Pipeline Registry — Save, load, list, history, cost summary
 * 5. Integration — SessionGraph writes, EventBus emissions, cross-product flow
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const shared_1 = require("@clawstack/shared");
const clawpipe_1 = require("@clawstack/clawpipe");
// ─── Test Helpers ─────────────────────────────────────────────────
let tempDir;
let graph;
let bus;
(0, vitest_1.beforeEach)(() => {
    tempDir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'clawpipe-test-'));
    graph = new shared_1.SessionGraph((0, path_1.join)(tempDir, 'test.db'));
    bus = new shared_1.EventBus();
});
(0, vitest_1.afterEach)(() => {
    graph.close();
    (0, fs_1.rmSync)(tempDir, { recursive: true, force: true });
});
function createTestExecutor(results) {
    return async (ctx) => {
        const output = results[ctx.stepName];
        if (output === undefined) {
            throw new Error(`No mock result for step "${ctx.stepName}"`);
        }
        return {
            output,
            model: 'claude-haiku-4-5',
            inputTokens: 100,
            outputTokens: 50,
            estimatedCostUsd: 0.001,
        };
    };
}
const SIMPLE_YAML = `
name: simple-pipeline
description: A simple two-step pipeline
variables:
  startup: TechCorp
steps:
  - name: analyze
    skill: market-analyzer
    input:
      company: "\${variables.startup}"
    outputSchema:
      type: object
      properties:
        score:
          type: number
      required:
        - score
    timeout: 5000
  - name: report
    skill: report-writer
    input:
      score: "\${steps.analyze.output.score}"
    timeout: 5000
`;
const PARALLEL_YAML = `
name: multi-scorer
description: Jason Calacanis scoring pipeline
variables:
  startup: TechCorp
steps:
  - name: score-all
    parallel:
      - name: market-score
        skill: market-analyzer
        input:
          company: "\${variables.startup}"
        outputSchema:
          type: object
          properties:
            score:
              type: number
          required:
            - score
        timeout: 5000
      - name: team-score
        skill: team-evaluator
        input:
          company: "\${variables.startup}"
        outputSchema:
          type: object
          properties:
            score:
              type: number
          required:
            - score
        timeout: 5000
      - name: tech-score
        skill: tech-evaluator
        input:
          company: "\${variables.startup}"
        outputSchema:
          type: object
          properties:
            score:
              type: number
          required:
            - score
        timeout: 5000
  - name: synthesize
    agent: ultron
    input:
      market: "\${steps.market-score.output.score}"
      team: "\${steps.team-score.output.score}"
      tech: "\${steps.tech-score.output.score}"
    timeout: 10000
`;
const CONDITION_YAML = `
name: conditional-pipeline
variables:
  startup: TechCorp
steps:
  - name: initial-check
    skill: quick-checker
    input:
      company: "\${variables.startup}"
    outputSchema:
      type: object
      properties:
        score:
          type: number
      required:
        - score
    timeout: 5000
    condition:
      step: initial-check
      field: score
      operator: gt
      value: 70
      goto: deep-analysis
  - name: shallow-report
    skill: shallow-reporter
    input:
      company: "\${variables.startup}"
    timeout: 5000
  - name: deep-analysis
    skill: deep-analyzer
    input:
      company: "\${variables.startup}"
      score: "\${steps.initial-check.output.score}"
    timeout: 10000
`;
// ═══════════════════════════════════════════════════════════════════
// 1. PIPELINE PARSER
// ═══════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('Pipeline Parser', () => {
    (0, vitest_1.it)('parses a simple sequential pipeline', () => {
        const result = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(result.ok).toBe(true);
        if (!result.ok)
            return;
        const def = result.definition;
        (0, vitest_1.expect)(def.name).toBe('simple-pipeline');
        (0, vitest_1.expect)(def.description).toBe('A simple two-step pipeline');
        (0, vitest_1.expect)(def.variables).toEqual({ startup: 'TechCorp' });
        (0, vitest_1.expect)(def.steps).toHaveLength(2);
        const step0 = def.steps[0];
        (0, vitest_1.expect)(step0.type).toBe('sequential');
        (0, vitest_1.expect)(step0.name).toBe('analyze');
        if (step0.type === 'sequential') {
            (0, vitest_1.expect)(step0.skill).toBe('market-analyzer');
            (0, vitest_1.expect)(step0.timeout).toBe(5000);
            (0, vitest_1.expect)(step0.outputSchema).toBeDefined();
            (0, vitest_1.expect)(step0.outputSchema.required).toContain('score');
        }
    });
    (0, vitest_1.it)('parses a pipeline with parallel groups', () => {
        const result = (0, clawpipe_1.parsePipeline)(PARALLEL_YAML);
        (0, vitest_1.expect)(result.ok).toBe(true);
        if (!result.ok)
            return;
        const def = result.definition;
        (0, vitest_1.expect)(def.name).toBe('multi-scorer');
        (0, vitest_1.expect)(def.steps).toHaveLength(2);
        const parallel = def.steps[0];
        (0, vitest_1.expect)(parallel.type).toBe('parallel');
        if (parallel.type === 'parallel') {
            (0, vitest_1.expect)(parallel.steps).toHaveLength(3);
            (0, vitest_1.expect)(parallel.steps[0].name).toBe('market-score');
            (0, vitest_1.expect)(parallel.steps[1].name).toBe('team-score');
            (0, vitest_1.expect)(parallel.steps[2].name).toBe('tech-score');
        }
    });
    (0, vitest_1.it)('parses a pipeline with conditions', () => {
        const result = (0, clawpipe_1.parsePipeline)(CONDITION_YAML);
        (0, vitest_1.expect)(result.ok).toBe(true);
        if (!result.ok)
            return;
        const step0 = result.definition.steps[0];
        if (step0.type === 'sequential') {
            (0, vitest_1.expect)(step0.condition).toBeDefined();
            (0, vitest_1.expect)(step0.condition.step).toBe('initial-check');
            (0, vitest_1.expect)(step0.condition.field).toBe('score');
            (0, vitest_1.expect)(step0.condition.operator).toBe('gt');
            (0, vitest_1.expect)(step0.condition.value).toBe(70);
            (0, vitest_1.expect)(step0.condition.goto).toBe('deep-analysis');
        }
    });
    (0, vitest_1.it)('rejects invalid YAML', () => {
        const result = (0, clawpipe_1.parsePipeline)('{{not: valid yaml');
        (0, vitest_1.expect)(result.ok).toBe(false);
        if (!result.ok) {
            (0, vitest_1.expect)(result.errors[0]).toContain('YAML parse error');
        }
    });
    (0, vitest_1.it)('rejects missing name', () => {
        const result = (0, clawpipe_1.parsePipeline)(`
steps:
  - name: step1
    skill: test
`);
        (0, vitest_1.expect)(result.ok).toBe(false);
        if (!result.ok) {
            (0, vitest_1.expect)(result.errors.some(e => e.includes('"name" is required'))).toBe(true);
        }
    });
    (0, vitest_1.it)('rejects missing steps', () => {
        const result = (0, clawpipe_1.parsePipeline)(`
name: test-pipeline
`);
        (0, vitest_1.expect)(result.ok).toBe(false);
        if (!result.ok) {
            (0, vitest_1.expect)(result.errors.some(e => e.includes('"steps" is required'))).toBe(true);
        }
    });
    (0, vitest_1.it)('rejects empty steps array', () => {
        const result = (0, clawpipe_1.parsePipeline)(`
name: test
steps: []
`);
        (0, vitest_1.expect)(result.ok).toBe(false);
    });
    (0, vitest_1.it)('rejects steps without skill or agent', () => {
        const result = (0, clawpipe_1.parsePipeline)(`
name: test
steps:
  - name: bad-step
    input: {}
`);
        (0, vitest_1.expect)(result.ok).toBe(false);
        if (!result.ok) {
            (0, vitest_1.expect)(result.errors.some(e => e.includes('must have either "skill" or "agent"'))).toBe(true);
        }
    });
    (0, vitest_1.it)('rejects duplicate step names', () => {
        const result = (0, clawpipe_1.parsePipeline)(`
name: test
steps:
  - name: same-name
    skill: test
  - name: same-name
    skill: test
`);
        (0, vitest_1.expect)(result.ok).toBe(false);
        if (!result.ok) {
            (0, vitest_1.expect)(result.errors.some(e => e.includes('duplicate step name'))).toBe(true);
        }
    });
    (0, vitest_1.it)('rejects condition referencing unknown step', () => {
        const result = (0, clawpipe_1.parsePipeline)(`
name: test
steps:
  - name: step1
    skill: test
    condition:
      step: nonexistent
      field: score
      operator: gt
      value: 50
      goto: also-nonexistent
`);
        (0, vitest_1.expect)(result.ok).toBe(false);
        if (!result.ok) {
            (0, vitest_1.expect)(result.errors.some(e => e.includes('unknown step'))).toBe(true);
        }
    });
    (0, vitest_1.it)('applies default timeout of 30000ms', () => {
        const result = (0, clawpipe_1.parsePipeline)(`
name: test
steps:
  - name: step1
    skill: test
`);
        (0, vitest_1.expect)(result.ok).toBe(true);
        if (result.ok && result.definition.steps[0].type === 'sequential') {
            (0, vitest_1.expect)(result.definition.steps[0].timeout).toBe(30000);
        }
    });
    (0, vitest_1.it)('counts steps correctly with parallel groups', () => {
        const result = (0, clawpipe_1.parsePipeline)(PARALLEL_YAML);
        (0, vitest_1.expect)(result.ok).toBe(true);
        if (result.ok) {
            (0, vitest_1.expect)((0, clawpipe_1.countSteps)(result.definition)).toBe(4); // 3 parallel + 1 sequential
        }
    });
    (0, vitest_1.it)('getAllStepNames returns all names including parallel sub-steps', () => {
        const result = (0, clawpipe_1.parsePipeline)(PARALLEL_YAML);
        (0, vitest_1.expect)(result.ok).toBe(true);
        if (result.ok) {
            const names = (0, clawpipe_1.getAllStepNames)(result.definition);
            (0, vitest_1.expect)(names).toContain('score-all');
            (0, vitest_1.expect)(names).toContain('market-score');
            (0, vitest_1.expect)(names).toContain('team-score');
            (0, vitest_1.expect)(names).toContain('tech-score');
            (0, vitest_1.expect)(names).toContain('synthesize');
        }
    });
    (0, vitest_1.it)('validateAndTransform accepts raw objects', () => {
        const raw = {
            name: 'raw-test',
            steps: [{ name: 's1', skill: 'test', input: {} }],
        };
        const result = (0, clawpipe_1.validateAndTransform)(raw);
        (0, vitest_1.expect)(result.ok).toBe(true);
    });
    (0, vitest_1.it)('rejects non-object input', () => {
        const result = (0, clawpipe_1.validateAndTransform)('not an object');
        (0, vitest_1.expect)(result.ok).toBe(false);
    });
    (0, vitest_1.it)('rejects invalid condition operator', () => {
        const result = (0, clawpipe_1.parsePipeline)(`
name: test
steps:
  - name: step1
    skill: test
    condition:
      step: step1
      field: x
      operator: invalid_op
      value: 1
      goto: step1
`);
        (0, vitest_1.expect)(result.ok).toBe(false);
        if (!result.ok) {
            (0, vitest_1.expect)(result.errors.some(e => e.includes('operator'))).toBe(true);
        }
    });
});
// ═══════════════════════════════════════════════════════════════════
// 2. RESULT VALIDATOR
// ═══════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('Result Validator', () => {
    (0, vitest_1.it)('validates basic types', () => {
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)('hello', { type: 'string' }).valid).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)(42, { type: 'number' }).valid).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)(true, { type: 'boolean' }).valid).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)(null, { type: 'null' }).valid).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)([1, 2], { type: 'array' }).valid).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)({ a: 1 }, { type: 'object' }).valid).toBe(true);
    });
    (0, vitest_1.it)('rejects type mismatches', () => {
        const result = (0, clawpipe_1.validateSchema)('hello', { type: 'number' });
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.errors[0]).toContain('expected type "number"');
        (0, vitest_1.expect)(result.errors[0]).toContain('got "string"');
    });
    (0, vitest_1.it)('validates object with required fields', () => {
        const schema = {
            type: 'object',
            properties: {
                score: { type: 'number' },
                reasoning: { type: 'string' },
            },
            required: ['score', 'reasoning'],
        };
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)({ score: 85, reasoning: 'good' }, schema).valid).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)({ score: 85 }, schema).valid).toBe(false);
    });
    (0, vitest_1.it)('validates nested object properties', () => {
        const schema = {
            type: 'object',
            properties: {
                data: {
                    type: 'object',
                    properties: {
                        value: { type: 'number', minimum: 0, maximum: 100 },
                    },
                    required: ['value'],
                },
            },
            required: ['data'],
        };
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)({ data: { value: 50 } }, schema).valid).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)({ data: { value: 150 } }, schema).valid).toBe(false);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)({ data: {} }, schema).valid).toBe(false); // missing required 'value'
    });
    (0, vitest_1.it)('validates number range', () => {
        const schema = { type: 'number', minimum: 0, maximum: 100 };
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)(50, schema).valid).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)(0, schema).valid).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)(100, schema).valid).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)(-1, schema).valid).toBe(false);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)(101, schema).valid).toBe(false);
    });
    (0, vitest_1.it)('validates string length', () => {
        const schema = { type: 'string', minLength: 2, maxLength: 10 };
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)('hello', schema).valid).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)('a', schema).valid).toBe(false);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)('this is too long', schema).valid).toBe(false);
    });
    (0, vitest_1.it)('validates arrays with item schema', () => {
        const schema = {
            type: 'array',
            items: { type: 'number', minimum: 0 },
        };
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)([1, 2, 3], schema).valid).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)([1, -1, 3], schema).valid).toBe(false);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)([1, 'two', 3], schema).valid).toBe(false);
    });
    (0, vitest_1.it)('validates enum values', () => {
        const schema = { enum: ['high', 'medium', 'low'] };
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)('high', schema).valid).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)('invalid', schema).valid).toBe(false);
    });
    (0, vitest_1.it)('passes empty schema (anything valid)', () => {
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)('anything', {}).valid).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)(42, {}).valid).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.validateSchema)(null, {}).valid).toBe(true);
    });
    (0, vitest_1.it)('validates step output with clear error messages', () => {
        const schema = {
            type: 'object',
            required: ['score'],
        };
        const result = (0, clawpipe_1.validateStepOutput)('analyze', { name: 'test' }, schema);
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.errors[0]).toContain('step "analyze"');
        (0, vitest_1.expect)(result.errors[0]).toContain('missing required field "score"');
    });
    (0, vitest_1.it)('validates step input', () => {
        const schema = {
            type: 'object',
            properties: {
                company: { type: 'string' },
            },
            required: ['company'],
        };
        (0, vitest_1.expect)((0, clawpipe_1.validateStepInput)('analyze', { company: 'TechCorp' }, schema).valid).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.validateStepInput)('analyze', {}, schema).valid).toBe(false);
    });
    (0, vitest_1.it)('validates step compatibility', () => {
        const outputSchema = { type: 'string' };
        const inputSchema = {
            type: 'object',
            required: ['data'],
        };
        const result = (0, clawpipe_1.validateStepCompatibility)('step1', outputSchema, 'step2', inputSchema);
        (0, vitest_1.expect)(result.valid).toBe(false);
        (0, vitest_1.expect)(result.errors[0]).toContain('expects object input');
    });
    (0, vitest_1.it)('compatibility passes when schemas are compatible', () => {
        const outputSchema = {
            type: 'object',
            properties: { score: { type: 'number' } },
        };
        const inputSchema = {
            type: 'object',
            required: ['score'],
        };
        const result = (0, clawpipe_1.validateStepCompatibility)('step1', outputSchema, 'step2', inputSchema);
        (0, vitest_1.expect)(result.valid).toBe(true);
    });
    (0, vitest_1.it)('compatibility passes when schemas are missing', () => {
        (0, vitest_1.expect)((0, clawpipe_1.validateStepCompatibility)('s1', undefined, 's2', undefined).valid).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.validateStepCompatibility)('s1', { type: 'object' }, 's2', undefined).valid).toBe(true);
    });
});
// ═══════════════════════════════════════════════════════════════════
// 3. VARIABLE RESOLUTION
// ═══════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('Variable Resolution', () => {
    (0, vitest_1.it)('resolves simple variable references', () => {
        const context = {
            variables: { startup: 'TechCorp', year: 2026 },
            stepResults: {},
        };
        (0, vitest_1.expect)((0, clawpipe_1.resolveVariables)('${variables.startup}', context)).toBe('TechCorp');
        (0, vitest_1.expect)((0, clawpipe_1.resolveVariables)('${variables.year}', context)).toBe(2026);
    });
    (0, vitest_1.it)('resolves step output references', () => {
        const context = {
            variables: {},
            stepResults: {
                'market-score': {
                    stepName: 'market-score',
                    status: 'completed',
                    output: { score: 85, reasoning: 'strong market' },
                    costUsd: 0.01,
                    durationMs: 100,
                    agentId: null,
                    sessionId: null,
                },
            },
        };
        (0, vitest_1.expect)((0, clawpipe_1.resolveVariables)('${steps.market-score.output.score}', context)).toBe(85);
        (0, vitest_1.expect)((0, clawpipe_1.resolveVariables)('${steps.market-score.output}', context)).toEqual({
            score: 85,
            reasoning: 'strong market',
        });
    });
    (0, vitest_1.it)('resolves embedded variable references in strings', () => {
        const context = {
            variables: { name: 'TechCorp' },
            stepResults: {
                step1: {
                    stepName: 'step1',
                    status: 'completed',
                    output: { score: 85 },
                    costUsd: 0,
                    durationMs: 0,
                    agentId: null,
                    sessionId: null,
                },
            },
        };
        (0, vitest_1.expect)((0, clawpipe_1.resolveVariables)('Company: ${variables.name}, Score: ${steps.step1.output.score}', context))
            .toBe('Company: TechCorp, Score: 85');
    });
    (0, vitest_1.it)('resolves variables in objects recursively', () => {
        const context = {
            variables: { startup: 'TechCorp' },
            stepResults: {},
        };
        const result = (0, clawpipe_1.resolveVariables)({
            company: '${variables.startup}',
            nested: { name: '${variables.startup}' },
        }, context);
        (0, vitest_1.expect)(result).toEqual({
            company: 'TechCorp',
            nested: { name: 'TechCorp' },
        });
    });
    (0, vitest_1.it)('resolves variables in arrays', () => {
        const context = {
            variables: { a: 'x', b: 'y' },
            stepResults: {},
        };
        (0, vitest_1.expect)((0, clawpipe_1.resolveVariables)(['${variables.a}', '${variables.b}'], context))
            .toEqual(['x', 'y']);
    });
    (0, vitest_1.it)('passes through non-string values unchanged', () => {
        const context = { variables: {}, stepResults: {} };
        (0, vitest_1.expect)((0, clawpipe_1.resolveVariables)(42, context)).toBe(42);
        (0, vitest_1.expect)((0, clawpipe_1.resolveVariables)(true, context)).toBe(true);
        (0, vitest_1.expect)((0, clawpipe_1.resolveVariables)(null, context)).toBe(null);
    });
    (0, vitest_1.it)('throws on reference to nonexistent step', () => {
        const context = { variables: {}, stepResults: {} };
        (0, vitest_1.expect)(() => (0, clawpipe_1.resolveVariables)('${steps.missing.output}', context))
            .toThrow('step "missing" has no result yet');
    });
    (0, vitest_1.it)('throws on reference to failed step', () => {
        const context = {
            variables: {},
            stepResults: {
                failed: {
                    stepName: 'failed',
                    status: 'failed',
                    output: null,
                    costUsd: 0,
                    durationMs: 0,
                    agentId: null,
                    sessionId: null,
                    error: 'something broke',
                },
            },
        };
        (0, vitest_1.expect)(() => (0, clawpipe_1.resolveVariables)('${steps.failed.output}', context))
            .toThrow('did not complete successfully');
    });
    (0, vitest_1.it)('throws on unknown variable root', () => {
        const context = { variables: {}, stepResults: {} };
        (0, vitest_1.expect)(() => (0, clawpipe_1.resolveVariables)('${unknown.path}', context))
            .toThrow('unknown root "unknown"');
    });
});
// ═══════════════════════════════════════════════════════════════════
// 4. PIPELINE EXECUTOR
// ═══════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('Pipeline Executor', () => {
    (0, vitest_1.it)('executes a simple sequential pipeline', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const executor = createTestExecutor({
            analyze: { score: 85 },
            report: { summary: 'Good company' },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        (0, vitest_1.expect)(result.status).toBe('completed');
        (0, vitest_1.expect)(result.steps).toHaveLength(2);
        (0, vitest_1.expect)(result.steps[0].stepName).toBe('analyze');
        (0, vitest_1.expect)(result.steps[0].status).toBe('completed');
        (0, vitest_1.expect)(result.steps[0].output).toEqual({ score: 85 });
        (0, vitest_1.expect)(result.steps[1].stepName).toBe('report');
        (0, vitest_1.expect)(result.steps[1].status).toBe('completed');
        (0, vitest_1.expect)(result.totalCostUsd).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('executes a parallel pipeline (Jason Calacanis use case)', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(PARALLEL_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const executor = createTestExecutor({
            'market-score': { score: 85 },
            'team-score': { score: 70 },
            'tech-score': { score: 90 },
            synthesize: { verdict: 'strong investment', avgScore: 81.7 },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        (0, vitest_1.expect)(result.status).toBe('completed');
        (0, vitest_1.expect)(result.steps).toHaveLength(4); // 3 parallel + 1 sequential
        // All parallel steps completed
        (0, vitest_1.expect)(result.steps[0].status).toBe('completed');
        (0, vitest_1.expect)(result.steps[1].status).toBe('completed');
        (0, vitest_1.expect)(result.steps[2].status).toBe('completed');
        // Synthesis step completed
        (0, vitest_1.expect)(result.steps[3].stepName).toBe('synthesize');
        (0, vitest_1.expect)(result.steps[3].status).toBe('completed');
    });
    (0, vitest_1.it)('handles conditional branching (condition true → jump)', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(CONDITION_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        // Score > 70 → should jump to deep-analysis, skip shallow-report
        const executor = createTestExecutor({
            'initial-check': { score: 85 },
            'deep-analysis': { result: 'deep insights' },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        (0, vitest_1.expect)(result.status).toBe('completed');
        (0, vitest_1.expect)(result.steps).toHaveLength(2); // initial-check + deep-analysis
        (0, vitest_1.expect)(result.steps[0].stepName).toBe('initial-check');
        (0, vitest_1.expect)(result.steps[1].stepName).toBe('deep-analysis');
        // shallow-report was skipped
        (0, vitest_1.expect)(result.steps.find(s => s.stepName === 'shallow-report')).toBeUndefined();
    });
    (0, vitest_1.it)('handles conditional branching (condition false → continue)', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(CONDITION_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        // Score <= 70 → should continue to shallow-report, then deep-analysis
        const executor = createTestExecutor({
            'initial-check': { score: 50 },
            'shallow-report': { summary: 'quick report' },
            'deep-analysis': { result: 'deep insights' },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        (0, vitest_1.expect)(result.status).toBe('completed');
        (0, vitest_1.expect)(result.steps).toHaveLength(3);
        (0, vitest_1.expect)(result.steps[0].stepName).toBe('initial-check');
        (0, vitest_1.expect)(result.steps[1].stepName).toBe('shallow-report');
        (0, vitest_1.expect)(result.steps[2].stepName).toBe('deep-analysis');
    });
    (0, vitest_1.it)('handles step execution failure', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const executor = async (ctx) => {
            if (ctx.stepName === 'analyze') {
                throw new Error('API call failed');
            }
            return { output: {} };
        };
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        (0, vitest_1.expect)(result.status).toBe('failed');
        (0, vitest_1.expect)(result.steps).toHaveLength(1); // Only first step attempted
        (0, vitest_1.expect)(result.steps[0].status).toBe('failed');
        (0, vitest_1.expect)(result.steps[0].error).toContain('API call failed');
    });
    (0, vitest_1.it)('handles step timeout', async () => {
        const yaml = `
name: timeout-test
steps:
  - name: slow-step
    skill: slow-skill
    timeout: 100
`;
        const parsed = (0, clawpipe_1.parsePipeline)(yaml);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const executor = async () => {
            await new Promise(resolve => setTimeout(resolve, 500));
            return { output: 'too late' };
        };
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        (0, vitest_1.expect)(result.status).toBe('failed');
        (0, vitest_1.expect)(result.steps[0].status).toBe('timeout');
        (0, vitest_1.expect)(result.steps[0].error).toContain('timed out');
    });
    (0, vitest_1.it)('validates step output against schema', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        // Return invalid output (missing required 'score' field)
        const executor = async (ctx) => {
            if (ctx.stepName === 'analyze') {
                return { output: { name: 'no score here' } }; // missing 'score'
            }
            return { output: {} };
        };
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        (0, vitest_1.expect)(result.status).toBe('failed');
        (0, vitest_1.expect)(result.steps[0].status).toBe('failed');
        (0, vitest_1.expect)(result.steps[0].error).toContain('missing required field');
    });
    (0, vitest_1.it)('creates sessions per step in Session Graph', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const executor = createTestExecutor({
            analyze: { score: 85 },
            report: { summary: 'done' },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        // Each step should have created a session
        (0, vitest_1.expect)(result.steps[0].sessionId).toBeTruthy();
        (0, vitest_1.expect)(result.steps[1].sessionId).toBeTruthy();
        (0, vitest_1.expect)(result.steps[0].sessionId).not.toBe(result.steps[1].sessionId);
    });
    (0, vitest_1.it)('records cost per step', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const executor = createTestExecutor({
            analyze: { score: 85 },
            report: { summary: 'done' },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        // Check cost recorded in Session Graph
        for (const step of result.steps) {
            const cost = graph.getSessionCost(step.sessionId);
            (0, vitest_1.expect)(cost.costUsd).toBeGreaterThan(0);
            (0, vitest_1.expect)(cost.tokens).toBeGreaterThan(0);
        }
    });
    (0, vitest_1.it)('emits events for each step and pipeline completion', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const events = [];
        bus.on('pipeline.*', (evt) => { events.push(evt); });
        const executor = createTestExecutor({
            analyze: { score: 85 },
            report: { summary: 'done' },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        await pipe.execute(parsed.definition, executor);
        // Should have 2 step_completed + 1 pipeline.completed
        const stepEvents = events.filter(e => e.channel === 'pipeline.step_completed');
        const completedEvents = events.filter(e => e.channel === 'pipeline.completed');
        (0, vitest_1.expect)(stepEvents).toHaveLength(2);
        (0, vitest_1.expect)(completedEvents).toHaveLength(1);
    });
    (0, vitest_1.it)('emits pipeline.failed event on failure', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const events = [];
        bus.on('pipeline.failed', (evt) => { events.push(evt); });
        const executor = async () => { throw new Error('boom'); };
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        await pipe.execute(parsed.definition, executor);
        (0, vitest_1.expect)(events).toHaveLength(1);
        (0, vitest_1.expect)(events[0].payload.error).toContain('boom');
    });
    (0, vitest_1.it)('supports variable overrides via options', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        let capturedInput = {};
        const executor = async (ctx) => {
            if (ctx.stepName === 'analyze') {
                capturedInput = ctx.input;
            }
            return { output: { score: 90 } };
        };
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        await pipe.execute(parsed.definition, executor, {
            variables: { startup: 'OverrideCorp' },
        });
        (0, vitest_1.expect)(capturedInput.company).toBe('OverrideCorp');
    });
    (0, vitest_1.it)('respects max cost limit', async () => {
        const yaml = `
name: expensive-pipeline
steps:
  - name: step1
    skill: test
    timeout: 5000
  - name: step2
    skill: test
    timeout: 5000
  - name: step3
    skill: test
    timeout: 5000
`;
        const parsed = (0, clawpipe_1.parsePipeline)(yaml);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const executor = async () => ({
            output: { done: true },
            estimatedCostUsd: 5.0, // $5 per step
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor, {
            maxTotalCostUsd: 6.0, // Should stop after step1 ($5) + step2 ($5) = $10 > $6
        });
        // Step1 executes ($5), step2 sees totalCost >= limit → stops
        (0, vitest_1.expect)(result.status).toBe('failed');
        (0, vitest_1.expect)(result.steps.length).toBeLessThan(3);
    });
    (0, vitest_1.it)('writes pipeline record to DB', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const executor = createTestExecutor({
            analyze: { score: 85 },
            report: { summary: 'done' },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        // Verify pipeline record in DB
        const db = graph.getDb();
        const row = db.prepare('SELECT * FROM pipelines WHERE pipeline_id = ?').get(result.pipelineId);
        (0, vitest_1.expect)(row).toBeTruthy();
        (0, vitest_1.expect)(row.name).toBe('simple-pipeline');
        (0, vitest_1.expect)(row.status).toBe('completed');
        (0, vitest_1.expect)(row.total_cost_usd).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('writes pipeline_steps records to DB', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const executor = createTestExecutor({
            analyze: { score: 85 },
            report: { summary: 'done' },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        const db = graph.getDb();
        const steps = db.prepare('SELECT * FROM pipeline_steps WHERE pipeline_id = ? ORDER BY step_number').all(result.pipelineId);
        (0, vitest_1.expect)(steps).toHaveLength(2);
        (0, vitest_1.expect)(steps[0].name).toBe('analyze');
        (0, vitest_1.expect)(steps[0].status).toBe('completed');
        (0, vitest_1.expect)(steps[1].name).toBe('report');
        (0, vitest_1.expect)(steps[1].status).toBe('completed');
    });
    (0, vitest_1.it)('links sessions to pipeline via pipeline_id', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const executor = createTestExecutor({
            analyze: { score: 85 },
            report: { summary: 'done' },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        const db = graph.getDb();
        const sessions = db.prepare('SELECT * FROM sessions WHERE pipeline_id = ?').all(result.pipelineId);
        (0, vitest_1.expect)(sessions).toHaveLength(2);
        (0, vitest_1.expect)(sessions[0].pipeline_id).toBe(result.pipelineId);
    });
});
// ═══════════════════════════════════════════════════════════════════
// 5. PIPELINE REGISTRY
// ═══════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('Pipeline Registry', () => {
    (0, vitest_1.it)('saves and loads a pipeline definition', () => {
        const registry = new clawpipe_1.PipelineRegistry(graph);
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const pipelineId = registry.save(parsed.definition, SIMPLE_YAML);
        (0, vitest_1.expect)(pipelineId).toBeTruthy();
        const loaded = registry.load(pipelineId);
        (0, vitest_1.expect)(loaded).toBeTruthy();
        (0, vitest_1.expect)(loaded.name).toBe('simple-pipeline');
        (0, vitest_1.expect)(loaded.status).toBe('pending');
        (0, vitest_1.expect)(loaded.totalSteps).toBe(2);
    });
    (0, vitest_1.it)('lists pipelines ordered by creation date', () => {
        const registry = new clawpipe_1.PipelineRegistry(graph);
        const parsed1 = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        const parsed2 = (0, clawpipe_1.parsePipeline)(PARALLEL_YAML);
        (0, vitest_1.expect)(parsed1.ok).toBe(true);
        (0, vitest_1.expect)(parsed2.ok).toBe(true);
        if (!parsed1.ok || !parsed2.ok)
            return;
        registry.save(parsed1.definition, SIMPLE_YAML);
        registry.save(parsed2.definition, PARALLEL_YAML);
        const list = registry.list();
        (0, vitest_1.expect)(list).toHaveLength(2);
        // Both pipelines present (order by rowid DESC within same timestamp)
        const names = list.map(p => p.name);
        (0, vitest_1.expect)(names).toContain('simple-pipeline');
        (0, vitest_1.expect)(names).toContain('multi-scorer');
    });
    (0, vitest_1.it)('gets execution history for a named pipeline', async () => {
        const registry = new clawpipe_1.PipelineRegistry(graph);
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const executor = createTestExecutor({
            analyze: { score: 85 },
            report: { summary: 'done' },
        });
        // Execute twice
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        await pipe.execute(parsed.definition, executor);
        await pipe.execute(parsed.definition, executor);
        const history = registry.getHistory('simple-pipeline');
        (0, vitest_1.expect)(history).toHaveLength(2);
        (0, vitest_1.expect)(history.every(p => p.name === 'simple-pipeline')).toBe(true);
    });
    (0, vitest_1.it)('gets cost summary for a pipeline execution', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const executor = createTestExecutor({
            analyze: { score: 85 },
            report: { summary: 'done' },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        const registry = new clawpipe_1.PipelineRegistry(graph);
        const summary = registry.getCostSummary(result.pipelineId);
        (0, vitest_1.expect)(summary).toBeTruthy();
        (0, vitest_1.expect)(summary.totalCostUsd).toBeGreaterThan(0);
        (0, vitest_1.expect)(summary.stepCosts).toHaveLength(2);
    });
    (0, vitest_1.it)('gets aggregate cost across executions', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const executor = createTestExecutor({
            analyze: { score: 85 },
            report: { summary: 'done' },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        await pipe.execute(parsed.definition, executor);
        await pipe.execute(parsed.definition, executor);
        const registry = new clawpipe_1.PipelineRegistry(graph);
        const agg = registry.getAggregateCost('simple-pipeline');
        (0, vitest_1.expect)(agg.executionCount).toBe(2);
        (0, vitest_1.expect)(agg.totalCostUsd).toBeGreaterThan(0);
        (0, vitest_1.expect)(agg.avgCostUsd).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('gets steps for a pipeline execution', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const executor = createTestExecutor({
            analyze: { score: 85 },
            report: { summary: 'done' },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        const registry = new clawpipe_1.PipelineRegistry(graph);
        const steps = registry.getSteps(result.pipelineId);
        (0, vitest_1.expect)(steps).toHaveLength(2);
        (0, vitest_1.expect)(steps[0].name).toBe('analyze');
        (0, vitest_1.expect)(steps[0].result).toEqual({ score: 85 });
        (0, vitest_1.expect)(steps[1].name).toBe('report');
    });
    (0, vitest_1.it)('deletes a pipeline and its steps', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const executor = createTestExecutor({
            analyze: { score: 85 },
            report: { summary: 'done' },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        const registry = new clawpipe_1.PipelineRegistry(graph);
        (0, vitest_1.expect)(registry.load(result.pipelineId)).toBeTruthy();
        const deleted = registry.delete(result.pipelineId);
        (0, vitest_1.expect)(deleted).toBe(true);
        (0, vitest_1.expect)(registry.load(result.pipelineId)).toBeNull();
        (0, vitest_1.expect)(registry.getSteps(result.pipelineId)).toHaveLength(0);
    });
    (0, vitest_1.it)('returns null for nonexistent pipeline', () => {
        const registry = new clawpipe_1.PipelineRegistry(graph);
        (0, vitest_1.expect)(registry.load('nonexistent-id')).toBeNull();
    });
});
// ═══════════════════════════════════════════════════════════════════
// 6. INTEGRATION — Cross-Product Flow
// ═══════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('Cross-Product Integration', () => {
    (0, vitest_1.it)('full pipeline writes to Session Graph: agent, sessions, costs, pipeline', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(PARALLEL_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const executor = createTestExecutor({
            'market-score': { score: 85 },
            'team-score': { score: 70 },
            'tech-score': { score: 90 },
            synthesize: { verdict: 'invest' },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        // Verify agent created
        const agents = graph.listAgents();
        (0, vitest_1.expect)(agents.some(a => a.name.includes('multi-scorer'))).toBe(true);
        // Verify sessions created (one per step)
        const db = graph.getDb();
        const sessions = db.prepare('SELECT * FROM sessions WHERE pipeline_id = ?').all(result.pipelineId);
        (0, vitest_1.expect)(sessions).toHaveLength(4);
        // Verify costs recorded
        let totalTokens = 0;
        for (const session of sessions) {
            const cost = graph.getSessionCost(session.session_id);
            totalTokens += cost.tokens;
        }
        (0, vitest_1.expect)(totalTokens).toBeGreaterThan(0);
        // Verify pipeline record
        const pipeline = db.prepare('SELECT * FROM pipelines WHERE pipeline_id = ?').get(result.pipelineId);
        (0, vitest_1.expect)(pipeline.status).toBe('completed');
        (0, vitest_1.expect)(pipeline.completed_steps).toBe(4);
    });
    (0, vitest_1.it)('EventBus events contain correct payloads', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const stepEvents = [];
        const pipeEvents = [];
        bus.on('pipeline.step_completed', (evt) => stepEvents.push(evt));
        bus.on('pipeline.completed', (evt) => pipeEvents.push(evt));
        const executor = createTestExecutor({
            analyze: { score: 85 },
            report: { summary: 'done' },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        // Step events have step-level details
        (0, vitest_1.expect)(stepEvents).toHaveLength(2);
        const step1Payload = stepEvents[0].payload;
        (0, vitest_1.expect)(step1Payload.pipelineId).toBe(result.pipelineId);
        (0, vitest_1.expect)(step1Payload.stepName).toBe('analyze');
        (0, vitest_1.expect)(step1Payload.status).toBe('completed');
        // Pipeline completion event
        (0, vitest_1.expect)(pipeEvents).toHaveLength(1);
        const pipePayload = pipeEvents[0].payload;
        (0, vitest_1.expect)(pipePayload.pipelineId).toBe(result.pipelineId);
        (0, vitest_1.expect)(pipePayload.status).toBe('completed');
        (0, vitest_1.expect)(pipePayload.completedSteps).toBe(2);
        (0, vitest_1.expect)(pipePayload.totalCostUsd).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('ClawGuard can monitor step sessions via EventBus', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        // Simulate ClawGuard monitoring
        const monitoredSessions = [];
        bus.on('pipeline.step_completed', (evt) => {
            const sessionId = evt.sessionId;
            if (sessionId)
                monitoredSessions.push(sessionId);
        });
        const executor = createTestExecutor({
            analyze: { score: 85 },
            report: { summary: 'done' },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        await pipe.execute(parsed.definition, executor);
        (0, vitest_1.expect)(monitoredSessions).toHaveLength(2);
        // Each session is unique (ClawGuard monitors independently)
        (0, vitest_1.expect)(new Set(monitoredSessions).size).toBe(2);
    });
    (0, vitest_1.it)('ClawBudget Smart Router integration path', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        // Simulate Smart Router integration via custom executor
        const routingDecisions = [];
        const smartRouterExecutor = async (ctx) => {
            // In real use, this would call SmartRouter.route()
            const complexity = ctx.stepName === 'analyze' ? 'complex' : 'simple';
            const model = complexity === 'complex' ? 'claude-opus-4-6' : 'claude-haiku-4-5';
            routingDecisions.push(`${ctx.stepName} → ${model}`);
            return {
                output: ctx.stepName === 'analyze' ? { score: 85 } : { summary: 'done' },
                model,
                inputTokens: complexity === 'complex' ? 5000 : 500,
                outputTokens: complexity === 'complex' ? 2000 : 200,
                estimatedCostUsd: complexity === 'complex' ? 0.035 : 0.001,
            };
        };
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, smartRouterExecutor);
        (0, vitest_1.expect)(result.status).toBe('completed');
        (0, vitest_1.expect)(routingDecisions).toEqual([
            'analyze → claude-opus-4-6',
            'report → claude-haiku-4-5',
        ]);
        // Opus step should cost more than Haiku step
        (0, vitest_1.expect)(result.steps[0].costUsd).toBeGreaterThan(result.steps[1].costUsd);
    });
    (0, vitest_1.it)('uses pre-registered agent when provided', async () => {
        const parsed = (0, clawpipe_1.parsePipeline)(SIMPLE_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const agent = graph.registerAgent({
            name: 'my-pipeline-agent',
            platform: 'openclaw',
            version: '2.0.0',
            dockerSandboxed: true,
            metadata: {},
        });
        const executor = createTestExecutor({
            analyze: { score: 85 },
            report: { summary: 'done' },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor, {
            agentId: agent.agentId,
        });
        (0, vitest_1.expect)(result.status).toBe('completed');
        (0, vitest_1.expect)(result.steps[0].agentId).toBe(agent.agentId);
        (0, vitest_1.expect)(result.steps[1].agentId).toBe(agent.agentId);
    });
    (0, vitest_1.it)('end-to-end: parse YAML → execute → registry → cost', async () => {
        // Full flow: parse, execute, query
        const parsed = (0, clawpipe_1.parsePipeline)(PARALLEL_YAML);
        (0, vitest_1.expect)(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const executor = createTestExecutor({
            'market-score': { score: 85 },
            'team-score': { score: 70 },
            'tech-score': { score: 90 },
            synthesize: { verdict: 'invest', avgScore: 81.7 },
        });
        const pipe = new clawpipe_1.PipelineExecutor(graph, bus);
        const result = await pipe.execute(parsed.definition, executor);
        // Query via registry
        const registry = new clawpipe_1.PipelineRegistry(graph);
        const record = registry.load(result.pipelineId);
        (0, vitest_1.expect)(record).toBeTruthy();
        (0, vitest_1.expect)(record.status).toBe('completed');
        (0, vitest_1.expect)(record.completedSteps).toBe(4);
        const steps = registry.getSteps(result.pipelineId);
        (0, vitest_1.expect)(steps).toHaveLength(4);
        const costSummary = registry.getCostSummary(result.pipelineId);
        (0, vitest_1.expect)(costSummary).toBeTruthy();
        (0, vitest_1.expect)(costSummary.totalCostUsd).toBeGreaterThan(0);
        (0, vitest_1.expect)(costSummary.stepCosts).toHaveLength(4);
    });
});
//# sourceMappingURL=clawpipe.test.js.map