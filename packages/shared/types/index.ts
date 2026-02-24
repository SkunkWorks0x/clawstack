/**
 * ClawStack Shared Types
 *
 * The Agent Session Graph is the shared primitive. Every product reads/writes it.
 * These types define the graph's shape across all packages.
 */

// ─── Agent Identity ───────────────────────────────────────────────

export interface AgentIdentity {
  agentId: string;
  name: string;
  platform: 'openclaw' | 'custom';
  version: string;
  dockerSandboxed: boolean;
  createdAt: string; // ISO 8601
  metadata: Record<string, unknown>;
}

// ─── Sessions ─────────────────────────────────────────────────────

export type SessionStatus = 'active' | 'completed' | 'terminated' | 'error';

export interface AgentSession {
  sessionId: string;
  agentId: string;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  parentSessionId: string | null; // lineage tracking
  pipelineId: string | null;      // if part of a ClawPipe pipeline
  pipelineStep: number | null;
}

// ─── Behavior (ClawGuard writes, all read) ────────────────────────

export type BehaviorEventType =
  | 'tool_call'
  | 'network_request'
  | 'file_access'
  | 'memory_write'
  | 'memory_read'
  | 'skill_execution'
  | 'message_send'
  | 'process_spawn';

export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface BehaviorEvent {
  eventId: string;
  sessionId: string;
  agentId: string;
  eventType: BehaviorEventType;
  timestamp: string;
  details: Record<string, unknown>;
  threatLevel: ThreatLevel;
  threatSignature: string | null; // ClawGuard threat ID if flagged
  blocked: boolean;
}

// ─── Cost (ClawBudget writes, all read) ───────────────────────────

export type ModelTier = 'haiku' | 'sonnet' | 'opus' | 'unknown';

export interface CostRecord {
  costId: string;
  sessionId: string;
  agentId: string;
  timestamp: string;
  model: string;
  modelTier: ModelTier;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  routedBy: 'user' | 'smart_router'; // did ClawBudget route this?
  originalModel: string | null;      // if smart-routed, what was requested
}

export interface BudgetConfig {
  agentId: string;
  maxPerSession: number;    // USD
  maxPerDay: number;        // USD
  maxPerMonth: number;      // USD
  alertThresholdPct: number; // 0-100, trigger alert at this % of limit
}

// ─── Memory (ClawMemory writes, all read) ─────────────────────────

export type EntityType = 'person' | 'tool' | 'skill' | 'concept' | 'preference' | 'decision' | 'fact';
export type RelationType = 'uses' | 'manages' | 'depends_on' | 'contradicts' | 'related_to' | 'learned_from' | 'trusts' | 'distrusts';

export interface MemoryEntity {
  entityId: string;
  agentId: string;
  entityType: EntityType;
  name: string;
  content: string;
  workspace: string;        // isolation: 'personal' | 'work' | project name
  confidence: number;       // 0-1
  createdAt: string;
  lastAccessedAt: string;
  accessCount: number;
  tokenCost: number;        // how many tokens to include this in context
}

export interface MemoryRelation {
  relationId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationType: RelationType;
  weight: number;           // 0-1, strength of relationship
  evidence: string;         // why this relation exists
  createdAt: string;
}

// ─── Trust (ClawGuard writes, ClawForge/ClawPipe read) ────────────

export type TrustLevel = 'unknown' | 'untrusted' | 'community' | 'verified' | 'certified';

export interface SkillTrust {
  skillId: string;
  skillName: string;
  publisher: string;
  trustLevel: TrustLevel;
  certifiedAt: string | null;
  lastAuditAt: string | null;
  threatHistory: number;    // count of flagged events
  behavioralFingerprint: string | null; // hash of known-good behavior
}

// ─── Pipelines (ClawPipe writes) ──────────────────────────────────

export type PipelineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Pipeline {
  pipelineId: string;
  name: string;
  definitionYaml: string;   // the YAML source
  status: PipelineStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  totalSteps: number;
  completedSteps: number;
  totalCostUsd: number;
}

export interface PipelineStep {
  stepId: string;
  pipelineId: string;
  stepNumber: number;
  name: string;
  agentId: string | null;   // assigned agent
  sessionId: string | null;  // agent's session
  status: PipelineStatus;
  inputSchema: string;       // JSON schema
  outputSchema: string;      // JSON schema
  result: string | null;     // JSON result
  costUsd: number;
}

// ─── Event Bus ────────────────────────────────────────────────────

export type EventChannel =
  | 'session.started'
  | 'session.ended'
  | 'behavior.detected'
  | 'behavior.blocked'
  | 'cost.recorded'
  | 'cost.limit_warning'
  | 'cost.limit_exceeded'
  | 'memory.entity_created'
  | 'memory.entity_accessed'
  | 'trust.level_changed'
  | 'pipeline.step_completed'
  | 'pipeline.completed'
  | 'pipeline.failed';

export interface BusEvent<T = unknown> {
  channel: EventChannel;
  timestamp: string;
  sourceProduct: 'clawforge' | 'clawguard' | 'clawbudget' | 'clawpipe' | 'clawmemory' | 'system';
  sessionId: string | null;
  agentId: string | null;
  payload: T;
}

export type EventHandler<T = unknown> = (event: BusEvent<T>) => void | Promise<void>;
