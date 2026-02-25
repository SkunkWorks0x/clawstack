/**
 * Cross-Product Integration — ClawMemory as the Knowledge Hub
 *
 * ClawGuard threat signatures → stored as memories (agent remembers not to trust a skill)
 * ClawBudget cost history → informs recall relevance (expensive sessions = important context)
 * ClawPipe workflow results → persist as memories for cross-pipeline intelligence
 *
 * Subscribes to EventBus channels and auto-creates memory entities.
 */

import { SessionGraph, EventBus, createEvent } from '@clawstack/shared';
import type { BusEvent } from '@clawstack/shared';
import { SmartCapture } from './smart-capture.js';

export class CrossProductIntegration {
  private graph: SessionGraph;
  private bus: EventBus;
  private capture: SmartCapture;
  private unsubscribers: Array<() => void> = [];

  constructor(graph: SessionGraph, bus: EventBus) {
    this.graph = graph;
    this.bus = bus;
    this.capture = new SmartCapture(graph, bus);
  }

  /**
   * Start listening for cross-product events.
   * Call this once during initialization.
   */
  startListening(): void {
    // ClawGuard: blocked behaviors → store as threat memories
    this.unsubscribers.push(
      this.bus.on('behavior.blocked', (event) => this.handleThreatBlocked(event))
    );

    // ClawBudget: cost limits → store as cost context memories
    this.unsubscribers.push(
      this.bus.on('cost.limit_exceeded', (event) => this.handleCostExceeded(event))
    );

    // ClawPipe: completed pipelines → store results as memories
    this.unsubscribers.push(
      this.bus.on('pipeline.completed', (event) => this.handlePipelineCompleted(event))
    );

    // ClawPipe: step results → store individual step results
    this.unsubscribers.push(
      this.bus.on('pipeline.step_completed', (event) => this.handleStepCompleted(event))
    );
  }

  /**
   * Stop listening and clean up subscriptions.
   */
  stopListening(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }

  /**
   * Store a ClawGuard threat as a memory entity.
   * The agent remembers: "skill X was blocked because Y".
   */
  async handleThreatBlocked(event: BusEvent): Promise<void> {
    const payload = event.payload as Record<string, any>;
    const agentId = event.agentId;
    if (!agentId) return;

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

    await this.bus.emit(createEvent(
      'memory.entity_created',
      'clawmemory',
      {
        entityType: 'fact',
        name: `threat:${skillId}`,
        source: 'clawguard',
        reason,
      },
      { sessionId: event.sessionId ?? undefined, agentId }
    ));
  }

  /**
   * Store a ClawBudget cost limit exceeded event as a memory.
   * Expensive sessions get higher recall priority.
   */
  async handleCostExceeded(event: BusEvent): Promise<void> {
    const payload = event.payload as Record<string, any>;
    const agentId = event.agentId;
    if (!agentId) return;

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
  async handlePipelineCompleted(event: BusEvent): Promise<void> {
    const payload = event.payload as Record<string, any>;
    const agentId = event.agentId;
    if (!agentId) return;

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

    await this.bus.emit(createEvent(
      'memory.entity_created',
      'clawmemory',
      {
        entityType: 'fact',
        name: `pipeline:${pipelineName}`,
        source: 'clawpipe',
        pipelineId,
      },
      { sessionId: event.sessionId ?? undefined, agentId }
    ));
  }

  /**
   * Store individual pipeline step results for detailed cross-pipeline recall.
   */
  async handleStepCompleted(event: BusEvent): Promise<void> {
    const payload = event.payload as Record<string, any>;
    const agentId = event.agentId;
    if (!agentId) return;

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
  storeThreatMemory(
    agentId: string,
    skillId: string,
    skillName: string,
    threatSignature: string,
    reason: string,
  ): void {
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
  getSessionCostContext(sessionId: string): { costUsd: number; tokens: number; isExpensive: boolean } {
    const cost = this.graph.getSessionCost(sessionId);
    return {
      costUsd: cost.costUsd,
      tokens: cost.tokens,
      isExpensive: cost.costUsd > 1.0, // >$1 per session = expensive
    };
  }
}
