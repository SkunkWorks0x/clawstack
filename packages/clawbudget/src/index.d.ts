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
export { BudgetGuardian } from './budget-guardian.js';
export type { CostInput, BudgetCheckResult, CostAnomaly } from './budget-guardian.js';
export { SmartRouter } from './smart-router.js';
export type { TaskComplexity, RoutingInput, RoutingDecision, ComplexitySignals } from './smart-router.js';
export { ContextSurgeon } from './context-surgeon.js';
export type { MessageProfile, SessionContextAnalysis, ContextIssue, PruneRecommendation, ContextSnapshot, } from './context-surgeon.js';
export { HeartbeatOptimizer } from './heartbeat-optimizer.js';
export type { ApiCallRecord, PollingPattern, OptimizationRecommendation, } from './heartbeat-optimizer.js';
export { getModelPricing, addModelPricing, estimateCost, classifyModelTier, getCheapestModel, listModels, } from './model-pricing.js';
export type { ModelPricing } from './model-pricing.js';
//# sourceMappingURL=index.d.ts.map