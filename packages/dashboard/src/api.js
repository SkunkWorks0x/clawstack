/**
 * Dashboard API Client
 *
 * Thin wrapper around fetch for typed API calls.
 * All endpoints are proxied through Vite in development.
 */
const BASE = '/api';
async function get(path, params) {
    const url = new URL(`${BASE}${path}`, window.location.origin);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== '')
                url.searchParams.set(k, v);
        }
    }
    const res = await fetch(url.toString());
    if (!res.ok)
        throw new Error(`API error: ${res.status} ${res.statusText}`);
    return res.json();
}
// ─── API Functions ─────────────────────────────────────────────────
export const api = {
    overview: () => get('/overview'),
    agents: () => get('/agents'),
    activeSessions: (agentId) => get('/sessions/active', agentId ? { agentId } : undefined),
    // Security
    threats: (minLevel) => get('/threats', minLevel ? { minLevel } : undefined),
    blockedEvents: () => get('/threats/blocked'),
    skills: () => get('/skills'),
    // Cost
    dailyCosts: (days) => get('/costs/daily', days ? { days: String(days) } : undefined),
    todayCost: () => get('/costs/today'),
    budgets: () => get('/budgets'),
    routerStats: () => get('/costs/router-stats'),
    surgeryCandidates: () => get('/costs/surgery'),
    // Memory
    memoryEntities: (filters) => get('/memory/entities', filters),
    memoryGraph: (entityId, hops) => get('/memory/graph', {
        ...(entityId ? { entityId } : {}),
        ...(hops ? { hops: String(hops) } : {}),
    }),
    memoryRecall: (agentId, workspace, tokenBudget) => get('/memory/recall', {
        agentId,
        ...(workspace ? { workspace } : {}),
        ...(tokenBudget ? { tokenBudget: String(tokenBudget) } : {}),
    }),
    // Pipelines
    pipelines: () => get('/pipelines'),
    pipeline: (id) => get(`/pipelines/${id}`),
    // Setup
    setupAgents: () => get('/setup/agents'),
};
// ─── SSE Stream ────────────────────────────────────────────────────
export function subscribeToEvents(onEvent, onError) {
    const source = new EventSource('/api/events/stream');
    source.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            onEvent(data);
        }
        catch {
            // Ignore parse errors
        }
    };
    source.onerror = (e) => {
        onError?.(e);
    };
    return () => source.close();
}
//# sourceMappingURL=api.js.map