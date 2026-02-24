/**
 * ClawStack Event Bus — Cross-Product Communication
 *
 * In-process pub/sub. No Redis, no NATS. Local-first.
 * Every product publishes events. Every product subscribes to what it needs.
 *
 * ClawGuard publishes: behavior.detected, behavior.blocked
 * ClawBudget publishes: cost.recorded, cost.limit_warning, cost.limit_exceeded
 * ClawMemory publishes: memory.entity_created, memory.entity_accessed
 * ClawPipe publishes: pipeline.step_completed, pipeline.completed, pipeline.failed
 * System publishes: session.started, session.ended
 *
 * Enterprise tier can add distributed messaging (NATS/Redis) as a transport layer.
 * The API stays the same — products don't need to change.
 */
import type { EventChannel, BusEvent, EventHandler } from '../types';
type WildcardChannel = EventChannel | '*';
export declare class EventBus {
    private subscriptions;
    private channelIndex;
    private history;
    private maxHistory;
    private subCounter;
    constructor(opts?: {
        maxHistory?: number;
    });
    /**
     * Subscribe to a channel. Returns unsubscribe function.
     */
    on<T = unknown>(channel: WildcardChannel, handler: EventHandler<T>): () => void;
    /**
     * Subscribe to a channel for exactly one event.
     */
    once<T = unknown>(channel: WildcardChannel, handler: EventHandler<T>): () => void;
    /**
     * Publish an event to a channel. All matching subscribers are notified.
     * Supports wildcard ('*') subscribers that receive all events.
     */
    emit<T = unknown>(event: BusEvent<T>): Promise<void>;
    /**
     * Get recent event history, optionally filtered by channel.
     */
    getHistory(channel?: EventChannel, limit?: number): BusEvent[];
    /**
     * Get count of active subscriptions per channel.
     */
    getStats(): Record<string, number>;
    /**
     * Remove all subscriptions. Used for cleanup/testing.
     */
    clear(): void;
    private unsubscribe;
}
export declare function getEventBus(): EventBus;
/**
 * Helper to create a typed event with defaults.
 */
export declare function createEvent<T>(channel: EventChannel, sourceProduct: BusEvent['sourceProduct'], payload: T, opts?: {
    sessionId?: string;
    agentId?: string;
}): BusEvent<T>;
export {};
//# sourceMappingURL=index.d.ts.map