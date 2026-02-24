"use strict";
/**
 * Agent Session Graph — The Shared Primitive
 *
 * Every ClawStack product reads from and writes to this.
 * SQLite via better-sqlite3 (synchronous, fast, zero-ops).
 *
 * This is the "employee graph" equivalent from Rippling.
 * Agent identity, behavior, cost, memory, lineage, trust — all here.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionGraph = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const crypto_1 = require("crypto");
const path_1 = require("path");
// ─── Schema ───────────────────────────────────────────────────────
const SCHEMA = `
-- Agent Identity: who is this agent?
CREATE TABLE IF NOT EXISTS agents (
  agent_id        TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  platform        TEXT NOT NULL DEFAULT 'openclaw',
  version         TEXT NOT NULL DEFAULT '0.0.0',
  docker_sandboxed INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  metadata        TEXT NOT NULL DEFAULT '{}'
);

-- Sessions: what is this agent doing right now?
CREATE TABLE IF NOT EXISTS sessions (
  session_id        TEXT PRIMARY KEY,
  agent_id          TEXT NOT NULL REFERENCES agents(agent_id),
  status            TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','terminated','error')),
  started_at        TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at          TEXT,
  parent_session_id TEXT REFERENCES sessions(session_id),
  pipeline_id       TEXT REFERENCES pipelines(pipeline_id),
  pipeline_step     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Behavior Events: what actions is the agent taking? (ClawGuard primary writer)
CREATE TABLE IF NOT EXISTS behavior_events (
  event_id          TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES sessions(session_id),
  agent_id          TEXT NOT NULL REFERENCES agents(agent_id),
  event_type        TEXT NOT NULL,
  timestamp         TEXT NOT NULL DEFAULT (datetime('now')),
  details           TEXT NOT NULL DEFAULT '{}',
  threat_level      TEXT NOT NULL DEFAULT 'none' CHECK(threat_level IN ('none','low','medium','high','critical')),
  threat_signature  TEXT,
  blocked           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_behavior_session ON behavior_events(session_id);
CREATE INDEX IF NOT EXISTS idx_behavior_threat ON behavior_events(threat_level);
CREATE INDEX IF NOT EXISTS idx_behavior_timestamp ON behavior_events(timestamp);

-- Cost Records: how many tokens/dollars is this costing? (ClawBudget primary writer)
CREATE TABLE IF NOT EXISTS cost_records (
  cost_id           TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES sessions(session_id),
  agent_id          TEXT NOT NULL REFERENCES agents(agent_id),
  timestamp         TEXT NOT NULL DEFAULT (datetime('now')),
  model             TEXT NOT NULL,
  model_tier        TEXT NOT NULL DEFAULT 'unknown',
  input_tokens      INTEGER NOT NULL DEFAULT 0,
  output_tokens     INTEGER NOT NULL DEFAULT 0,
  thinking_tokens   INTEGER NOT NULL DEFAULT 0,
  total_tokens      INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  routed_by         TEXT NOT NULL DEFAULT 'user',
  original_model    TEXT
);
CREATE INDEX IF NOT EXISTS idx_cost_session ON cost_records(session_id);
CREATE INDEX IF NOT EXISTS idx_cost_agent ON cost_records(agent_id);
CREATE INDEX IF NOT EXISTS idx_cost_timestamp ON cost_records(timestamp);

-- Budget Configs: spending limits per agent (ClawBudget)
CREATE TABLE IF NOT EXISTS budget_configs (
  agent_id            TEXT PRIMARY KEY REFERENCES agents(agent_id),
  max_per_session     REAL NOT NULL DEFAULT 5.0,
  max_per_day         REAL NOT NULL DEFAULT 50.0,
  max_per_month       REAL NOT NULL DEFAULT 500.0,
  alert_threshold_pct REAL NOT NULL DEFAULT 80.0
);

-- Memory Entities: what does the agent know? (ClawMemory primary writer)
CREATE TABLE IF NOT EXISTS memory_entities (
  entity_id       TEXT PRIMARY KEY,
  agent_id        TEXT NOT NULL REFERENCES agents(agent_id),
  entity_type     TEXT NOT NULL,
  name            TEXT NOT NULL,
  content         TEXT NOT NULL,
  workspace       TEXT NOT NULL DEFAULT 'default',
  confidence      REAL NOT NULL DEFAULT 0.5,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
  access_count    INTEGER NOT NULL DEFAULT 0,
  token_cost      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory_entities(agent_id);
CREATE INDEX IF NOT EXISTS idx_memory_workspace ON memory_entities(workspace);
CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_entities(entity_type);

-- Memory Relations: how do entities connect? (Knowledge graph edges)
CREATE TABLE IF NOT EXISTS memory_relations (
  relation_id       TEXT PRIMARY KEY,
  source_entity_id  TEXT NOT NULL REFERENCES memory_entities(entity_id),
  target_entity_id  TEXT NOT NULL REFERENCES memory_entities(entity_id),
  relation_type     TEXT NOT NULL,
  weight            REAL NOT NULL DEFAULT 0.5,
  evidence          TEXT NOT NULL DEFAULT '',
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_relation_source ON memory_relations(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relation_target ON memory_relations(target_entity_id);

-- Skill Trust: trust certification for skills (ClawGuard writes, others read)
CREATE TABLE IF NOT EXISTS skill_trust (
  skill_id              TEXT PRIMARY KEY,
  skill_name            TEXT NOT NULL,
  publisher             TEXT NOT NULL,
  trust_level           TEXT NOT NULL DEFAULT 'unknown' CHECK(trust_level IN ('unknown','untrusted','community','verified','certified')),
  certified_at          TEXT,
  last_audit_at         TEXT,
  threat_history        INTEGER NOT NULL DEFAULT 0,
  behavioral_fingerprint TEXT
);
CREATE INDEX IF NOT EXISTS idx_trust_level ON skill_trust(trust_level);
CREATE INDEX IF NOT EXISTS idx_trust_publisher ON skill_trust(publisher);

-- Pipelines: multi-agent workflows (ClawPipe primary writer)
CREATE TABLE IF NOT EXISTS pipelines (
  pipeline_id     TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  definition_yaml TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','cancelled')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  started_at      TEXT,
  completed_at    TEXT,
  total_steps     INTEGER NOT NULL DEFAULT 0,
  completed_steps INTEGER NOT NULL DEFAULT 0,
  total_cost_usd  REAL NOT NULL DEFAULT 0
);

-- Pipeline Steps: individual steps within a pipeline
CREATE TABLE IF NOT EXISTS pipeline_steps (
  step_id       TEXT PRIMARY KEY,
  pipeline_id   TEXT NOT NULL REFERENCES pipelines(pipeline_id),
  step_number   INTEGER NOT NULL,
  name          TEXT NOT NULL,
  agent_id      TEXT REFERENCES agents(agent_id),
  session_id    TEXT REFERENCES sessions(session_id),
  status        TEXT NOT NULL DEFAULT 'pending',
  input_schema  TEXT NOT NULL DEFAULT '{}',
  output_schema TEXT NOT NULL DEFAULT '{}',
  result        TEXT,
  cost_usd      REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_steps_pipeline ON pipeline_steps(pipeline_id);

-- Aggregated views for dashboard
CREATE VIEW IF NOT EXISTS v_session_summary AS
SELECT
  s.session_id,
  s.agent_id,
  a.name as agent_name,
  s.status,
  s.started_at,
  s.ended_at,
  COUNT(DISTINCT be.event_id) as total_events,
  SUM(CASE WHEN be.threat_level != 'none' THEN 1 ELSE 0 END) as threat_events,
  SUM(CASE WHEN be.blocked = 1 THEN 1 ELSE 0 END) as blocked_events,
  COALESCE(SUM(cr.total_tokens), 0) as total_tokens,
  COALESCE(SUM(cr.estimated_cost_usd), 0) as total_cost_usd
FROM sessions s
JOIN agents a ON s.agent_id = a.agent_id
LEFT JOIN behavior_events be ON s.session_id = be.session_id
LEFT JOIN cost_records cr ON s.session_id = cr.session_id
GROUP BY s.session_id;

CREATE VIEW IF NOT EXISTS v_agent_daily_cost AS
SELECT
  agent_id,
  date(timestamp) as day,
  SUM(total_tokens) as tokens,
  SUM(estimated_cost_usd) as cost_usd,
  COUNT(*) as api_calls
FROM cost_records
GROUP BY agent_id, date(timestamp);
`;
// ─── Database Class ───────────────────────────────────────────────
class SessionGraph {
    db;
    constructor(dbPath) {
        const resolvedPath = dbPath || (0, path_1.join)(process.cwd(), '.clawstack', 'session-graph.db');
        this.db = new better_sqlite3_1.default(resolvedPath);
        // Performance pragmas for local-first SQLite
        this.db.pragma('journal_mode = WAL'); // concurrent reads
        this.db.pragma('synchronous = NORMAL'); // safe + fast
        this.db.pragma('foreign_keys = ON'); // enforce relations
        this.db.pragma('cache_size = -64000'); // 64MB cache
        this.db.exec(SCHEMA);
    }
    // ─── Agents ───────────────────────────────────────────────────
    registerAgent(agent) {
        const agentId = agent.agentId || (0, crypto_1.randomUUID)();
        const createdAt = new Date().toISOString();
        this.db.prepare(`
      INSERT INTO agents (agent_id, name, platform, version, docker_sandboxed, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(agentId, agent.name, agent.platform, agent.version, agent.dockerSandboxed ? 1 : 0, createdAt, JSON.stringify(agent.metadata));
        return { agentId, createdAt, ...agent };
    }
    getAgent(agentId) {
        const row = this.db.prepare('SELECT * FROM agents WHERE agent_id = ?').get(agentId);
        if (!row)
            return null;
        return {
            agentId: row.agent_id,
            name: row.name,
            platform: row.platform,
            version: row.version,
            dockerSandboxed: !!row.docker_sandboxed,
            createdAt: row.created_at,
            metadata: JSON.parse(row.metadata),
        };
    }
    listAgents() {
        const rows = this.db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all();
        return rows.map(row => ({
            agentId: row.agent_id,
            name: row.name,
            platform: row.platform,
            version: row.version,
            dockerSandboxed: !!row.docker_sandboxed,
            createdAt: row.created_at,
            metadata: JSON.parse(row.metadata),
        }));
    }
    // ─── Sessions ─────────────────────────────────────────────────
    startSession(agentId, opts) {
        const sessionId = (0, crypto_1.randomUUID)();
        const startedAt = new Date().toISOString();
        this.db.prepare(`
      INSERT INTO sessions (session_id, agent_id, status, started_at, parent_session_id, pipeline_id, pipeline_step)
      VALUES (?, ?, 'active', ?, ?, ?, ?)
    `).run(sessionId, agentId, startedAt, opts?.parentSessionId || null, opts?.pipelineId || null, opts?.pipelineStep ?? null);
        return {
            sessionId,
            agentId,
            status: 'active',
            startedAt,
            endedAt: null,
            parentSessionId: opts?.parentSessionId || null,
            pipelineId: opts?.pipelineId || null,
            pipelineStep: opts?.pipelineStep ?? null,
        };
    }
    endSession(sessionId, status = 'completed') {
        this.db.prepare(`
      UPDATE sessions SET status = ?, ended_at = datetime('now') WHERE session_id = ?
    `).run(status, sessionId);
    }
    getActiveSessions(agentId) {
        const query = agentId
            ? 'SELECT * FROM sessions WHERE status = ? AND agent_id = ?'
            : 'SELECT * FROM sessions WHERE status = ?';
        const params = agentId ? ['active', agentId] : ['active'];
        const rows = this.db.prepare(query).all(...params);
        return rows.map(this.mapSession);
    }
    // ─── Behavior Events ──────────────────────────────────────────
    recordBehavior(event) {
        const eventId = (0, crypto_1.randomUUID)();
        const timestamp = new Date().toISOString();
        this.db.prepare(`
      INSERT INTO behavior_events (event_id, session_id, agent_id, event_type, timestamp, details, threat_level, threat_signature, blocked)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(eventId, event.sessionId, event.agentId, event.eventType, timestamp, JSON.stringify(event.details), event.threatLevel, event.threatSignature || null, event.blocked ? 1 : 0);
        return { eventId, timestamp, ...event };
    }
    getThreats(sessionId, minLevel = 'low') {
        const levels = ['low', 'medium', 'high', 'critical'];
        const minIdx = levels.indexOf(minLevel);
        const validLevels = levels.slice(minIdx);
        const placeholders = validLevels.map(() => '?').join(',');
        let query = `SELECT * FROM behavior_events WHERE threat_level IN (${placeholders})`;
        let params = [...validLevels];
        if (sessionId) {
            query += ' AND session_id = ?';
            params.push(sessionId);
        }
        query += ' ORDER BY timestamp DESC';
        const rows = this.db.prepare(query).all(...params);
        return rows.map(this.mapBehaviorEvent);
    }
    // ─── Cost Records ─────────────────────────────────────────────
    recordCost(record) {
        const costId = (0, crypto_1.randomUUID)();
        const timestamp = new Date().toISOString();
        this.db.prepare(`
      INSERT INTO cost_records (cost_id, session_id, agent_id, timestamp, model, model_tier, input_tokens, output_tokens, thinking_tokens, total_tokens, estimated_cost_usd, routed_by, original_model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(costId, record.sessionId, record.agentId, timestamp, record.model, record.modelTier, record.inputTokens, record.outputTokens, record.thinkingTokens, record.totalTokens, record.estimatedCostUsd, record.routedBy, record.originalModel || null);
        return { costId, timestamp, ...record };
    }
    getSessionCost(sessionId) {
        const row = this.db.prepare(`
      SELECT COALESCE(SUM(total_tokens), 0) as tokens,
             COALESCE(SUM(estimated_cost_usd), 0) as cost_usd,
             COUNT(*) as calls
      FROM cost_records WHERE session_id = ?
    `).get(sessionId);
        return { tokens: row.tokens, costUsd: row.cost_usd, calls: row.calls };
    }
    getAgentDailyCost(agentId, date) {
        const day = date || new Date().toISOString().split('T')[0];
        const row = this.db.prepare(`
      SELECT COALESCE(SUM(total_tokens), 0) as tokens,
             COALESCE(SUM(estimated_cost_usd), 0) as cost_usd,
             COUNT(*) as calls
      FROM cost_records WHERE agent_id = ? AND date(timestamp) = ?
    `).get(agentId, day);
        return { tokens: row.tokens, costUsd: row.cost_usd, calls: row.calls };
    }
    // ─── Budget ───────────────────────────────────────────────────
    setBudget(config) {
        this.db.prepare(`
      INSERT OR REPLACE INTO budget_configs (agent_id, max_per_session, max_per_day, max_per_month, alert_threshold_pct)
      VALUES (?, ?, ?, ?, ?)
    `).run(config.agentId, config.maxPerSession, config.maxPerDay, config.maxPerMonth, config.alertThresholdPct);
    }
    getBudget(agentId) {
        const row = this.db.prepare('SELECT * FROM budget_configs WHERE agent_id = ?').get(agentId);
        if (!row)
            return null;
        return {
            agentId: row.agent_id,
            maxPerSession: row.max_per_session,
            maxPerDay: row.max_per_day,
            maxPerMonth: row.max_per_month,
            alertThresholdPct: row.alert_threshold_pct,
        };
    }
    checkBudgetExceeded(agentId, sessionId) {
        const budget = this.getBudget(agentId);
        if (!budget)
            return { session: false, daily: false, monthly: false };
        const sessionCost = this.getSessionCost(sessionId);
        const dailyCost = this.getAgentDailyCost(agentId);
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const monthlyCost = this.db.prepare(`
      SELECT COALESCE(SUM(estimated_cost_usd), 0) as cost
      FROM cost_records WHERE agent_id = ? AND date(timestamp) >= ?
    `).get(agentId, monthStart);
        return {
            session: sessionCost.costUsd >= budget.maxPerSession,
            daily: dailyCost.costUsd >= budget.maxPerDay,
            monthly: monthlyCost.cost >= budget.maxPerMonth,
        };
    }
    // ─── Memory ───────────────────────────────────────────────────
    createEntity(entity) {
        const entityId = (0, crypto_1.randomUUID)();
        const now = new Date().toISOString();
        this.db.prepare(`
      INSERT INTO memory_entities (entity_id, agent_id, entity_type, name, content, workspace, confidence, created_at, last_accessed_at, access_count, token_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(entityId, entity.agentId, entity.entityType, entity.name, entity.content, entity.workspace, entity.confidence, now, now, entity.tokenCost);
        return { entityId, createdAt: now, lastAccessedAt: now, accessCount: 0, ...entity };
    }
    createRelation(rel) {
        const relationId = (0, crypto_1.randomUUID)();
        const createdAt = new Date().toISOString();
        this.db.prepare(`
      INSERT INTO memory_relations (relation_id, source_entity_id, target_entity_id, relation_type, weight, evidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(relationId, rel.sourceEntityId, rel.targetEntityId, rel.relationType, rel.weight, rel.evidence, createdAt);
        return { relationId, createdAt, ...rel };
    }
    queryMemory(agentId, workspace, tokenBudget) {
        // Token-budgeted recall: returns highest-confidence entities within budget
        const rows = this.db.prepare(`
      SELECT * FROM memory_entities
      WHERE agent_id = ? AND workspace = ?
      ORDER BY confidence DESC, access_count DESC
    `).all(agentId, workspace);
        const results = [];
        let tokensUsed = 0;
        for (const row of rows) {
            if (tokensUsed + row.token_cost > tokenBudget)
                break;
            tokensUsed += row.token_cost;
            // Update access stats
            this.db.prepare(`
        UPDATE memory_entities SET last_accessed_at = datetime('now'), access_count = access_count + 1
        WHERE entity_id = ?
      `).run(row.entity_id);
            results.push(this.mapMemoryEntity(row));
        }
        return results;
    }
    // ─── Skill Trust ──────────────────────────────────────────────
    setSkillTrust(trust) {
        this.db.prepare(`
      INSERT OR REPLACE INTO skill_trust (skill_id, skill_name, publisher, trust_level, certified_at, last_audit_at, threat_history, behavioral_fingerprint)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(trust.skillId, trust.skillName, trust.publisher, trust.trustLevel, trust.certifiedAt, trust.lastAuditAt, trust.threatHistory, trust.behavioralFingerprint);
    }
    getSkillTrust(skillId) {
        const row = this.db.prepare('SELECT * FROM skill_trust WHERE skill_id = ?').get(skillId);
        if (!row)
            return null;
        return {
            skillId: row.skill_id, skillName: row.skill_name, publisher: row.publisher,
            trustLevel: row.trust_level, certifiedAt: row.certified_at, lastAuditAt: row.last_audit_at,
            threatHistory: row.threat_history, behavioralFingerprint: row.behavioral_fingerprint,
        };
    }
    getUntrustedSkills() {
        const rows = this.db.prepare("SELECT * FROM skill_trust WHERE trust_level IN ('unknown', 'untrusted') ORDER BY threat_history DESC").all();
        return rows.map(row => ({
            skillId: row.skill_id, skillName: row.skill_name, publisher: row.publisher,
            trustLevel: row.trust_level, certifiedAt: row.certified_at, lastAuditAt: row.last_audit_at,
            threatHistory: row.threat_history, behavioralFingerprint: row.behavioral_fingerprint,
        }));
    }
    // ─── Dashboard Queries ────────────────────────────────────────
    getSessionSummaries(limit = 50) {
        return this.db.prepare('SELECT * FROM v_session_summary ORDER BY started_at DESC LIMIT ?').all(limit);
    }
    getAgentDailyCosts(agentId, days = 30) {
        return this.db.prepare('SELECT * FROM v_agent_daily_cost WHERE agent_id = ? ORDER BY day DESC LIMIT ?').all(agentId, days);
    }
    // ─── Utilities ────────────────────────────────────────────────
    close() {
        this.db.close();
    }
    getDb() {
        return this.db;
    }
    // ─── Row Mappers ──────────────────────────────────────────────
    mapSession(row) {
        return {
            sessionId: row.session_id,
            agentId: row.agent_id,
            status: row.status,
            startedAt: row.started_at,
            endedAt: row.ended_at,
            parentSessionId: row.parent_session_id,
            pipelineId: row.pipeline_id,
            pipelineStep: row.pipeline_step,
        };
    }
    mapBehaviorEvent(row) {
        return {
            eventId: row.event_id,
            sessionId: row.session_id,
            agentId: row.agent_id,
            eventType: row.event_type,
            timestamp: row.timestamp,
            details: JSON.parse(row.details),
            threatLevel: row.threat_level,
            threatSignature: row.threat_signature,
            blocked: !!row.blocked,
        };
    }
    mapMemoryEntity(row) {
        return {
            entityId: row.entity_id,
            agentId: row.agent_id,
            entityType: row.entity_type,
            name: row.name,
            content: row.content,
            workspace: row.workspace,
            confidence: row.confidence,
            createdAt: row.created_at,
            lastAccessedAt: row.last_accessed_at,
            accessCount: row.access_count,
            tokenCost: row.token_cost,
        };
    }
}
exports.SessionGraph = SessionGraph;
//# sourceMappingURL=index.js.map