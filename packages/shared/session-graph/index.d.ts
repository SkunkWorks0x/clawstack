/**
 * Agent Session Graph — The Shared Primitive
 *
 * Every ClawStack product reads from and writes to this.
 * SQLite via better-sqlite3 (synchronous, fast, zero-ops).
 *
 * This is the "employee graph" equivalent from Rippling.
 * Agent identity, behavior, cost, memory, lineage, trust — all here.
 */
import Database from 'better-sqlite3';
import type { AgentIdentity, AgentSession, BehaviorEvent, ThreatLevel, CostRecord, BudgetConfig, MemoryEntity, MemoryRelation, SkillTrust } from '../types';
export declare class SessionGraph {
    private db;
    constructor(dbPath?: string);
    registerAgent(agent: Omit<AgentIdentity, 'agentId' | 'createdAt'> & {
        agentId?: string;
    }): AgentIdentity;
    getAgent(agentId: string): AgentIdentity | null;
    listAgents(): AgentIdentity[];
    startSession(agentId: string, opts?: {
        parentSessionId?: string;
        pipelineId?: string;
        pipelineStep?: number;
    }): AgentSession;
    endSession(sessionId: string, status?: 'completed' | 'terminated' | 'error'): void;
    getActiveSessions(agentId?: string): AgentSession[];
    recordBehavior(event: Omit<BehaviorEvent, 'eventId' | 'timestamp'>): BehaviorEvent;
    getThreats(sessionId?: string, minLevel?: ThreatLevel): BehaviorEvent[];
    recordCost(record: Omit<CostRecord, 'costId' | 'timestamp'>): CostRecord;
    getSessionCost(sessionId: string): {
        tokens: number;
        costUsd: number;
        calls: number;
    };
    getAgentDailyCost(agentId: string, date?: string): {
        tokens: number;
        costUsd: number;
        calls: number;
    };
    setBudget(config: BudgetConfig): void;
    getBudget(agentId: string): BudgetConfig | null;
    checkBudgetExceeded(agentId: string, sessionId: string): {
        session: boolean;
        daily: boolean;
        monthly: boolean;
    };
    createEntity(entity: Omit<MemoryEntity, 'entityId' | 'createdAt' | 'lastAccessedAt' | 'accessCount'>): MemoryEntity;
    createRelation(rel: Omit<MemoryRelation, 'relationId' | 'createdAt'>): MemoryRelation;
    queryMemory(agentId: string, workspace: string, tokenBudget: number): MemoryEntity[];
    setSkillTrust(trust: SkillTrust): void;
    getSkillTrust(skillId: string): SkillTrust | null;
    getUntrustedSkills(): SkillTrust[];
    getSessionSummaries(limit?: number): any[];
    getAgentDailyCosts(agentId: string, days?: number): any[];
    close(): void;
    getDb(): Database.Database;
    private mapSession;
    private mapBehaviorEvent;
    private mapMemoryEntity;
}
//# sourceMappingURL=index.d.ts.map