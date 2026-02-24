/**
 * Cross-Product Integration — ClawMemory as the Knowledge Hub
 *
 * ClawGuard threat signatures → stored as memories (agent remembers not to trust a skill)
 * ClawBudget cost history → informs recall relevance (expensive sessions = important context)
 * ClawPipe workflow results → persist as memories for cross-pipeline intelligence
 *
 * Subscribes to EventBus channels and auto-creates memory entities.
 */
import { SessionGraph, EventBus } from '@clawstack/shared';
import type { BusEvent } from '@clawstack/shared';
export declare class CrossProductIntegration {
    private graph;
    private bus;
    private capture;
    private unsubscribers;
    constructor(graph: SessionGraph, bus: EventBus);
    /**
     * Start listening for cross-product events.
     * Call this once during initialization.
     */
    startListening(): void;
    /**
     * Stop listening and clean up subscriptions.
     */
    stopListening(): void;
    /**
     * Store a ClawGuard threat as a memory entity.
     * The agent remembers: "skill X was blocked because Y".
     */
    handleThreatBlocked(event: BusEvent): Promise<void>;
    /**
     * Store a ClawBudget cost limit exceeded event as a memory.
     * Expensive sessions get higher recall priority.
     */
    handleCostExceeded(event: BusEvent): Promise<void>;
    /**
     * Store a completed ClawPipe pipeline result as a memory.
     * Cross-pipeline intelligence: results from one pipeline inform future ones.
     */
    handlePipelineCompleted(event: BusEvent): Promise<void>;
    /**
     * Store individual pipeline step results for detailed cross-pipeline recall.
     */
    handleStepCompleted(event: BusEvent): Promise<void>;
    /**
     * Manually store a threat memory for a specific skill.
     * Called directly when ClawGuard marks a skill as untrusted.
     */
    storeThreatMemory(agentId: string, skillId: string, skillName: string, threatSignature: string, reason: string): void;
    /**
     * Query cost context for a session — helps recall prioritization.
     * Expensive sessions likely contain important context.
     */
    getSessionCostContext(sessionId: string): {
        costUsd: number;
        tokens: number;
        isExpensive: boolean;
    };
}
//# sourceMappingURL=cross-product.d.ts.map