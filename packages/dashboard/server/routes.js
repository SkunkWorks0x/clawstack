/**
 * Dashboard API Routes
 *
 * Wraps SessionGraph methods as REST endpoints.
 * SSE endpoint for real-time EventBus forwarding.
 */
import { Router } from 'express';
export function createRoutes(graph, bus) {
    const router = Router();
    // ─── Overview ────────────────────────────────────────────────────
    router.get('/overview', (_req, res) => {
        const db = graph.getDb();
        const today = new Date().toISOString().split('T')[0];
        const agentCount = db.prepare('SELECT COUNT(*) as c FROM agents').get().c;
        const activeSessions = db.prepare("SELECT COUNT(*) as c FROM sessions WHERE status = 'active'").get().c;
        const threatsBlocked = db.prepare("SELECT COUNT(*) as c FROM behavior_events WHERE blocked = 1 AND date(timestamp) = ?").get(today).c;
        const costToday = db.prepare('SELECT COALESCE(SUM(estimated_cost_usd), 0) as total FROM cost_records WHERE date(timestamp) = ?').get(today).total;
        const routerSavings = db.prepare(`SELECT COALESCE(SUM(estimated_cost_usd), 0) as saved FROM cost_records
       WHERE routed_by = 'smart_router' AND original_model IS NOT NULL AND date(timestamp) = ?`).get(today).saved;
        const memoryEntities = db.prepare('SELECT COUNT(*) as c FROM memory_entities').get().c;
        const activePipelines = db.prepare("SELECT COUNT(*) as c FROM pipelines WHERE status IN ('pending', 'running')").get().c;
        res.json({
            totalAgents: agentCount,
            activeSessions,
            threatsBlockedToday: threatsBlocked,
            moneySpentToday: costToday,
            moneySavedByRouter: routerSavings,
            memoryEntities,
            activePipelines,
        });
    });
    // ─── Agents ──────────────────────────────────────────────────────
    router.get('/agents', (_req, res) => {
        res.json(graph.listAgents());
    });
    router.get('/sessions/active', (_req, res) => {
        const agentId = _req.query.agentId;
        res.json(graph.getActiveSessions(agentId));
    });
    // ─── Security (ClawGuard) ───────────────────────────────────────
    router.get('/threats', (req, res) => {
        const minLevel = req.query.minLevel || 'low';
        const sessionId = req.query.sessionId;
        res.json(graph.getThreats(sessionId, minLevel));
    });
    router.get('/threats/blocked', (_req, res) => {
        const db = graph.getDb();
        const rows = db.prepare(`SELECT be.*, s.agent_id, a.name as agent_name
       FROM behavior_events be
       JOIN sessions s ON be.session_id = s.session_id
       JOIN agents a ON s.agent_id = a.agent_id
       WHERE be.blocked = 1
       ORDER BY be.timestamp DESC
       LIMIT 100`).all();
        res.json(rows);
    });
    router.get('/skills', (_req, res) => {
        const db = graph.getDb();
        const rows = db.prepare('SELECT * FROM skill_trust ORDER BY trust_level, skill_name').all();
        res.json(rows);
    });
    // ─── Cost (ClawBudget) ──────────────────────────────────────────
    router.get('/costs/daily', (req, res) => {
        const days = parseInt(req.query.days) || 30;
        const db = graph.getDb();
        const rows = db.prepare(`SELECT date(timestamp) as day,
              SUM(total_tokens) as tokens,
              SUM(estimated_cost_usd) as cost_usd,
              COUNT(*) as api_calls,
              SUM(CASE WHEN routed_by = 'smart_router' THEN 1 ELSE 0 END) as routed_calls
       FROM cost_records
       WHERE date(timestamp) >= date('now', ?)
       GROUP BY date(timestamp)
       ORDER BY day ASC`).all(`-${days} days`);
        res.json(rows);
    });
    router.get('/costs/today', (_req, res) => {
        const db = graph.getDb();
        const today = new Date().toISOString().split('T')[0];
        const row = db.prepare(`SELECT COALESCE(SUM(estimated_cost_usd), 0) as total,
              COALESCE(SUM(total_tokens), 0) as tokens,
              COUNT(*) as calls
       FROM cost_records WHERE date(timestamp) = ?`).get(today);
        res.json(row);
    });
    router.get('/budgets', (_req, res) => {
        const db = graph.getDb();
        const today = new Date().toISOString().split('T')[0];
        const agents = graph.listAgents();
        const budgets = agents.map(agent => {
            const budget = graph.getBudget(agent.agentId);
            const dailyCost = graph.getAgentDailyCost(agent.agentId, today);
            return {
                agentId: agent.agentId,
                agentName: agent.name,
                budget,
                dailyCost: dailyCost.costUsd,
                dailyTokens: dailyCost.tokens,
                dailyCalls: dailyCost.calls,
                pctUsed: budget ? (dailyCost.costUsd / budget.maxPerDay) * 100 : 0,
            };
        });
        res.json(budgets);
    });
    router.get('/costs/router-stats', (_req, res) => {
        const db = graph.getDb();
        const stats = db.prepare(`SELECT
         COUNT(*) as total_requests,
         SUM(CASE WHEN routed_by = 'smart_router' THEN 1 ELSE 0 END) as routed_requests,
         SUM(CASE WHEN routed_by = 'smart_router' THEN estimated_cost_usd ELSE 0 END) as routed_cost,
         SUM(CASE WHEN routed_by = 'user' THEN estimated_cost_usd ELSE 0 END) as direct_cost,
         SUM(estimated_cost_usd) as total_cost
       FROM cost_records`).get();
        res.json(stats);
    });
    router.get('/costs/surgery', (_req, res) => {
        const db = graph.getDb();
        // Find sessions with high token counts (potential bloated contexts)
        const rows = db.prepare(`SELECT s.session_id, s.agent_id, a.name as agent_name, s.status,
              SUM(cr.total_tokens) as total_tokens,
              SUM(cr.estimated_cost_usd) as total_cost,
              COUNT(cr.cost_id) as call_count
       FROM sessions s
       JOIN agents a ON s.agent_id = a.agent_id
       JOIN cost_records cr ON s.session_id = cr.session_id
       GROUP BY s.session_id
       HAVING total_tokens > 100000
       ORDER BY total_tokens DESC
       LIMIT 20`).all();
        res.json(rows);
    });
    // ─── Memory (ClawMemory) ────────────────────────────────────────
    router.get('/memory/entities', (req, res) => {
        const db = graph.getDb();
        const { type, workspace, search } = req.query;
        let query = 'SELECT * FROM memory_entities WHERE 1=1';
        const params = [];
        if (type) {
            query += ' AND entity_type = ?';
            params.push(type);
        }
        if (workspace) {
            query += ' AND workspace = ?';
            params.push(workspace);
        }
        if (search) {
            query += ' AND (name LIKE ? OR content LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        query += ' ORDER BY last_accessed_at DESC LIMIT 200';
        const rows = db.prepare(query).all(...params);
        res.json(rows.map((row) => ({
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
        })));
    });
    router.get('/memory/graph', (req, res) => {
        const db = graph.getDb();
        const entityId = req.query.entityId;
        const hops = parseInt(req.query.hops) || 2;
        if (!entityId) {
            // Return all entities and relations for full graph view
            const entities = db.prepare('SELECT * FROM memory_entities LIMIT 200').all();
            const relations = db.prepare('SELECT * FROM memory_relations LIMIT 500').all();
            res.json({
                nodes: entities.map((e) => ({
                    id: e.entity_id,
                    name: e.name,
                    type: e.entity_type,
                    workspace: e.workspace,
                })),
                edges: relations.map((r) => ({
                    source: r.source_entity_id,
                    target: r.target_entity_id,
                    type: r.relation_type,
                    weight: r.weight,
                })),
            });
            return;
        }
        // BFS traversal from entityId
        const visited = new Set();
        const queue = [{ id: entityId, depth: 0 }];
        const nodeIds = new Set();
        const edgeList = [];
        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current.id))
                continue;
            visited.add(current.id);
            nodeIds.add(current.id);
            if (current.depth >= hops)
                continue;
            const outgoing = db.prepare('SELECT * FROM memory_relations WHERE source_entity_id = ?').all(current.id);
            const incoming = db.prepare('SELECT * FROM memory_relations WHERE target_entity_id = ?').all(current.id);
            for (const rel of [...outgoing, ...incoming]) {
                edgeList.push({
                    source: rel.source_entity_id,
                    target: rel.target_entity_id,
                    type: rel.relation_type,
                    weight: rel.weight,
                });
                const neighborId = rel.source_entity_id === current.id
                    ? rel.target_entity_id
                    : rel.source_entity_id;
                if (!visited.has(neighborId)) {
                    queue.push({ id: neighborId, depth: current.depth + 1 });
                    nodeIds.add(neighborId);
                }
            }
        }
        // Fetch node details
        const nodes = [];
        for (const nid of nodeIds) {
            const entity = db.prepare('SELECT * FROM memory_entities WHERE entity_id = ?').get(nid);
            if (entity) {
                nodes.push({
                    id: entity.entity_id,
                    name: entity.name,
                    type: entity.entity_type,
                    workspace: entity.workspace,
                });
            }
        }
        res.json({ nodes, edges: edgeList });
    });
    router.get('/memory/recall', (req, res) => {
        const agentId = req.query.agentId;
        const workspace = req.query.workspace || 'default';
        const tokenBudget = parseInt(req.query.tokenBudget) || 2000;
        if (!agentId) {
            res.status(400).json({ error: 'agentId is required' });
            return;
        }
        const entities = graph.queryMemory(agentId, workspace, tokenBudget);
        const totalTokens = entities.reduce((sum, e) => sum + e.tokenCost, 0);
        res.json({
            entities,
            totalTokens,
            tokenBudget,
            entitiesReturned: entities.length,
        });
    });
    // ─── Pipelines (ClawPipe) ──────────────────────────────────────
    router.get('/pipelines', (_req, res) => {
        const db = graph.getDb();
        const rows = db.prepare('SELECT * FROM pipelines ORDER BY created_at DESC LIMIT 50').all();
        res.json(rows.map((row) => ({
            pipelineId: row.pipeline_id,
            name: row.name,
            status: row.status,
            createdAt: row.created_at,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            totalSteps: row.total_steps,
            completedSteps: row.completed_steps,
            totalCostUsd: row.total_cost_usd,
        })));
    });
    router.get('/pipelines/:id', (req, res) => {
        const db = graph.getDb();
        const pipeline = db.prepare('SELECT * FROM pipelines WHERE pipeline_id = ?').get(req.params.id);
        if (!pipeline) {
            res.status(404).json({ error: 'Pipeline not found' });
            return;
        }
        const steps = db.prepare('SELECT * FROM pipeline_steps WHERE pipeline_id = ? ORDER BY step_number').all(req.params.id);
        res.json({
            pipeline: {
                pipelineId: pipeline.pipeline_id,
                name: pipeline.name,
                definitionYaml: pipeline.definition_yaml,
                status: pipeline.status,
                createdAt: pipeline.created_at,
                startedAt: pipeline.started_at,
                completedAt: pipeline.completed_at,
                totalSteps: pipeline.total_steps,
                completedSteps: pipeline.completed_steps,
                totalCostUsd: pipeline.total_cost_usd,
            },
            steps: steps.map((s) => ({
                stepId: s.step_id,
                pipelineId: s.pipeline_id,
                stepNumber: s.step_number,
                name: s.name,
                agentId: s.agent_id,
                sessionId: s.session_id,
                status: s.status,
                result: s.result ? JSON.parse(s.result) : null,
                costUsd: s.cost_usd,
            })),
        });
    });
    // ─── Setup (ClawForge) ─────────────────────────────────────────
    router.get('/setup/agents', (_req, res) => {
        const db = graph.getDb();
        const agents = graph.listAgents();
        const result = agents.map(agent => {
            const sessions = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as active FROM sessions WHERE agent_id = ?').get('active', agent.agentId);
            return {
                ...agent,
                totalSessions: sessions.total,
                activeSessions: sessions.active,
            };
        });
        res.json(result);
    });
    // ─── SSE Stream ────────────────────────────────────────────────
    router.get('/events/stream', (req, res) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        });
        res.write('data: {"type":"connected"}\n\n');
        const unsubscribe = bus.on('*', (event) => {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        });
        req.on('close', () => {
            unsubscribe();
        });
    });
    return router;
}
//# sourceMappingURL=routes.js.map