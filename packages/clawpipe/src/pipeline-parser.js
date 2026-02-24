"use strict";
/**
 * Pipeline Parser — Parse YAML pipeline definitions into typed structures.
 *
 * Validates structure, required fields, and step references.
 * Returns clear errors when the definition is invalid.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePipeline = parsePipeline;
exports.validateAndTransform = validateAndTransform;
exports.getAllStepNames = getAllStepNames;
exports.countSteps = countSteps;
const js_yaml_1 = __importDefault(require("js-yaml"));
const VALID_OPERATORS = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains'];
const DEFAULT_TIMEOUT = 30000;
/**
 * Parse a YAML string into a validated PipelineDefinition.
 */
function parsePipeline(yamlString) {
    let raw;
    try {
        raw = js_yaml_1.default.load(yamlString);
    }
    catch (err) {
        return { ok: false, errors: [`YAML parse error: ${err.message}`] };
    }
    return validateAndTransform(raw);
}
/**
 * Validate a raw object (already parsed from YAML/JSON) into a PipelineDefinition.
 */
function validateAndTransform(raw) {
    const errors = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ok: false, errors: ['Pipeline definition must be an object'] };
    }
    const obj = raw;
    // Name is required
    if (!obj.name || typeof obj.name !== 'string') {
        errors.push('Pipeline "name" is required and must be a string');
    }
    // Description is optional
    if (obj.description !== undefined && typeof obj.description !== 'string') {
        errors.push('"description" must be a string if provided');
    }
    // Variables default to empty
    const variables = {};
    if (obj.variables !== undefined) {
        if (typeof obj.variables !== 'object' || Array.isArray(obj.variables) || obj.variables === null) {
            errors.push('"variables" must be an object');
        }
        else {
            Object.assign(variables, obj.variables);
        }
    }
    // Steps are required
    if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
        errors.push('"steps" is required and must be a non-empty array');
        return { ok: false, errors };
    }
    const steps = [];
    const stepNames = new Set();
    for (let i = 0; i < obj.steps.length; i++) {
        const rawStep = obj.steps[i];
        if (!rawStep || typeof rawStep !== 'object' || Array.isArray(rawStep)) {
            errors.push(`Step ${i}: must be an object`);
            continue;
        }
        if (!rawStep.name || typeof rawStep.name !== 'string') {
            errors.push(`Step ${i}: "name" is required and must be a string`);
            continue;
        }
        if (stepNames.has(rawStep.name)) {
            errors.push(`Step ${i}: duplicate step name "${rawStep.name}"`);
        }
        stepNames.add(rawStep.name);
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
            name: obj.name,
            description: obj.description,
            variables,
            steps,
        },
    };
}
function parseSequentialStep(raw, index) {
    const errors = [];
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
    let input = {};
    if (raw.input !== undefined) {
        if (typeof raw.input !== 'object' || Array.isArray(raw.input) || raw.input === null) {
            errors.push(`${prefix}: "input" must be an object`);
        }
        else {
            input = raw.input;
        }
    }
    // Timeout
    let timeout = DEFAULT_TIMEOUT;
    if (raw.timeout !== undefined) {
        if (typeof raw.timeout !== 'number' || raw.timeout <= 0) {
            errors.push(`${prefix}: "timeout" must be a positive number (ms)`);
        }
        else {
            timeout = raw.timeout;
        }
    }
    // Schemas
    let inputSchema;
    if (raw.inputSchema !== undefined) {
        const result = parseJsonSchema(raw.inputSchema, `${prefix}.inputSchema`);
        errors.push(...result.errors);
        inputSchema = result.schema;
    }
    let outputSchema;
    if (raw.outputSchema !== undefined) {
        const result = parseJsonSchema(raw.outputSchema, `${prefix}.outputSchema`);
        errors.push(...result.errors);
        outputSchema = result.schema;
    }
    // Condition
    let condition;
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
            name: raw.name,
            skill: raw.skill,
            agent: raw.agent,
            input,
            inputSchema,
            outputSchema,
            timeout,
            condition,
        },
        errors: [],
    };
}
function parseParallelGroup(raw, index, parentNames) {
    const errors = [];
    const prefix = `Step ${index} ("${raw.name}")`;
    if (!Array.isArray(raw.parallel) || raw.parallel.length === 0) {
        errors.push(`${prefix}: "parallel" must be a non-empty array of steps`);
        return { group: null, errors };
    }
    const subSteps = [];
    for (let j = 0; j < raw.parallel.length; j++) {
        const subRaw = raw.parallel[j];
        if (!subRaw || typeof subRaw !== 'object' || Array.isArray(subRaw)) {
            errors.push(`${prefix}.parallel[${j}]: must be an object`);
            continue;
        }
        if (!subRaw.name || typeof subRaw.name !== 'string') {
            errors.push(`${prefix}.parallel[${j}]: "name" is required`);
            continue;
        }
        if (parentNames.has(subRaw.name)) {
            errors.push(`${prefix}.parallel[${j}]: duplicate step name "${subRaw.name}"`);
        }
        parentNames.add(subRaw.name);
        const result = parseSequentialStep(subRaw, index);
        // Rewrite error prefixes for clarity
        const prefixed = result.errors.map(e => e.replace(`Step ${index}`, `${prefix}.parallel[${j}]`));
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
            name: raw.name,
            steps: subSteps,
        },
        errors: [],
    };
}
function parseCondition(raw, prefix) {
    const errors = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        errors.push(`${prefix}: "condition" must be an object`);
        return { condition: undefined, errors };
    }
    const cond = raw;
    if (!cond.step || typeof cond.step !== 'string') {
        errors.push(`${prefix}: condition "step" is required`);
    }
    if (!cond.field || typeof cond.field !== 'string') {
        errors.push(`${prefix}: condition "field" is required`);
    }
    if (!cond.operator || !VALID_OPERATORS.includes(cond.operator)) {
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
            step: cond.step,
            field: cond.field,
            operator: cond.operator,
            value: cond.value,
            goto: cond.goto,
        },
        errors: [],
    };
}
function parseJsonSchema(raw, prefix) {
    const errors = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        errors.push(`${prefix}: must be an object`);
        return { schema: undefined, errors };
    }
    const obj = raw;
    const validTypes = ['string', 'number', 'boolean', 'object', 'array', 'null'];
    if (obj.type !== undefined && !validTypes.includes(obj.type)) {
        errors.push(`${prefix}: "type" must be one of: ${validTypes.join(', ')}`);
    }
    if (errors.length > 0) {
        return { schema: undefined, errors };
    }
    // Accept the schema as-is (lightweight validation)
    return { schema: obj, errors: [] };
}
/**
 * Get all step names in a definition (including parallel sub-steps).
 */
function getAllStepNames(definition) {
    const names = [];
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
function countSteps(definition) {
    let count = 0;
    for (const step of definition.steps) {
        if (step.type === 'parallel') {
            count += step.steps.length;
        }
        else {
            count += 1;
        }
    }
    return count;
}
//# sourceMappingURL=pipeline-parser.js.map