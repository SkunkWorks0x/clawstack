/**
 * Pipeline Parser — Parse YAML pipeline definitions into typed structures.
 *
 * Validates structure, required fields, and step references.
 * Returns clear errors when the definition is invalid.
 */

import yaml from 'js-yaml';
import type {
  PipelineDefinition,
  PipelineStepDef,
  SequentialStepDef,
  ParallelGroupDef,
  Condition,
  ConditionOperator,
  JsonSchema,
  ParseResult,
} from './types.js';

const VALID_OPERATORS: ConditionOperator[] = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains'];
const DEFAULT_TIMEOUT = 30000;

/**
 * Parse a YAML string into a validated PipelineDefinition.
 */
export function parsePipeline(yamlString: string): ParseResult {
  let raw: unknown;
  try {
    raw = yaml.load(yamlString);
  } catch (err) {
    return { ok: false, errors: [`YAML parse error: ${(err as Error).message}`] };
  }

  return validateAndTransform(raw);
}

/**
 * Validate a raw object (already parsed from YAML/JSON) into a PipelineDefinition.
 */
export function validateAndTransform(raw: unknown): ParseResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['Pipeline definition must be an object'] };
  }

  const obj = raw as Record<string, unknown>;

  // Name is required
  if (!obj.name || typeof obj.name !== 'string') {
    errors.push('Pipeline "name" is required and must be a string');
  }

  // Description is optional
  if (obj.description !== undefined && typeof obj.description !== 'string') {
    errors.push('"description" must be a string if provided');
  }

  // Variables default to empty
  const variables: Record<string, unknown> = {};
  if (obj.variables !== undefined) {
    if (typeof obj.variables !== 'object' || Array.isArray(obj.variables) || obj.variables === null) {
      errors.push('"variables" must be an object');
    } else {
      Object.assign(variables, obj.variables);
    }
  }

  // Steps are required
  if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
    errors.push('"steps" is required and must be a non-empty array');
    return { ok: false, errors };
  }

  const steps: PipelineStepDef[] = [];
  const stepNames = new Set<string>();

  for (let i = 0; i < obj.steps.length; i++) {
    const rawStep = obj.steps[i] as Record<string, unknown>;
    if (!rawStep || typeof rawStep !== 'object' || Array.isArray(rawStep)) {
      errors.push(`Step ${i}: must be an object`);
      continue;
    }

    if (!rawStep.name || typeof rawStep.name !== 'string') {
      errors.push(`Step ${i}: "name" is required and must be a string`);
      continue;
    }

    if (stepNames.has(rawStep.name as string)) {
      errors.push(`Step ${i}: duplicate step name "${rawStep.name}"`);
    }
    stepNames.add(rawStep.name as string);

    // Parallel group
    if (rawStep.parallel !== undefined) {
      const groupResult = parseParallelGroup(rawStep, i, stepNames);
      errors.push(...groupResult.errors);
      if (groupResult.group) {
        steps.push(groupResult.group);
      }
      continue;
    }

    // Sequential step
    const stepResult = parseSequentialStep(rawStep, i);
    errors.push(...stepResult.errors);
    if (stepResult.step) {
      steps.push(stepResult.step);
    }
  }

  // Validate condition references
  for (const step of steps) {
    if (step.type === 'sequential' && step.condition) {
      if (!stepNames.has(step.condition.step)) {
        errors.push(`Step "${step.name}": condition references unknown step "${step.condition.step}"`);
      }
      if (!stepNames.has(step.condition.goto)) {
        errors.push(`Step "${step.name}": condition goto references unknown step "${step.condition.goto}"`);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    definition: {
      name: obj.name as string,
      description: obj.description as string | undefined,
      variables,
      steps,
    },
  };
}

function parseSequentialStep(
  raw: Record<string, unknown>,
  index: number
): { step: SequentialStepDef | null; errors: string[] } {
  const errors: string[] = [];
  const prefix = `Step ${index} ("${raw.name}")`;

  if (!raw.skill && !raw.agent) {
    errors.push(`${prefix}: must have either "skill" or "agent"`);
  }
  if (raw.skill && typeof raw.skill !== 'string') {
    errors.push(`${prefix}: "skill" must be a string`);
  }
  if (raw.agent && typeof raw.agent !== 'string') {
    errors.push(`${prefix}: "agent" must be a string`);
  }

  // Input defaults to empty object
  let input: Record<string, unknown> = {};
  if (raw.input !== undefined) {
    if (typeof raw.input !== 'object' || Array.isArray(raw.input) || raw.input === null) {
      errors.push(`${prefix}: "input" must be an object`);
    } else {
      input = raw.input as Record<string, unknown>;
    }
  }

  // Timeout
  let timeout = DEFAULT_TIMEOUT;
  if (raw.timeout !== undefined) {
    if (typeof raw.timeout !== 'number' || raw.timeout <= 0) {
      errors.push(`${prefix}: "timeout" must be a positive number (ms)`);
    } else {
      timeout = raw.timeout;
    }
  }

  // Schemas
  let inputSchema: JsonSchema | undefined;
  if (raw.inputSchema !== undefined) {
    const result = parseJsonSchema(raw.inputSchema, `${prefix}.inputSchema`);
    errors.push(...result.errors);
    inputSchema = result.schema;
  }

  let outputSchema: JsonSchema | undefined;
  if (raw.outputSchema !== undefined) {
    const result = parseJsonSchema(raw.outputSchema, `${prefix}.outputSchema`);
    errors.push(...result.errors);
    outputSchema = result.schema;
  }

  // Condition
  let condition: Condition | undefined;
  if (raw.condition !== undefined) {
    const result = parseCondition(raw.condition, prefix);
    errors.push(...result.errors);
    condition = result.condition;
  }

  if (errors.length > 0) {
    return { step: null, errors };
  }

  return {
    step: {
      type: 'sequential',
      name: raw.name as string,
      skill: raw.skill as string | undefined,
      agent: raw.agent as string | undefined,
      input,
      inputSchema,
      outputSchema,
      timeout,
      condition,
    },
    errors: [],
  };
}

function parseParallelGroup(
  raw: Record<string, unknown>,
  index: number,
  parentNames: Set<string>
): { group: ParallelGroupDef | null; errors: string[] } {
  const errors: string[] = [];
  const prefix = `Step ${index} ("${raw.name}")`;

  if (!Array.isArray(raw.parallel) || raw.parallel.length === 0) {
    errors.push(`${prefix}: "parallel" must be a non-empty array of steps`);
    return { group: null, errors };
  }

  const subSteps: SequentialStepDef[] = [];

  for (let j = 0; j < raw.parallel.length; j++) {
    const subRaw = raw.parallel[j] as Record<string, unknown>;
    if (!subRaw || typeof subRaw !== 'object' || Array.isArray(subRaw)) {
      errors.push(`${prefix}.parallel[${j}]: must be an object`);
      continue;
    }

    if (!subRaw.name || typeof subRaw.name !== 'string') {
      errors.push(`${prefix}.parallel[${j}]: "name" is required`);
      continue;
    }

    if (parentNames.has(subRaw.name as string)) {
      errors.push(`${prefix}.parallel[${j}]: duplicate step name "${subRaw.name}"`);
    }
    parentNames.add(subRaw.name as string);

    const result = parseSequentialStep(subRaw, index);
    // Rewrite error prefixes for clarity
    const prefixed = result.errors.map(e =>
      e.replace(`Step ${index}`, `${prefix}.parallel[${j}]`)
    );
    errors.push(...prefixed);
    if (result.step) {
      subSteps.push(result.step);
    }
  }

  if (errors.length > 0) {
    return { group: null, errors };
  }

  return {
    group: {
      type: 'parallel',
      name: raw.name as string,
      steps: subSteps,
    },
    errors: [],
  };
}

function parseCondition(
  raw: unknown,
  prefix: string
): { condition: Condition | undefined; errors: string[] } {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`${prefix}: "condition" must be an object`);
    return { condition: undefined, errors };
  }

  const cond = raw as Record<string, unknown>;

  if (!cond.step || typeof cond.step !== 'string') {
    errors.push(`${prefix}: condition "step" is required`);
  }
  if (!cond.field || typeof cond.field !== 'string') {
    errors.push(`${prefix}: condition "field" is required`);
  }
  if (!cond.operator || !VALID_OPERATORS.includes(cond.operator as ConditionOperator)) {
    errors.push(`${prefix}: condition "operator" must be one of: ${VALID_OPERATORS.join(', ')}`);
  }
  if (cond.value === undefined) {
    errors.push(`${prefix}: condition "value" is required`);
  }
  if (!cond.goto || typeof cond.goto !== 'string') {
    errors.push(`${prefix}: condition "goto" is required`);
  }

  if (errors.length > 0) {
    return { condition: undefined, errors };
  }

  return {
    condition: {
      step: cond.step as string,
      field: cond.field as string,
      operator: cond.operator as ConditionOperator,
      value: cond.value,
      goto: cond.goto as string,
    },
    errors: [],
  };
}

