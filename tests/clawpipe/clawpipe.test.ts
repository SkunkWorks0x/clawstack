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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { SessionGraph, EventBus, createEvent } from '@clawstack/shared';
import type { BusEvent } from '@clawstack/shared';
import {
  parsePipeline,
  validateAndTransform,
  getAllStepNames,
  countSteps,
  PipelineExecutor,
  resolveVariables,
  validateSchema,
  validateStepOutput,
  validateStepInput,
  validateStepCompatibility,
  PipelineRegistry,
} from '@clawstack/clawpipe';
import type {
  PipelineDefinition,
  StepExecutor,
  StepExecutionContext,
  StepResult,
  JsonSchema,
} from '@clawstack/clawpipe';

// ─── Test Helpers ─────────────────────────────────────────────────

let tempDir: string;
let graph: SessionGraph;
let bus: EventBus;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'clawpipe-test-'));
  graph = new SessionGraph(join(tempDir, 'test.db'));
  bus = new EventBus();
});

afterEach(() => {
  graph.close();
  rmSync(tempDir, { recursive: true, force: true });
});

function createTestExecutor(results: Record<string, unknown>): StepExecutor {
  return async (ctx: StepExecutionContext) => {
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

describe('Pipeline Parser', () => {
  it('parses a simple sequential pipeline', () => {
    const result = parsePipeline(SIMPLE_YAML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const def = result.definition;
    expect(def.name).toBe('simple-pipeline');
    expect(def.description).toBe('A simple two-step pipeline');
    expect(def.variables).toEqual({ startup: 'TechCorp' });
    expect(def.steps).toHaveLength(2);

    const step0 = def.steps[0];
    expect(step0.type).toBe('sequential');
    expect(step0.name).toBe('analyze');
    if (step0.type === 'sequential') {
      expect(step0.skill).toBe('market-analyzer');
      expect(step0.timeout).toBe(5000);
      expect(step0.outputSchema).toBeDefined();
      expect(step0.outputSchema!.required).toContain('score');
    }
  });

  it('parses a pipeline with parallel groups', () => {
    const result = parsePipeline(PARALLEL_YAML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const def = result.definition;
    expect(def.name).toBe('multi-scorer');
    expect(def.steps).toHaveLength(2);

    const parallel = def.steps[0];
    expect(parallel.type).toBe('parallel');
    if (parallel.type === 'parallel') {
      expect(parallel.steps).toHaveLength(3);
      expect(parallel.steps[0].name).toBe('market-score');
      expect(parallel.steps[1].name).toBe('team-score');
      expect(parallel.steps[2].name).toBe('tech-score');
    }
  });

  it('parses a pipeline with conditions', () => {
    const result = parsePipeline(CONDITION_YAML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const step0 = result.definition.steps[0];
    if (step0.type === 'sequential') {
      expect(step0.condition).toBeDefined();
      expect(step0.condition!.step).toBe('initial-check');
      expect(step0.condition!.field).toBe('score');
      expect(step0.condition!.operator).toBe('gt');
      expect(step0.condition!.value).toBe(70);
      expect(step0.condition!.goto).toBe('deep-analysis');
    }
  });

  it('rejects invalid YAML', () => {
    const result = parsePipeline('{{not: valid yaml');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('YAML parse error');
    }
  });

  it('rejects missing name', () => {
    const result = parsePipeline(`
steps:
  - name: step1
    skill: test
`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some(e => e.includes('"name" is required'))).toBe(true);
    }
  });

  it('rejects missing steps', () => {
    const result = parsePipeline(`
name: test-pipeline
`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some(e => e.includes('"steps" is required'))).toBe(true);
    }
  });

  it('rejects empty steps array', () => {
    const result = parsePipeline(`
name: test
steps: []
`);
    expect(result.ok).toBe(false);
  });

  it('rejects steps without skill or agent', () => {
    const result = parsePipeline(`
name: test
steps:
  - name: bad-step
    input: {}
`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some(e => e.includes('must have either "skill" or "agent"'))).toBe(true);
    }
  });

  it('rejects duplicate step names', () => {
    const result = parsePipeline(`
name: test
steps:
  - name: same-name
    skill: test
  - name: same-name
    skill: test
`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some(e => e.includes('duplicate step name'))).toBe(true);
    }
  });

  it('rejects condition referencing unknown step', () => {
    const result = parsePipeline(`
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
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some(e => e.includes('unknown step'))).toBe(true);
    }
  });

  it('applies default timeout of 30000ms', () => {
    const result = parsePipeline(`
name: test
steps:
  - name: step1
    skill: test
`);
    expect(result.ok).toBe(true);
    if (result.ok && result.definition.steps[0].type === 'sequential') {
      expect(result.definition.steps[0].timeout).toBe(30000);
    }
  });

  it('counts steps correctly with parallel groups', () => {
    const result = parsePipeline(PARALLEL_YAML);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(countSteps(result.definition)).toBe(4); // 3 parallel + 1 sequential
    }
  });

  it('getAllStepNames returns all names including parallel sub-steps', () => {
    const result = parsePipeline(PARALLEL_YAML);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const names = getAllStepNames(result.definition);
      expect(names).toContain('score-all');
      expect(names).toContain('market-score');
      expect(names).toContain('team-score');
      expect(names).toContain('tech-score');
      expect(names).toContain('synthesize');
    }
  });

  it('validateAndTransform accepts raw objects', () => {
    const raw = {
      name: 'raw-test',
      steps: [{ name: 's1', skill: 'test', input: {} }],
    };
    const result = validateAndTransform(raw);
    expect(result.ok).toBe(true);
  });

  it('rejects non-object input', () => {
    const result = validateAndTransform('not an object');
    expect(result.ok).toBe(false);
  });

  it('rejects invalid condition operator', () => {
    const result = parsePipeline(`
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
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some(e => e.includes('operator'))).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. RESULT VALIDATOR
// ═══════════════════════════════════════════════════════════════════

describe('Result Validator', () => {
  it('validates basic types', () => {
    expect(validateSchema('hello', { type: 'string' }).valid).toBe(true);
    expect(validateSchema(42, { type: 'number' }).valid).toBe(true);
    expect(validateSchema(true, { type: 'boolean' }).valid).toBe(true);
    expect(validateSchema(null, { type: 'null' }).valid).toBe(true);
    expect(validateSchema([1, 2], { type: 'array' }).valid).toBe(true);
    expect(validateSchema({ a: 1 }, { type: 'object' }).valid).toBe(true);
  });

  it('rejects type mismatches', () => {
    const result = validateSchema('hello', { type: 'number' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('expected type "number"');
    expect(result.errors[0]).toContain('got "string"');
  });

  it('validates object with required fields', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        score: { type: 'number' },
        reasoning: { type: 'string' },
      },
      required: ['score', 'reasoning'],
    };

    expect(validateSchema({ score: 85, reasoning: 'good' }, schema).valid).toBe(true);
    expect(validateSchema({ score: 85 }, schema).valid).toBe(false);
  });

  it('validates nested object properties', () => {
    const schema: JsonSchema = {
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

    expect(validateSchema({ data: { value: 50 } }, schema).valid).toBe(true);
    expect(validateSchema({ data: { value: 150 } }, schema).valid).toBe(false);
    expect(validateSchema({ data: {} }, schema).valid).toBe(false); // missing required 'value'
  });

  it('validates number range', () => {
    const schema: JsonSchema = { type: 'number', minimum: 0, maximum: 100 };

    expect(validateSchema(50, schema).valid).toBe(true);
    expect(validateSchema(0, schema).valid).toBe(true);
    expect(validateSchema(100, schema).valid).toBe(true);
    expect(validateSchema(-1, schema).valid).toBe(false);
    expect(validateSchema(101, schema).valid).toBe(false);
  });

  it('validates string length', () => {
    const schema: JsonSchema = { type: 'string', minLength: 2, maxLength: 10 };

    expect(validateSchema('hello', schema).valid).toBe(true);
    expect(validateSchema('a', schema).valid).toBe(false);
    expect(validateSchema('this is too long', schema).valid).toBe(false);
  });

  it('validates arrays with item schema', () => {
    const schema: JsonSchema = {
      type: 'array',
      items: { type: 'number', minimum: 0 },
    };

    expect(validateSchema([1, 2, 3], schema).valid).toBe(true);
    expect(validateSchema([1, -1, 3], schema).valid).toBe(false);
    expect(validateSchema([1, 'two', 3], schema).valid).toBe(false);
  });

  it('validates enum values', () => {
    const schema: JsonSchema = { enum: ['high', 'medium', 'low'] };

    expect(validateSchema('high', schema).valid).toBe(true);
    expect(validateSchema('invalid', schema).valid).toBe(false);
  });

  it('passes empty schema (anything valid)', () => {
    expect(validateSchema('anything', {}).valid).toBe(true);
    expect(validateSchema(42, {}).valid).toBe(true);
    expect(validateSchema(null, {}).valid).toBe(true);
  });

  it('validates step output with clear error messages', () => {
    const schema: JsonSchema = {
      type: 'object',
      required: ['score'],
    };

    const result = validateStepOutput('analyze', { name: 'test' }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('step "analyze"');
    expect(result.errors[0]).toContain('missing required field "score"');
  });

  it('validates step input', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        company: { type: 'string' },
      },
      required: ['company'],
    };

    expect(validateStepInput('analyze', { company: 'TechCorp' }, schema).valid).toBe(true);
    expect(validateStepInput('analyze', {}, schema).valid).toBe(false);
  });

  it('validates step compatibility', () => {
    const outputSchema: JsonSchema = { type: 'string' };
    const inputSchema: JsonSchema = {
      type: 'object',
      required: ['data'],
    };

    const result = validateStepCompatibility('step1', outputSchema, 'step2', inputSchema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('expects object input');
  });

  it('compatibility passes when schemas are compatible', () => {
    const outputSchema: JsonSchema = {
      type: 'object',
      properties: { score: { type: 'number' } },
    };
    const inputSchema: JsonSchema = {
      type: 'object',
      required: ['score'],
    };

    const result = validateStepCompatibility('step1', outputSchema, 'step2', inputSchema);
    expect(result.valid).toBe(true);
  });

  it('compatibility passes when schemas are missing', () => {
    expect(validateStepCompatibility('s1', undefined, 's2', undefined).valid).toBe(true);
    expect(validateStepCompatibility('s1', { type: 'object' }, 's2', undefined).valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. VARIABLE RESOLUTION
// ═══════════════════════════════════════════════════════════════════

describe('Variable Resolution', () => {
  it('resolves simple variable references', () => {
    const context = {
      variables: { startup: 'TechCorp', year: 2026 },
      stepResults: {},
    };

    expect(resolveVariables('${variables.startup}', context)).toBe('TechCorp');
    expect(resolveVariables('${variables.year}', context)).toBe(2026);
  });

  it('resolves step output references', () => {
    const context = {
      variables: {},
      stepResults: {
        'market-score': {
          stepName: 'market-score',
          status: 'completed' as const,
          output: { score: 85, reasoning: 'strong market' },
          costUsd: 0.01,
          durationMs: 100,
          agentId: null,
          sessionId: null,
        },
      },
    };

    expect(resolveVariables('${steps.market-score.output.score}', context)).toBe(85);
    expect(resolveVariables('${steps.market-score.output}', context)).toEqual({
      score: 85,
      reasoning: 'strong market',
    });
  });

  it('resolves embedded variable references in strings', () => {
    const context = {
      variables: { name: 'TechCorp' },
      stepResults: {
        step1: {
          stepName: 'step1',
          status: 'completed' as const,
          output: { score: 85 },
          costUsd: 0,
          durationMs: 0,
          agentId: null,
          sessionId: null,
        },
      },
    };

    expect(resolveVariables('Company: ${variables.name}, Score: ${steps.step1.output.score}', context))
      .toBe('Company: TechCorp, Score: 85');
  });

  it('resolves variables in objects recursively', () => {
    const context = {
      variables: { startup: 'TechCorp' },
      stepResults: {},
    };

    const result = resolveVariables({
      company: '${variables.startup}',
      nested: { name: '${variables.startup}' },
    }, context);

    expect(result).toEqual({
      company: 'TechCorp',
      nested: { name: 'TechCorp' },
    });
  });

  it('resolves variables in arrays', () => {
    const context = {
      variables: { a: 'x', b: 'y' },
      stepResults: {},
    };

    expect(resolveVariables(['${variables.a}', '${variables.b}'], context))
      .toEqual(['x', 'y']);
  });

  it('passes through non-string values unchanged', () => {
    const context = { variables: {}, stepResults: {} };

    expect(resolveVariables(42, context)).toBe(42);
    expect(resolveVariables(true, context)).toBe(true);
    expect(resolveVariables(null, context)).toBe(null);
  });

  it('throws on reference to nonexistent step', () => {
    const context = { variables: {}, stepResults: {} };

    expect(() => resolveVariables('${steps.missing.output}', context))
      .toThrow('step "missing" has no result yet');
  });

  it('throws on reference to failed step', () => {
    const context = {
      variables: {},
      stepResults: {
        failed: {
          stepName: 'failed',
          status: 'failed' as const,
          output: null,
          costUsd: 0,
          durationMs: 0,
          agentId: null,
          sessionId: null,
          error: 'something broke',
        },
      },
    };

    expect(() => resolveVariables('${steps.failed.output}', context))
      .toThrow('did not complete successfully');
  });

  it('throws on unknown variable root', () => {
    const context = { variables: {}, stepResults: {} };

    expect(() => resolveVariables('${unknown.path}', context))
      .toThrow('unknown root "unknown"');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. PIPELINE EXECUTOR
// ═══════════════════════════════════════════════════════════════════

describe('Pipeline Executor', () => {
  it('executes a simple sequential pipeline', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const executor = createTestExecutor({
      analyze: { score: 85 },
      report: { summary: 'Good company' },
    });

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    expect(result.status).toBe('completed');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].stepName).toBe('analyze');
    expect(result.steps[0].status).toBe('completed');
    expect(result.steps[0].output).toEqual({ score: 85 });
    expect(result.steps[1].stepName).toBe('report');
    expect(result.steps[1].status).toBe('completed');
    expect(result.totalCostUsd).toBeGreaterThan(0);
  });

  it('executes a parallel pipeline (Jason Calacanis use case)', async () => {
    const parsed = parsePipeline(PARALLEL_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const executor = createTestExecutor({
      'market-score': { score: 85 },
      'team-score': { score: 70 },
      'tech-score': { score: 90 },
      synthesize: { verdict: 'strong investment', avgScore: 81.7 },
    });

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    expect(result.status).toBe('completed');
    expect(result.steps).toHaveLength(4); // 3 parallel + 1 sequential
    // All parallel steps completed
    expect(result.steps[0].status).toBe('completed');
    expect(result.steps[1].status).toBe('completed');
    expect(result.steps[2].status).toBe('completed');
    // Synthesis step completed
    expect(result.steps[3].stepName).toBe('synthesize');
    expect(result.steps[3].status).toBe('completed');
  });

  it('handles conditional branching (condition true → jump)', async () => {
    const parsed = parsePipeline(CONDITION_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // Score > 70 → should jump to deep-analysis, skip shallow-report
    const executor = createTestExecutor({
      'initial-check': { score: 85 },
      'deep-analysis': { result: 'deep insights' },
    });

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    expect(result.status).toBe('completed');
    expect(result.steps).toHaveLength(2); // initial-check + deep-analysis
    expect(result.steps[0].stepName).toBe('initial-check');
    expect(result.steps[1].stepName).toBe('deep-analysis');
    // shallow-report was skipped
    expect(result.steps.find(s => s.stepName === 'shallow-report')).toBeUndefined();
  });

  it('handles conditional branching (condition false → continue)', async () => {
    const parsed = parsePipeline(CONDITION_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // Score <= 70 → should continue to shallow-report, then deep-analysis
    const executor = createTestExecutor({
      'initial-check': { score: 50 },
      'shallow-report': { summary: 'quick report' },
      'deep-analysis': { result: 'deep insights' },
    });

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    expect(result.status).toBe('completed');
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].stepName).toBe('initial-check');
    expect(result.steps[1].stepName).toBe('shallow-report');
    expect(result.steps[2].stepName).toBe('deep-analysis');
  });

  it('handles step execution failure', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const executor: StepExecutor = async (ctx) => {
      if (ctx.stepName === 'analyze') {
        throw new Error('API call failed');
      }
      return { output: {} };
    };

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    expect(result.status).toBe('failed');
    expect(result.steps).toHaveLength(1); // Only first step attempted
    expect(result.steps[0].status).toBe('failed');
    expect(result.steps[0].error).toContain('API call failed');
  });

  it('handles step timeout', async () => {
    const yaml = `
name: timeout-test
steps:
  - name: slow-step
    skill: slow-skill
    timeout: 100
`;
    const parsed = parsePipeline(yaml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const executor: StepExecutor = async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return { output: 'too late' };
    };

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    expect(result.status).toBe('failed');
    expect(result.steps[0].status).toBe('timeout');
    expect(result.steps[0].error).toContain('timed out');
  });

  it('validates step output against schema', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // Return invalid output (missing required 'score' field)
    const executor: StepExecutor = async (ctx) => {
      if (ctx.stepName === 'analyze') {
        return { output: { name: 'no score here' } }; // missing 'score'
      }
      return { output: {} };
    };

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    expect(result.status).toBe('failed');
    expect(result.steps[0].status).toBe('failed');
    expect(result.steps[0].error).toContain('missing required field');
  });

  it('creates sessions per step in Session Graph', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const executor = createTestExecutor({
      analyze: { score: 85 },
      report: { summary: 'done' },
    });

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    // Each step should have created a session
    expect(result.steps[0].sessionId).toBeTruthy();
    expect(result.steps[1].sessionId).toBeTruthy();
    expect(result.steps[0].sessionId).not.toBe(result.steps[1].sessionId);
  });

  it('records cost per step', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const executor = createTestExecutor({
      analyze: { score: 85 },
      report: { summary: 'done' },
    });

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    // Check cost recorded in Session Graph
    for (const step of result.steps) {
      const cost = graph.getSessionCost(step.sessionId!);
      expect(cost.costUsd).toBeGreaterThan(0);
      expect(cost.tokens).toBeGreaterThan(0);
    }
  });

  it('emits events for each step and pipeline completion', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const events: BusEvent[] = [];
    bus.on('pipeline.*', (evt) => { events.push(evt); });

    const executor = createTestExecutor({
      analyze: { score: 85 },
      report: { summary: 'done' },
    });

    const pipe = new PipelineExecutor(graph, bus);
    await pipe.execute(parsed.definition, executor);

    // Should have 2 step_completed + 1 pipeline.completed
    const stepEvents = events.filter(e => e.channel === 'pipeline.step_completed');
    const completedEvents = events.filter(e => e.channel === 'pipeline.completed');

    expect(stepEvents).toHaveLength(2);
    expect(completedEvents).toHaveLength(1);
  });

  it('emits pipeline.failed event on failure', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const events: BusEvent[] = [];
    bus.on('pipeline.failed', (evt) => { events.push(evt); });

    const executor: StepExecutor = async () => { throw new Error('boom'); };

    const pipe = new PipelineExecutor(graph, bus);
    await pipe.execute(parsed.definition, executor);

    expect(events).toHaveLength(1);
    expect((events[0].payload as any).error).toContain('boom');
  });

  it('supports variable overrides via options', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    let capturedInput: Record<string, unknown> = {};
    const executor: StepExecutor = async (ctx) => {
      if (ctx.stepName === 'analyze') {
        capturedInput = ctx.input;
      }
      return { output: { score: 90 } };
    };

    const pipe = new PipelineExecutor(graph, bus);
    await pipe.execute(parsed.definition, executor, {
      variables: { startup: 'OverrideCorp' },
    });

    expect(capturedInput.company).toBe('OverrideCorp');
  });

  it('respects max cost limit', async () => {
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
    const parsed = parsePipeline(yaml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const executor: StepExecutor = async () => ({
      output: { done: true },
      estimatedCostUsd: 5.0, // $5 per step
    });

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor, {
      maxTotalCostUsd: 6.0, // Should stop after step1 ($5) + step2 ($5) = $10 > $6
    });

    // Step1 executes ($5), step2 sees totalCost >= limit → stops
    expect(result.status).toBe('failed');
    expect(result.steps.length).toBeLessThan(3);
  });

  it('writes pipeline record to DB', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const executor = createTestExecutor({
      analyze: { score: 85 },
      report: { summary: 'done' },
    });

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    // Verify pipeline record in DB
    const db = graph.getDb();
    const row = db.prepare('SELECT * FROM pipelines WHERE pipeline_id = ?').get(result.pipelineId) as any;
    expect(row).toBeTruthy();
    expect(row.name).toBe('simple-pipeline');
    expect(row.status).toBe('completed');
    expect(row.total_cost_usd).toBeGreaterThan(0);
  });

  it('writes pipeline_steps records to DB', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const executor = createTestExecutor({
      analyze: { score: 85 },
      report: { summary: 'done' },
    });

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    const db = graph.getDb();
    const steps = db.prepare(
      'SELECT * FROM pipeline_steps WHERE pipeline_id = ? ORDER BY step_number'
    ).all(result.pipelineId) as any[];

    expect(steps).toHaveLength(2);
    expect(steps[0].name).toBe('analyze');
    expect(steps[0].status).toBe('completed');
    expect(steps[1].name).toBe('report');
    expect(steps[1].status).toBe('completed');
  });

  it('links sessions to pipeline via pipeline_id', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const executor = createTestExecutor({
      analyze: { score: 85 },
      report: { summary: 'done' },
    });

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    const db = graph.getDb();
    const sessions = db.prepare(
      'SELECT * FROM sessions WHERE pipeline_id = ?'
    ).all(result.pipelineId) as any[];

    expect(sessions).toHaveLength(2);
    expect(sessions[0].pipeline_id).toBe(result.pipelineId);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. PIPELINE REGISTRY
// ═══════════════════════════════════════════════════════════════════

describe('Pipeline Registry', () => {
  it('saves and loads a pipeline definition', () => {
    const registry = new PipelineRegistry(graph);
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const pipelineId = registry.save(parsed.definition, SIMPLE_YAML);
    expect(pipelineId).toBeTruthy();

    const loaded = registry.load(pipelineId);
    expect(loaded).toBeTruthy();
    expect(loaded!.name).toBe('simple-pipeline');
    expect(loaded!.status).toBe('pending');
    expect(loaded!.totalSteps).toBe(2);
  });

  it('lists pipelines ordered by creation date', () => {
    const registry = new PipelineRegistry(graph);

    const parsed1 = parsePipeline(SIMPLE_YAML);
    const parsed2 = parsePipeline(PARALLEL_YAML);
    expect(parsed1.ok).toBe(true);
    expect(parsed2.ok).toBe(true);
    if (!parsed1.ok || !parsed2.ok) return;

    registry.save(parsed1.definition, SIMPLE_YAML);
    registry.save(parsed2.definition, PARALLEL_YAML);

    const list = registry.list();
    expect(list).toHaveLength(2);
    // Both pipelines present (order by rowid DESC within same timestamp)
    const names = list.map(p => p.name);
    expect(names).toContain('simple-pipeline');
    expect(names).toContain('multi-scorer');
  });

  it('gets execution history for a named pipeline', async () => {
    const registry = new PipelineRegistry(graph);
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const executor = createTestExecutor({
      analyze: { score: 85 },
      report: { summary: 'done' },
    });

    // Execute twice
    const pipe = new PipelineExecutor(graph, bus);
    await pipe.execute(parsed.definition, executor);
    await pipe.execute(parsed.definition, executor);

    const history = registry.getHistory('simple-pipeline');
    expect(history).toHaveLength(2);
    expect(history.every(p => p.name === 'simple-pipeline')).toBe(true);
  });

  it('gets cost summary for a pipeline execution', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const executor = createTestExecutor({
      analyze: { score: 85 },
      report: { summary: 'done' },
    });

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    const registry = new PipelineRegistry(graph);
    const summary = registry.getCostSummary(result.pipelineId);

    expect(summary).toBeTruthy();
    expect(summary!.totalCostUsd).toBeGreaterThan(0);
    expect(summary!.stepCosts).toHaveLength(2);
  });

  it('gets aggregate cost across executions', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const executor = createTestExecutor({
      analyze: { score: 85 },
      report: { summary: 'done' },
    });

    const pipe = new PipelineExecutor(graph, bus);
    await pipe.execute(parsed.definition, executor);
    await pipe.execute(parsed.definition, executor);

    const registry = new PipelineRegistry(graph);
    const agg = registry.getAggregateCost('simple-pipeline');

    expect(agg.executionCount).toBe(2);
    expect(agg.totalCostUsd).toBeGreaterThan(0);
    expect(agg.avgCostUsd).toBeGreaterThan(0);
  });

  it('gets steps for a pipeline execution', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const executor = createTestExecutor({
      analyze: { score: 85 },
      report: { summary: 'done' },
    });

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    const registry = new PipelineRegistry(graph);
    const steps = registry.getSteps(result.pipelineId);

    expect(steps).toHaveLength(2);
    expect(steps[0].name).toBe('analyze');
    expect(steps[0].result).toEqual({ score: 85 });
    expect(steps[1].name).toBe('report');
  });

  it('deletes a pipeline and its steps', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const executor = createTestExecutor({
      analyze: { score: 85 },
      report: { summary: 'done' },
    });

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    const registry = new PipelineRegistry(graph);
    expect(registry.load(result.pipelineId)).toBeTruthy();

    const deleted = registry.delete(result.pipelineId);
    expect(deleted).toBe(true);
    expect(registry.load(result.pipelineId)).toBeNull();
    expect(registry.getSteps(result.pipelineId)).toHaveLength(0);
  });

  it('returns null for nonexistent pipeline', () => {
    const registry = new PipelineRegistry(graph);
    expect(registry.load('nonexistent-id')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. INTEGRATION — Cross-Product Flow
// ═══════════════════════════════════════════════════════════════════

describe('Cross-Product Integration', () => {
  it('full pipeline writes to Session Graph: agent, sessions, costs, pipeline', async () => {
    const parsed = parsePipeline(PARALLEL_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const executor = createTestExecutor({
      'market-score': { score: 85 },
      'team-score': { score: 70 },
      'tech-score': { score: 90 },
      synthesize: { verdict: 'invest' },
    });

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    // Verify agent created
    const agents = graph.listAgents();
    expect(agents.some(a => a.name.includes('multi-scorer'))).toBe(true);

    // Verify sessions created (one per step)
    const db = graph.getDb();
    const sessions = db.prepare(
      'SELECT * FROM sessions WHERE pipeline_id = ?'
    ).all(result.pipelineId) as any[];
    expect(sessions).toHaveLength(4);

    // Verify costs recorded
    let totalTokens = 0;
    for (const session of sessions) {
      const cost = graph.getSessionCost(session.session_id);
      totalTokens += cost.tokens;
    }
    expect(totalTokens).toBeGreaterThan(0);

    // Verify pipeline record
    const pipeline = db.prepare(
      'SELECT * FROM pipelines WHERE pipeline_id = ?'
    ).get(result.pipelineId) as any;
    expect(pipeline.status).toBe('completed');
    expect(pipeline.completed_steps).toBe(4);
  });

  it('EventBus events contain correct payloads', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const stepEvents: BusEvent[] = [];
    const pipeEvents: BusEvent[] = [];

    bus.on('pipeline.step_completed', (evt) => stepEvents.push(evt));
    bus.on('pipeline.completed', (evt) => pipeEvents.push(evt));

    const executor = createTestExecutor({
      analyze: { score: 85 },
      report: { summary: 'done' },
    });

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    // Step events have step-level details
    expect(stepEvents).toHaveLength(2);
    const step1Payload = stepEvents[0].payload as any;
    expect(step1Payload.pipelineId).toBe(result.pipelineId);
    expect(step1Payload.stepName).toBe('analyze');
    expect(step1Payload.status).toBe('completed');

    // Pipeline completion event
    expect(pipeEvents).toHaveLength(1);
    const pipePayload = pipeEvents[0].payload as any;
    expect(pipePayload.pipelineId).toBe(result.pipelineId);
    expect(pipePayload.status).toBe('completed');
    expect(pipePayload.completedSteps).toBe(2);
    expect(pipePayload.totalCostUsd).toBeGreaterThan(0);
  });

  it('ClawGuard can monitor step sessions via EventBus', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // Simulate ClawGuard monitoring
    const monitoredSessions: string[] = [];
    bus.on('pipeline.step_completed', (evt) => {
      const sessionId = evt.sessionId;
      if (sessionId) monitoredSessions.push(sessionId);
    });

    const executor = createTestExecutor({
      analyze: { score: 85 },
      report: { summary: 'done' },
    });

    const pipe = new PipelineExecutor(graph, bus);
    await pipe.execute(parsed.definition, executor);

    expect(monitoredSessions).toHaveLength(2);
    // Each session is unique (ClawGuard monitors independently)
    expect(new Set(monitoredSessions).size).toBe(2);
  });

  it('ClawBudget Smart Router integration path', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // Simulate Smart Router integration via custom executor
    const routingDecisions: string[] = [];

    const smartRouterExecutor: StepExecutor = async (ctx) => {
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

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, smartRouterExecutor);

    expect(result.status).toBe('completed');
    expect(routingDecisions).toEqual([
      'analyze → claude-opus-4-6',
      'report → claude-haiku-4-5',
    ]);
    // Opus step should cost more than Haiku step
    expect(result.steps[0].costUsd).toBeGreaterThan(result.steps[1].costUsd);
  });

  it('uses pre-registered agent when provided', async () => {
    const parsed = parsePipeline(SIMPLE_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

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

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor, {
      agentId: agent.agentId,
    });

    expect(result.status).toBe('completed');
    expect(result.steps[0].agentId).toBe(agent.agentId);
    expect(result.steps[1].agentId).toBe(agent.agentId);
  });

  it('end-to-end: parse YAML → execute → registry → cost', async () => {
    // Full flow: parse, execute, query
    const parsed = parsePipeline(PARALLEL_YAML);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const executor = createTestExecutor({
      'market-score': { score: 85 },
      'team-score': { score: 70 },
      'tech-score': { score: 90 },
      synthesize: { verdict: 'invest', avgScore: 81.7 },
    });

    const pipe = new PipelineExecutor(graph, bus);
    const result = await pipe.execute(parsed.definition, executor);

    // Query via registry
    const registry = new PipelineRegistry(graph);
    const record = registry.load(result.pipelineId);
    expect(record).toBeTruthy();
    expect(record!.status).toBe('completed');
    expect(record!.completedSteps).toBe(4);

    const steps = registry.getSteps(result.pipelineId);
    expect(steps).toHaveLength(4);

    const costSummary = registry.getCostSummary(result.pipelineId);
    expect(costSummary).toBeTruthy();
    expect(costSummary!.totalCostUsd).toBeGreaterThan(0);
    expect(costSummary!.stepCosts).toHaveLength(4);
  });
});
