"use strict";
/**
 * Cross-Product Integration — ClawMemory as the Knowledge Hub
 *
 * ClawGuard threat signatures → stored as memories (agent remembers not to trust a skill)
 * ClawBudget cost history → informs recall relevance (expensive sessions = important context)
 * ClawPipe workflow results → persist as memories for cross-pipeline intelligence
 *
 * Subscribes to EventBus channels and auto-creates memory entities.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrossProductIntegration = void 0;
const shared_1 = require("@clawstack/shared");
const smart_capture_js_1 = require("./smart-capture.js");
class CrossProductIntegration {
    graph;
    bus;
    capture;
    unsubscribers = [];
    constructor(graph, bus) {
        this.graph = graph;
        this.bus = bus;
        this.capture = new smart_capture_js_1.SmartCapture(graph, bus);
    }
    /**
     * Start listening for cross-product events.
     * Call this once during initialization.
     */
    startListening() {
        // ClawGuard: blocked behaviors → store as threat memories
        this.unsubscribers.push(this.bus.on('behavior.blocked', (event) => this.handleThreatBlocked(event)));
        // ClawBudget: cost limits → store as cost context memories
        this.unsubscribers.push(this.bus.on('cost.limit_exceeded', (event) => this.handleCostExceeded(event)));
        // ClawPipe: completed pipelines → store results as memories
        this.unsubscribers.push(this.bus.on('pipeline.completed', (event) => this.handlePipelineCompleted(event)));
        // ClawPipe: step results → store individual step results
        this.unsubscribers.push(this.bus.on('pipeline.step_completed', (event) => this.handleStepCompleted(event)));
    }
    /**
     * Stop listening and clean up subscriptions.
     */
    stopListening() {
        for (const unsub of this.unsubscribers) {
            unsub();
        }
        this.unsubscribers = [];
    }
    /**
     * Store a ClawGuard threat as a memory entity.
     * The agent remembers: "skill X was blocked because Y".
     */
    async handleThreatBlocked(event) {
        const payload = event.payload;
        const agentId = event.agentId;
        if (!agentId)
            return;
        const skillId = payload.skillId ?? payload.skill_id ?? 'unknown';
        const reason = payload.reason ?? payload.details ?? 'blocked by ClawGuard';
        const threatSig = payload.threatSignature ?? payload.threat_signature ?? '';
        // Store as a fact entity: "skill X is untrusted"
        this.graph.createEntity({
            agentId,
            entityType: 'fact',
            name: `threat:${skillId}`,
            content: `Skill "${skillId}" was blocked by ClawGuard. Reason: ${reason}. ${threatSig ? `Threat signature: ${threatSig}` : ''}`.trim(),
            workspace: 'security',
            confidence: 0.95, // high confidence — this is a verified security event
            tokenCost: Math.ceil(reason.length / 4) + 20,
        });
        await this.bus.emit((0, shared_1.createEvent)('memory.entity_created', 'clawmemory', {
            entityType: 'fact',
            name: `threat:${skillId}`,
            source: 'clawguard',
            reason,
        }, { sessionId: event.sessionId, agentId }));
    }
    /**
     * Store a ClawBudget cost limit exceeded event as a memory.
     * Expensive sessions get higher recall priority.
     */
    async handleCostExceeded(event) {
        const payload = event.payload;
        const agentId = event.agentId;
        if (!agentId)
            return;
        const costUsd = payload.costUsd ?? payload.cost_usd ?? 0;
        const limit = payload.limit ?? payload.maxPerSession ?? 'unknown';
        const limitType = payload.limitType ?? payload.limit_type ?? 'session';
        this.graph.createEntity({
            agentId,
            entityType: 'fact',
            name: `cost_alert:${limitType}`,
            content: `Cost limit exceeded: $${costUsd} against ${limitType} limit of $${limit}. Session: ${event.sessionId ?? 'unknown'}.`,
            workspace: 'costs',
            confidence: 0.9,
            tokenCost: 30,
        });
    }
    /**
     * Store a completed ClawPipe pipeline result as a memory.
     * Cross-pipeline intelligence: results from one pipeline inform future ones.
     */
    async handlePipelineCompleted(event) {
        const payload = event.payload;
        const agentId = event.agentId;
        if (!agentId)
            return;
        const pipelineId = payload.pipelineId ?? payload.pipeline_id ?? 'unknown';
        const pipelineName = payload.name ?? payload.pipelineName ?? pipelineId;
        const totalSteps = payload.totalSteps ?? payload.total_steps ?? 0;
        const totalCost = payload.totalCostUsd ?? payload.total_cost_usd ?? 0;
        this.graph.createEntity({
            agentId,
            entityType: 'fact',
            name: `pipeline:${pipelineName}`,
            content: `Pipeline "${pipelineName}" completed. ${totalSteps} steps, total cost: $${totalCost}.`,
            workspace: 'pipelines',
            confidence: 0.85,
            tokenCost: 25,
        });
        await this.bus.emit((0, shared_1.createEvent)('memory.entity_created', 'clawmemory', {
            entityType: 'fact',
            name: `pipeline:${pipelineName}`,
            source: 'clawpipe',
            pipelineId,
        }, { sessionId: event.sessionId, agentId }));
    }
    /**
     * Store individual pipeline step results for detailed cross-pipeline recall.
     */
    async handleStepCompleted(event) {
        const payload = event.payload;
        const agentId = event.agentId;
        if (!agentId)
            return;
        const stepName = payload.stepName ?? payload.name ?? 'unknown';
        const pipelineId = payload.pipelineId ?? payload.pipeline_id ?? 'unknown';
        const result = payload.result
            ? (typeof payload.result === 'string' ? payload.result : JSON.stringify(payload.result)).substring(0, 500)
            : 'no result';
        const costUsd = payload.costUsd ?? payload.cost_usd ?? 0;
        this.graph.createEntity({
            agentId,
            entityType: 'fact',
            name: `step:${pipelineId}:${stepName}`,
            content: `Pipeline step "${stepName}" completed. Result: ${result}. Cost: $${costUsd}.`,
            workspace: 'pipelines',
            confidence: 0.7,
            tokenCost: Math.ceil(result.length / 4) + 15,
        });
    }
    /**
     * Manually store a threat memory for a specific skill.
     * Called directly when ClawGuard marks a skill as untrusted.
     */
    storeThreatMemory(agentId, skillId, skillName, threatSignature, reason) {
        this.graph.createEntity({
            agentId,
            entityType: 'fact',
            name: `threat:${skillId}`,
            content: `Skill "${skillName}" (${skillId}) is untrusted. Threat: ${threatSignature}. Reason: ${reason}.`,
            workspace: 'security',
            confidence: 0.95,
            tokenCost: Math.ceil(reason.length / 4) + 30,
        });
    }
    /**
     * Query cost context for a session — helps recall prioritization.
     * Expensive sessions likely contain important context.
     */
    getSessionCostContext(sessionId) {
        const cost = this.graph.getSessionCost(sessionId);
        return {
            costUsd: cost.costUsd,
            tokens: cost.tokens,
            isExpensive: cost.costUsd > 1.0, // >$1 per session = expensive
        };
    }
}
exports.CrossProductIntegration = CrossProductIntegration;
//# sourceMappingURL=cross-product.js.map