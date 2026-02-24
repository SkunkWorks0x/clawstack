/**
 * Result Validator — Type-check results between pipeline steps.
 *
 * Lightweight JSON Schema validation (no ajv dependency).
 * Validates: type, required, properties, items, min/max, enum.
 * Clear error messages when validation fails.
 */

import type { JsonSchema, ValidationResult } from './types.js';

/**
 * Validate data against a JSON Schema subset.
 */
export function validateSchema(data: unknown, schema: JsonSchema, path = ''): ValidationResult {
  const errors: string[] = [];

  // Empty schema = anything passes
  if (!schema || Object.keys(schema).length === 0) {
    return { valid: true, errors: [] };
  }

  // Enum check (applies to any type)
  if (schema.enum !== undefined) {
    if (!schema.enum.some(v => deepEqual(v, data))) {
      errors.push(`${path || 'value'}: must be one of [${schema.enum.map(v => JSON.stringify(v)).join(', ')}], got ${JSON.stringify(data)}`);
      return { valid: false, errors };
    }
  }

  // Type check
  if (schema.type) {
    const typeError = checkType(data, schema.type, path);
    if (typeError) {
      errors.push(typeError);
      return { valid: false, errors };
    }
  }

  // String validations
  if (schema.type === 'string' && typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push(`${path || 'value'}: string length ${data.length} is less than minimum ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push(`${path || 'value'}: string length ${data.length} exceeds maximum ${schema.maxLength}`);
    }
  }

  // Number validations
  if (schema.type === 'number' && typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push(`${path || 'value'}: ${data} is less than minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push(`${path || 'value'}: ${data} exceeds maximum ${schema.maximum}`);
    }
  }

  // Object validations
  if (schema.type === 'object' && typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    // Required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in obj)) {
          errors.push(`${path || 'value'}: missing required field "${field}"`);
        }
      }
    }

    // Property schemas
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          const propPath = path ? `${path}.${key}` : key;
          const propResult = validateSchema(obj[key], propSchema, propPath);
          errors.push(...propResult.errors);
        }
      }
    }
  }

  // Array validations
  if (schema.type === 'array' && Array.isArray(data)) {
    if (schema.items) {
      for (let i = 0; i < data.length; i++) {
        const itemPath = `${path || 'value'}[${i}]`;
        const itemResult = validateSchema(data[i], schema.items, itemPath);
        errors.push(...itemResult.errors);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate that a step's output matches the declared schema.
 */
export function validateStepOutput(
  stepName: string,
  output: unknown,
  schema: JsonSchema | undefined
): ValidationResult {
  if (!schema) {
    return { valid: true, errors: [] };
  }

  const result = validateSchema(output, schema, `${stepName}.output`);
  if (!result.valid) {
    result.errors = result.errors.map(e => `Output validation failed for step "${stepName}": ${e}`);
  }
  return result;
}

/**
 * Validate that a step's input matches the declared schema.
 */
export function validateStepInput(
  stepName: string,
  input: unknown,
  schema: JsonSchema | undefined
): ValidationResult {
  if (!schema) {
    return { valid: true, errors: [] };
  }

  const result = validateSchema(input, schema, `${stepName}.input`);
  if (!result.valid) {
    result.errors = result.errors.map(e => `Input validation failed for step "${stepName}": ${e}`);
  }
  return result;
}

/**
 * Validate compatibility: check that a step's output schema satisfies
 * the next step's input schema requirements.
 */
export function validateStepCompatibility(
  producerName: string,
  producerOutputSchema: JsonSchema | undefined,
  consumerName: string,
  consumerInputSchema: JsonSchema | undefined
): ValidationResult {
  if (!producerOutputSchema || !consumerInputSchema) {
    return { valid: true, errors: [] };
  }

  const errors: string[] = [];

  // If consumer requires an object with specific fields,
  // check producer declares those fields
  if (consumerInputSchema.type === 'object' && consumerInputSchema.required) {
    if (producerOutputSchema.type !== 'object') {
      errors.push(
        `Step "${consumerName}" expects object input, but step "${producerName}" outputs type "${producerOutputSchema.type}"`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Helpers ─────────────────────────────────────────────────────

function checkType(data: unknown, expectedType: string, path: string): string | null {
  const actualType = getJsonType(data);

  if (actualType !== expectedType) {
    return `${path || 'value'}: expected type "${expectedType}", got "${actualType}"`;
  }
  return null;
}

function getJsonType(data: unknown): string {
  if (data === null) return 'null';
  if (Array.isArray(data)) return 'array';
  return typeof data; // string, number, boolean, object
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every(key =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key]
    )
  );
}
