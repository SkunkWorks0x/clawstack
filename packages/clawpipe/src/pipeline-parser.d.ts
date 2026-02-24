/**
 * Pipeline Parser — Parse YAML pipeline definitions into typed structures.
 *
 * Validates structure, required fields, and step references.
 * Returns clear errors when the definition is invalid.
 */
import type { PipelineDefinition, ParseResult } from './types.js';
/**
 * Parse a YAML string into a validated PipelineDefinition.
 */
export declare function parsePipeline(yamlString: string): ParseResult;
/**
 * Validate a raw object (already parsed from YAML/JSON) into a PipelineDefinition.
 */
export declare function validateAndTransform(raw: unknown): ParseResult;
/**
 * Get all step names in a definition (including parallel sub-steps).
 */
export declare function getAllStepNames(definition: PipelineDefinition): string[];
/**
 * Count total executable steps (parallel sub-steps count individually).
 */
export declare function countSteps(definition: PipelineDefinition): number;
//# sourceMappingURL=pipeline-parser.d.ts.map