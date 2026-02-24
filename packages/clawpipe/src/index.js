"use strict";
/**
 * ClawPipe — Deterministic Multi-Agent Pipeline Framework
 * "Humans define the flow. Agents do the work."
 *
 * YAML-defined pipelines. Context managed per-step.
 * Results typed/validated between steps.
 * Parallel execution. Full audit trail.
 *
 * Integration: SessionGraph, EventBus, ClawBudget, ClawGuard.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineRegistry = exports.validateStepCompatibility = exports.validateStepInput = exports.validateStepOutput = exports.validateSchema = exports.resolveVariables = exports.PipelineExecutor = exports.countSteps = exports.getAllStepNames = exports.validateAndTransform = exports.parsePipeline = exports.VERSION = void 0;
exports.VERSION = '0.1.0';
// ─── Pipeline Parser ─────────────────────────────────────────────
var pipeline_parser_js_1 = require("./pipeline-parser.js");
Object.defineProperty(exports, "parsePipeline", { enumerable: true, get: function () { return pipeline_parser_js_1.parsePipeline; } });
Object.defineProperty(exports, "validateAndTransform", { enumerable: true, get: function () { return pipeline_parser_js_1.validateAndTransform; } });
Object.defineProperty(exports, "getAllStepNames", { enumerable: true, get: function () { return pipeline_parser_js_1.getAllStepNames; } });
Object.defineProperty(exports, "countSteps", { enumerable: true, get: function () { return pipeline_parser_js_1.countSteps; } });
// ─── Pipeline Executor ───────────────────────────────────────────
var pipeline_executor_js_1 = require("./pipeline-executor.js");
Object.defineProperty(exports, "PipelineExecutor", { enumerable: true, get: function () { return pipeline_executor_js_1.PipelineExecutor; } });
Object.defineProperty(exports, "resolveVariables", { enumerable: true, get: function () { return pipeline_executor_js_1.resolveVariables; } });
// ─── Result Validator ────────────────────────────────────────────
var result_validator_js_1 = require("./result-validator.js");
Object.defineProperty(exports, "validateSchema", { enumerable: true, get: function () { return result_validator_js_1.validateSchema; } });
Object.defineProperty(exports, "validateStepOutput", { enumerable: true, get: function () { return result_validator_js_1.validateStepOutput; } });
Object.defineProperty(exports, "validateStepInput", { enumerable: true, get: function () { return result_validator_js_1.validateStepInput; } });
Object.defineProperty(exports, "validateStepCompatibility", { enumerable: true, get: function () { return result_validator_js_1.validateStepCompatibility; } });
// ─── Pipeline Registry ───────────────────────────────────────────
var pipeline_registry_js_1 = require("./pipeline-registry.js");
Object.defineProperty(exports, "PipelineRegistry", { enumerable: true, get: function () { return pipeline_registry_js_1.PipelineRegistry; } });
//# sourceMappingURL=index.js.map