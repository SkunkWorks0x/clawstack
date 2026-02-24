/**
 * Dashboard API Client
 *
 * Thin wrapper around fetch for typed API calls.
 * All endpoints are proxied through Vite in development.
 */
export interface OverviewStats {
    totalAgents: number;
    activeSessions: number;
    threatsBlockedToday: number;
    moneySpentToday: number;
    moneySavedByRouter: number;
    memoryEntities: number;
    activePipelines: number;
}
export interface Agent {
    agentId: string;
    name: string;
    platform: string;
    version: string;
    dockerSandboxed: boolean;
    createdAt: string;
    metadata: Record<string, unknown>;
}
export interface BehaviorEvent {
    eventId: string;
    sessionId: string;
    agentId: string;
    eventType: string;
    timestamp: string;
    details: Record<string, unknown>;
    threatLevel: string;
    threatSignature: string | null;
    blocked: boolean;
}
export interface SkillTrustRow {
    skill_id: string;
    skill_name: string;
    publisher: string;
    trust_level: string;
    certified_at: string | null;
    last_audit_at: string | null;
    threat_history: number;
    behavioral_fingerprint: string | null;
}
export interface DailyCost {
    day: string;
    tokens: number;
    cost_usd: number;
    api_calls: number;
    routed_calls: number;
}
export interface BudgetStatus {
    agentId: string;
    agentName: string;
    budget: {
        maxPerSession: number;
        maxPerDay: number;
        maxPerMonth: number;
        alertThresholdPct: number;
    } | null;
    dailyCost: number;
    dailyTokens: number;
    dailyCalls: number;
    pctUsed: number;
}
export interface RouterStats {
    total_requests: number;
    routed_requests: number;
    routed_cost: number;
    direct_cost: number;
    total_cost: number;
}
export interface SurgeryCandidate {
    session_id: string;
    agent_id: string;
    agent_name: string;
    status: string;
    total_tokens: number;
    total_cost: number;
    call_count: number;
}
export interface MemoryEntity {
    entityId: string;
    agentId: string;
    entityType: string;
    name: string;
    content: string;
    workspace: string;
    confidence: number;
    createdAt: string;
    lastAccessedAt: string;
    accessCount: number;
    tokenCost: number;
}
export interface GraphData {
    nodes: {
        id: string;
        name: string;
        type: string;
        workspace: string;
    }[];
    edges: {
        source: string;
        target: string;
        type: string;
        weight: number;
    }[];
}
export interface RecallResult {
    entities: MemoryEntity[];
    totalTokens: number;
    tokenBudget: number;
    entitiesReturned: number;
}
export interface PipelineSummary {
    pipelineId: string;
    name: string;
    status: string;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    totalSteps: number;
    completedSteps: number;
    totalCostUsd: number;
}
export interface PipelineDetail {
    pipeline: PipelineSummary & {
        definitionYaml: string;
    };
    steps: {
        stepId: string;
        pipelineId: string;
        stepNumber: number;
        name: string;
        agentId: string | null;
        sessionId: string | null;
        status: string;
        result: unknown;
        costUsd: number;
    }[];
}
export interface AgentSetup extends Agent {
    totalSessions: number;
    activeSessions: number;
}
export declare const api: {
    overview: () => Promise<OverviewStats>;
    agents: () => Promise<Agent[]>;
    activeSessions: (agentId?: string) => Promise<any[]>;
    threats: (minLevel?: string) => Promise<BehaviorEvent[]>;
    blockedEvents: () => Promise<any[]>;
    skills: () => Promise<SkillTrustRow[]>;
    dailyCosts: (days?: number) => Promise<DailyCost[]>;
    todayCost: () => Promise<{
        total: number;
        tokens: number;
        calls: number;
    }>;
    budgets: () => Promise<BudgetStatus[]>;
    routerStats: () => Promise<RouterStats>;
    surgeryCandidates: () => Promise<SurgeryCandidate[]>;
    memoryEntities: (filters?: {
        type?: string;
        workspace?: string;
        search?: string;
    }) => Promise<MemoryEntity[]>;
    memoryGraph: (entityId?: string, hops?: number) => Promise<GraphData>;
    memoryRecall: (agentId: string, workspace?: string, tokenBudget?: number) => Promise<RecallResult>;
    pipelines: () => Promise<PipelineSummary[]>;
    pipeline: (id: string) => Promise<PipelineDetail>;
    setupAgents: () => Promise<AgentSetup[]>;
};
export declare function subscribeToEvents(onEvent: (event: any) => void, onError?: (err: Event) => void): () => void;
//# sourceMappingURL=api.d.ts.map