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
export declare function validateSchema(data: unknown, schema: JsonSchema, path?: string): ValidationResult;
/**
 * Validate that a step's output matches the declared schema.
 */
export declare function validateStepOutput(stepName: string, output: unknown, schema: JsonSchema | undefined): ValidationResult;
/**
 * Validate that a step's input matches the declared schema.
 */
export declare function validateStepInput(stepName: string, input: unknown, schema: JsonSchema | undefined): ValidationResult;
/**
 * Validate compatibility: check that a step's output schema satisfies
 * the next step's input schema requirements.
 */
export declare function validateStepCompatibility(producerName: string, producerOutputSchema: JsonSchema | undefined, consumerName: string, consumerInputSchema: JsonSchema | undefined): ValidationResult;
//# sourceMappingURL=result-validator.d.ts.map