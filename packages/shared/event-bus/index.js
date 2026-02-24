"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBus = void 0;
exports.getEventBus = getEventBus;
exports.createEvent = createEvent;
class EventBus {
    subscriptions = new Map();
    channelIndex = new Map();
    history = [];
    maxHistory;
    subCounter = 0;
    constructor(opts) {
        this.maxHistory = opts?.maxHistory ?? 1000;
    }
    /**
     * Subscribe to a channel. Returns unsubscribe function.
     */
    on(channel, handler) {
        const id = `sub_${++this.subCounter}`;
        const sub = { id, channel, handler: handler, once: false };
        this.subscriptions.set(id, sub);
        if (!this.channelIndex.has(channel)) {
            this.channelIndex.set(channel, new Set());
        }
        this.channelIndex.get(channel).add(id);
        return () => this.unsubscribe(id);
    }
    /**
     * Subscribe to a channel for exactly one event.
     */
    once(channel, handler) {
        const id = `sub_${++this.subCounter}`;
        const sub = { id, channel, handler: handler, once: true };
        this.subscriptions.set(id, sub);
        if (!this.channelIndex.has(channel)) {
            this.channelIndex.set(channel, new Set());
        }
        this.channelIndex.get(channel).add(id);
        return () => this.unsubscribe(id);
    }
    /**
     * Publish an event to a channel. All matching subscribers are notified.
     * Supports wildcard ('*') subscribers that receive all events.
     */
    async emit(event) {
        // Store in history (ring buffer)
        this.history.push(event);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        // Collect matching subscription IDs
        const matchingIds = new Set();
        // Exact channel match
        const channelSubs = this.channelIndex.get(event.channel);
        if (channelSubs) {
            for (const id of channelSubs)
                matchingIds.add(id);
        }
        // Wildcard subscribers
        const wildcardSubs = this.channelIndex.get('*');
        if (wildcardSubs) {
            for (const id of wildcardSubs)
                matchingIds.add(id);
        }
        // Prefix match: 'behavior.*' matches 'behavior.detected'
        for (const [channel, subIds] of this.channelIndex) {
            if (channel !== '*' && channel.endsWith('.*')) {
                const prefix = channel.slice(0, -2);
                if (event.channel.startsWith(prefix)) {
                    for (const id of subIds)
                        matchingIds.add(id);
                }
            }
        }
        // Fire all handlers
        const toRemove = [];
        for (const id of matchingIds) {
            const sub = this.subscriptions.get(id);
            if (!sub)
                continue;
            try {
                await sub.handler(event);
            }
            catch (err) {
                console.error(`[EventBus] Handler error on ${event.channel}:`, err);
            }
            if (sub.once) {
                toRemove.push(id);
            }
        }
        // Clean up one-shot subscriptions
        for (const id of toRemove) {
            this.unsubscribe(id);
        }
    }
    /**
     * Get recent event history, optionally filtered by channel.
     */
    getHistory(channel, limit = 100) {
        let events = channel
            ? this.history.filter(e => e.channel === channel)
            : this.history;
        return events.slice(-limit);
    }
    /**
     * Get count of active subscriptions per channel.
     */
    getStats() {
        const stats = {};
        for (const [channel, ids] of this.channelIndex) {
            stats[channel] = ids.size;
        }
        return stats;
    }
    /**
     * Remove all subscriptions. Used for cleanup/testing.
     */
    clear() {
        this.subscriptions.clear();
        this.channelIndex.clear();
        this.history = [];
    }
    unsubscribe(id) {
        const sub = this.subscriptions.get(id);
        if (!sub)
            return;
        this.subscriptions.delete(id);
        const channelSubs = this.channelIndex.get(sub.channel);
        if (channelSubs) {
            channelSubs.delete(id);
            if (channelSubs.size === 0) {
                this.channelIndex.delete(sub.channel);
            }
        }
    }
}
exports.EventBus = EventBus;
/**
 * Singleton bus instance for the ClawStack process.
 * All packages import and use this shared instance.
 */
let _globalBus = null;
function getEventBus() {
    if (!_globalBus) {
        _globalBus = new EventBus();
    }
    return _globalBus;
}
/**
 * Helper to create a typed event with defaults.
 */
function createEvent(channel, sourceProduct, payload, opts) {
    return {
        channel,
        timestamp: new Date().toISOString(),
        sourceProduct,
        sessionId: opts?.sessionId ?? null,
        agentId: opts?.agentId ?? null,
        payload,
    };
}
//# sourceMappingURL=index.js.map