function parseJsonSchema(
  raw: unknown,
  prefix: string
): { schema: JsonSchema | undefined; errors: string[] } {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`${prefix}: must be an object`);
    return { schema: undefined, errors };
  }

  const obj = raw as Record<string, unknown>;
  const validTypes = ['string', 'number', 'boolean', 'object', 'array', 'null'];

  if (obj.type !== undefined && !validTypes.includes(obj.type as string)) {
    errors.push(`${prefix}: "type" must be one of: ${validTypes.join(', ')}`);
  }

  if (errors.length > 0) {
    return { schema: undefined, errors };
  }

  // Accept the schema as-is (lightweight validation)
  return { schema: obj as JsonSchema, errors: [] };
}

/**
 * Get all step names in a definition (including parallel sub-steps).
 */
export function getAllStepNames(definition: PipelineDefinition): string[] {
  const names: string[] = [];
  for (const step of definition.steps) {
    names.push(step.name);
    if (step.type === 'parallel') {
      for (const sub of step.steps) {
        names.push(sub.name);
      }
    }
  }
  return names;
}

/**
 * Count total executable steps (parallel sub-steps count individually).
 */
export function countSteps(definition: PipelineDefinition): number {
  let count = 0;
  for (const step of definition.steps) {
    if (step.type === 'parallel') {
      count += step.steps.length;
    } else {
      count += 1;
    }
  }
  return count;
}
