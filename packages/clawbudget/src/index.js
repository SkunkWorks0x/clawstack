"use strict";
/**
 * ClawBudget — Intelligent Cost Control Engine
 *
 * The most monetizable product in ClawStack.
 * Users are hemorrhaging $200/day on runaway agents.
 * ClawBudget stops the bleeding.
 *
 * Components:
 * 1. Budget Guardian — Hard spending limits that terminate sessions
 * 2. Smart Router — Route simple tasks to cheap models, save 80%
 * 3. Context Surgeon — Detect bloated contexts, recommend pruning
 * 4. Heartbeat Optimizer — Convert expensive polling to lightweight checks
 *
 * All components integrate with the Agent Session Graph and Event Bus.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.listModels = exports.getCheapestModel = exports.classifyModelTier = exports.estimateCost = exports.addModelPricing = exports.getModelPricing = exports.HeartbeatOptimizer = exports.ContextSurgeon = exports.SmartRouter = exports.BudgetGuardian = void 0;
var budget_guardian_js_1 = require("./budget-guardian.js");
Object.defineProperty(exports, "BudgetGuardian", { enumerable: true, get: function () { return budget_guardian_js_1.BudgetGuardian; } });
var smart_router_js_1 = require("./smart-router.js");
Object.defineProperty(exports, "SmartRouter", { enumerable: true, get: function () { return smart_router_js_1.SmartRouter; } });
var context_surgeon_js_1 = require("./context-surgeon.js");
Object.defineProperty(exports, "ContextSurgeon", { enumerable: true, get: function () { return context_surgeon_js_1.ContextSurgeon; } });
var heartbeat_optimizer_js_1 = require("./heartbeat-optimizer.js");
Object.defineProperty(exports, "HeartbeatOptimizer", { enumerable: true, get: function () { return heartbeat_optimizer_js_1.HeartbeatOptimizer; } });
var model_pricing_js_1 = require("./model-pricing.js");
Object.defineProperty(exports, "getModelPricing", { enumerable: true, get: function () { return model_pricing_js_1.getModelPricing; } });
Object.defineProperty(exports, "addModelPricing", { enumerable: true, get: function () { return model_pricing_js_1.addModelPricing; } });
Object.defineProperty(exports, "estimateCost", { enumerable: true, get: function () { return model_pricing_js_1.estimateCost; } });
Object.defineProperty(exports, "classifyModelTier", { enumerable: true, get: function () { return model_pricing_js_1.classifyModelTier; } });
Object.defineProperty(exports, "getCheapestModel", { enumerable: true, get: function () { return model_pricing_js_1.getCheapestModel; } });
Object.defineProperty(exports, "listModels", { enumerable: true, get: function () { return model_pricing_js_1.listModels; } });
//# sourceMappingURL=index.js.map