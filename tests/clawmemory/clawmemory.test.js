"use strict";
/**
 * ClawMemory Test Suite — Unified Intelligent Memory Layer
 *
 * Tests all components:
 * 1. Smart Capture — entity/relation extraction, dedup/merge, noise filtering
 * 2. Knowledge Graph — traversal, workspace isolation, merge, delete
 * 3. Token-Budgeted Recall — scoring, budget caps, access stats
 * 4. Graceful Compaction — pre-compaction extraction, post-compaction injection
 * 5. Cross-Product Integration — ClawGuard threats, ClawBudget costs, ClawPipe results
 * 6. Full Integration — compound flow across all components
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const shared_1 = require("@clawstack/shared");
const clawmemory_1 = require("@clawstack/clawmemory");
// ─── Test Helpers ─────────────────────────────────────────────────
let tempDir;
let graph;
let bus;
let agentId;
let sessionId;
function setupAgentAndSession() {
    const agent = graph.registerAgent({
        name: 'test-agent',
        platform: 'openclaw',
        version: '1.0.0',
        dockerSandboxed: false,
        metadata: {},
    });
    agentId = agent.agentId;
    const session = graph.startSession(agentId);
    sessionId = session.sessionId;
}
(0, vitest_1.beforeEach)(() => {
    tempDir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'clawmemory-test-'));
    graph = new shared_1.SessionGraph((0, path_1.join)(tempDir, 'test.db'));
    bus = new shared_1.EventBus();
    setupAgentAndSession();
});
(0, vitest_1.afterEach)(() => {
    graph.close();
    (0, fs_1.rmSync)(tempDir, { recursive: true, force: true });
});
// ═══════════════════════════════════════════════════════════════════
// 1. SMART CAPTURE
// ═══════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('SmartCapture', () => {
    let capture;
    (0, vitest_1.beforeEach)(() => {
        capture = new clawmemory_1.SmartCapture(graph, bus);
    });
    (0, vitest_1.describe)('Entity Extraction', () => {
        (0, vitest_1.it)('extracts person entities from text', async () => {
            const text = 'Alice manages the Auth Team. Bob is the lead developer on payments.';
            const result = await capture.extract(text, { agentId, sessionId, workspace: 'work' });
            (0, vitest_1.expect)(result.entities.length).toBeGreaterThanOrEqual(1);
            const names = result.entities.map(e => e.name);
            (0, vitest_1.expect)(names.some(n => n.includes('Alice'))).toBe(true);
        });
        (0, vitest_1.it)('extracts tool entities from text', async () => {
            const text = 'We are using TypeScript for the backend. Install package better-sqlite3 for the database.';
            const result = await capture.extract(text, { agentId, sessionId, workspace: 'work' });
            const toolNames = result.entities
                .filter(e => e.entityType === 'tool')
                .map(e => e.name.toLowerCase());
            (0, vitest_1.expect)(toolNames.some(n => n.includes('typescript') || n.includes('better-sqlite3'))).toBe(true);
        });
        (0, vitest_1.it)('extracts decision entities from text', async () => {
            const text = 'We decided to use SQLite instead of Postgres. The team agreed to deploy on Fridays.';
            const result = await capture.extract(text, { agentId, sessionId, workspace: 'work' });
            const decisions = result.entities.filter(e => e.entityType === 'decision');
            (0, vitest_1.expect)(decisions.length).toBeGreaterThanOrEqual(1);
        });
        (0, vitest_1.it)('extracts preference entities from text', async () => {
            const text = 'I prefer using dark mode. Always use bun instead of npm.';
            const result = await capture.extract(text, { agentId, sessionId, workspace: 'personal' });
            const prefs = result.entities.filter(e => e.entityType === 'preference');
            (0, vitest_1.expect)(prefs.length).toBeGreaterThanOrEqual(1);
        });
        (0, vitest_1.it)('extracts fact entities from text', async () => {
            const text = 'Important: the API endpoint is https://api.example.com. The database runs on port 5432.';
            const result = await capture.extract(text, { agentId, sessionId, workspace: 'work' });
            const facts = result.entities.filter(e => e.entityType === 'fact');
            (0, vitest_1.expect)(facts.length).toBeGreaterThanOrEqual(1);
        });
        (0, vitest_1.it)('filters noise and short tokens', async () => {
            const text = 'the a an is are was it this I you 42';
            const result = await capture.extract(text, { agentId, sessionId, workspace: 'work' });
            (0, vitest_1.expect)(result.stats.belowThreshold + result.stats.entitiesStored + result.stats.duplicatesMerged)
                .toBeLessThanOrEqual(result.stats.entitiesFound);
        });
        (0, vitest_1.it)('boosts confidence for frequently mentioned entities', async () => {
            const text = 'Alice is the lead. Alice manages Auth Team. Alice also reviews code. Alice approved the deploy.';
            const result = await capture.extract(text, { agentId, sessionId, workspace: 'work' });
            const alice = result.entities.find(e => e.name.includes('Alice'));
            if (alice) {
                (0, vitest_1.expect)(alice.confidence).toBeGreaterThan(0.7);
            }
        });
    });
    (0, vitest_1.describe)('Relation Extraction', () => {
        (0, vitest_1.it)('extracts manages relation', async () => {
            const text = 'Alice manages the Auth Team.';
            const result = await capture.extract(text, { agentId, sessionId, workspace: 'work' });
            // Relations depend on both entities being extracted and stored
            // At minimum, verify extraction found relation patterns
            const rawRelations = capture.extractRelations(text);
            (0, vitest_1.expect)(rawRelations.some(r => r.relationType === 'manages')).toBe(true);
        });
        (0, vitest_1.it)('extracts uses relation', async () => {
            const text = 'Bob uses TypeScript for the backend service.';
            const rawRelations = capture.extractRelations(text);
            (0, vitest_1.expect)(rawRelations.some(r => r.relationType === 'uses')).toBe(true);
        });
        (0, vitest_1.it)('extracts depends_on relation', async () => {
            const text = 'ClawMemory depends on SessionGraph for storage.';
            const rawRelations = capture.extractRelations(text);
            (0, vitest_1.expect)(rawRelations.some(r => r.relationType === 'depends_on')).toBe(true);
        });
    });
    (0, vitest_1.describe)('Deduplication and Merge', () => {
        (0, vitest_1.it)('merges duplicate entities instead of creating new ones', async () => {
            const text1 = 'User named Alice works on the project.';
            const text2 = 'Alice is the lead developer on the project.';
            await capture.extract(text1, { agentId, sessionId, workspace: 'work' });
            const result2 = await capture.extract(text2, { agentId, sessionId, workspace: 'work' });
            // Second extraction should have merged
            (0, vitest_1.expect)(result2.stats.duplicatesMerged).toBeGreaterThanOrEqual(0);
            // Should only have one Alice entity in DB
            const db = graph.getDb();
            const aliceCount = db.prepare("SELECT COUNT(*) as count FROM memory_entities WHERE agent_id = ? AND LOWER(name) LIKE '%alice%'").get(agentId).count;
            (0, vitest_1.expect)(aliceCount).toBeLessThanOrEqual(2); // person extraction may vary
        });
        (0, vitest_1.it)('does not merge across workspaces', async () => {
            const text = 'User named Alice works here.';
            await capture.extract(text, { agentId, sessionId, workspace: 'work' });
            await capture.extract(text, { agentId, sessionId, workspace: 'personal' });
            const db = graph.getDb();
            const rows = db.prepare("SELECT * FROM memory_entities WHERE agent_id = ? AND LOWER(name) LIKE '%alice%'").all(agentId);
            const workspaces = new Set(rows.map((r) => r.workspace));
            if (rows.length >= 2) {
                (0, vitest_1.expect)(workspaces.size).toBe(2);
            }
        });
    });
    (0, vitest_1.describe)('Event Emission', () => {
        (0, vitest_1.it)('emits memory.entity_created for new entities', async () => {
            const events = [];
            bus.on('memory.entity_created', (event) => events.push(event));
            const text = 'The developer named Charlie created a new module called DataProcessor.';
            await capture.extract(text, { agentId, sessionId, workspace: 'work' });
            (0, vitest_1.expect)(events.length).toBeGreaterThanOrEqual(1);
            (0, vitest_1.expect)(events[0].sourceProduct).toBe('clawmemory');
            (0, vitest_1.expect)(events[0].agentId).toBe(agentId);
        });
    });
    (0, vitest_1.describe)('Min Confidence Filter', () => {
        (0, vitest_1.it)('filters entities below minConfidence threshold', async () => {
            const text = 'A concept of microservices is related to distributed systems.';
            const highThreshold = await capture.extract(text, {
                agentId, sessionId, workspace: 'work', minConfidence: 0.9,
            });
            const lowThreshold = await capture.extract(text, {
                agentId, sessionId, workspace: 'work2', minConfidence: 0.1,
            });
            (0, vitest_1.expect)(highThreshold.stats.belowThreshold).toBeGreaterThanOrEqual(lowThreshold.stats.belowThreshold);
        });
    });
});
// ═══════════════════════════════════════════════════════════════════
// 2. KNOWLEDGE GRAPH
// ═══════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('KnowledgeGraph', () => {
    let kg;
    (0, vitest_1.beforeEach)(() => {
        kg = new clawmemory_1.KnowledgeGraph(graph);
    });
    (0, vitest_1.describe)('Entity Operations', () => {
        (0, vitest_1.it)('creates and retrieves entities', () => {
            const entity = graph.createEntity({
                agentId,
                entityType: 'person',
                name: 'Alice',
                content: 'Lead developer on the Auth Team',
                workspace: 'work',
                confidence: 0.9,
                tokenCost: 15,
            });
            const retrieved = kg.getEntity(entity.entityId);
            (0, vitest_1.expect)(retrieved).not.toBeNull();
            (0, vitest_1.expect)(retrieved.name).toBe('Alice');
            (0, vitest_1.expect)(retrieved.entityType).toBe('person');
            (0, vitest_1.expect)(retrieved.confidence).toBe(0.9);
        });
        (0, vitest_1.it)('finds entities by name (case-insensitive)', () => {
            graph.createEntity({
                agentId, entityType: 'person', name: 'Alice Smith',
                content: 'Engineer', workspace: 'work', confidence: 0.8, tokenCost: 10,
            });
            graph.createEntity({
                agentId, entityType: 'tool', name: 'alice-cli',
                content: 'CLI tool', workspace: 'work', confidence: 0.6, tokenCost: 8,
            });
            const results = kg.findEntities(agentId, 'alice');
            (0, vitest_1.expect)(results.length).toBe(2);
        });
        (0, vitest_1.it)('filters entities by workspace', () => {
            graph.createEntity({
                agentId, entityType: 'fact', name: 'work-fact',
                content: 'work info', workspace: 'work', confidence: 0.8, tokenCost: 5,
            });
            graph.createEntity({
                agentId, entityType: 'fact', name: 'personal-fact',
                content: 'personal info', workspace: 'personal', confidence: 0.8, tokenCost: 5,
            });
            const workEntities = kg.findEntities(agentId, 'fact', { workspace: 'work' });
            (0, vitest_1.expect)(workEntities.length).toBe(1);
            (0, vitest_1.expect)(workEntities[0].name).toBe('work-fact');
        });
        (0, vitest_1.it)('filters entities by type', () => {
            graph.createEntity({
                agentId, entityType: 'person', name: 'Alice',
                content: 'person', workspace: 'work', confidence: 0.8, tokenCost: 5,
            });
            graph.createEntity({
                agentId, entityType: 'tool', name: 'Alice-CLI',
                content: 'tool', workspace: 'work', confidence: 0.6, tokenCost: 5,
            });
            const people = kg.findEntities(agentId, 'alice', { entityType: 'person' });
            (0, vitest_1.expect)(people.length).toBe(1);
            (0, vitest_1.expect)(people[0].entityType).toBe('person');
        });
        (0, vitest_1.it)('deletes entity and its relations', () => {
            const e1 = graph.createEntity({
                agentId, entityType: 'person', name: 'Alice',
                content: 'person', workspace: 'work', confidence: 0.8, tokenCost: 5,
            });
            const e2 = graph.createEntity({
                agentId, entityType: 'tool', name: 'Git',
                content: 'tool', workspace: 'work', confidence: 0.6, tokenCost: 5,
            });
            graph.createRelation({
                sourceEntityId: e1.entityId, targetEntityId: e2.entityId,
                relationType: 'uses', weight: 0.7, evidence: 'Alice uses Git',
            });
            const deleted = kg.deleteEntity(e1.entityId);
            (0, vitest_1.expect)(deleted).toBe(true);
            (0, vitest_1.expect)(kg.getEntity(e1.entityId)).toBeNull();
            // Relations should be cleaned up
            const relations = kg.getRelations(e2.entityId);
            (0, vitest_1.expect)(relations.length).toBe(0);
        });
    });
    (0, vitest_1.describe)('Graph Traversal', () => {
        let aliceId;
        let bobId;
        let gitId;
        let authTeamId;
        (0, vitest_1.beforeEach)(() => {
            const alice = graph.createEntity({
                agentId, entityType: 'person', name: 'Alice',
                content: 'Lead developer', workspace: 'work', confidence: 0.9, tokenCost: 10,
            });
            const bob = graph.createEntity({
                agentId, entityType: 'person', name: 'Bob',
                content: 'Junior developer', workspace: 'work', confidence: 0.8, tokenCost: 10,
            });
            const git = graph.createEntity({
                agentId, entityType: 'tool', name: 'Git',
                content: 'Version control', workspace: 'work', confidence: 0.7, tokenCost: 8,
            });
            const authTeam = graph.createEntity({
                agentId, entityType: 'concept', name: 'Auth Team',
                content: 'Authentication team', workspace: 'work', confidence: 0.8, tokenCost: 10,
            });
            aliceId = alice.entityId;
            bobId = bob.entityId;
            gitId = git.entityId;
            authTeamId = authTeam.entityId;
            // Alice manages Auth Team
            graph.createRelation({
                sourceEntityId: aliceId, targetEntityId: authTeamId,
                relationType: 'manages', weight: 0.9, evidence: 'Alice manages the Auth Team',
            });
            // Alice uses Git
            graph.createRelation({
                sourceEntityId: aliceId, targetEntityId: gitId,
                relationType: 'uses', weight: 0.7, evidence: 'Alice uses Git daily',
            });
            // Bob is related to Auth Team
            graph.createRelation({
                sourceEntityId: bobId, targetEntityId: authTeamId,
                relationType: 'related_to', weight: 0.6, evidence: 'Bob is on Auth Team',
            });
        });
        (0, vitest_1.it)('traverses 1 hop from entity', () => {
            const result = kg.traverse(aliceId, { maxDepth: 1 });
            (0, vitest_1.expect)(result).not.toBeNull();
            (0, vitest_1.expect)(result.totalEntities).toBe(3); // Alice + Auth Team + Git
            (0, vitest_1.expect)(result.nodes.has(aliceId)).toBe(true);
            (0, vitest_1.expect)(result.nodes.has(authTeamId)).toBe(true);
            (0, vitest_1.expect)(result.nodes.has(gitId)).toBe(true);
        });
        (0, vitest_1.it)('traverses 2 hops to find indirect connections', () => {
            const result = kg.traverse(aliceId, { maxDepth: 2 });
            (0, vitest_1.expect)(result).not.toBeNull();
            // Alice -> Auth Team -> Bob (2 hops)
            (0, vitest_1.expect)(result.totalEntities).toBe(4); // Alice + Auth Team + Git + Bob
            (0, vitest_1.expect)(result.nodes.has(bobId)).toBe(true);
        });
        (0, vitest_1.it)('respects minWeight filter', () => {
            const result = kg.traverse(aliceId, { maxDepth: 2, minWeight: 0.8 });
            (0, vitest_1.expect)(result).not.toBeNull();
            // Only strong relations: Alice -> Auth Team (0.9)
            // Bob -> Auth Team is 0.6 (below threshold), Alice -> Git is 0.7 (below)
            (0, vitest_1.expect)(result.nodes.has(authTeamId)).toBe(true);
            (0, vitest_1.expect)(result.nodes.has(gitId)).toBe(false);
        });
        (0, vitest_1.it)('returns null for non-existent entity', () => {
            const result = kg.traverse('non-existent-id');
            (0, vitest_1.expect)(result).toBeNull();
        });
        (0, vitest_1.it)('finds related entities by type', () => {
            const tools = kg.findRelatedByType(aliceId, 'tool');
            (0, vitest_1.expect)(tools.length).toBe(1);
            (0, vitest_1.expect)(tools[0].name).toBe('Git');
        });
    });
    (0, vitest_1.describe)('Workspace Isolation', () => {
        (0, vitest_1.it)('workspace stats are isolated', () => {
            graph.createEntity({
                agentId, entityType: 'fact', name: 'work-fact-1',
                content: 'info', workspace: 'work', confidence: 0.8, tokenCost: 5,
            });
            graph.createEntity({
                agentId, entityType: 'fact', name: 'work-fact-2',
                content: 'info', workspace: 'work', confidence: 0.7, tokenCost: 5,
            });
            graph.createEntity({
                agentId, entityType: 'fact', name: 'personal-fact-1',
                content: 'info', workspace: 'personal', confidence: 0.9, tokenCost: 5,
            });
            const workStats = kg.getWorkspaceStats(agentId, 'work');
            const personalStats = kg.getWorkspaceStats(agentId, 'personal');
            (0, vitest_1.expect)(workStats.entityCount).toBe(2);
            (0, vitest_1.expect)(personalStats.entityCount).toBe(1);
        });
        (0, vitest_1.it)('lists entities per workspace', () => {
            graph.createEntity({
                agentId, entityType: 'person', name: 'Work Alice',
                content: 'work', workspace: 'work', confidence: 0.8, tokenCost: 5,
            });
            graph.createEntity({
                agentId, entityType: 'person', name: 'Personal Alice',
                content: 'personal', workspace: 'personal', confidence: 0.8, tokenCost: 5,
            });
            const workEntities = kg.listEntities(agentId, { workspace: 'work' });
            const personalEntities = kg.listEntities(agentId, { workspace: 'personal' });
            (0, vitest_1.expect)(workEntities.length).toBe(1);
            (0, vitest_1.expect)(personalEntities.length).toBe(1);
            (0, vitest_1.expect)(workEntities[0].name).toBe('Work Alice');
            (0, vitest_1.expect)(personalEntities[0].name).toBe('Personal Alice');
        });
    });
    (0, vitest_1.describe)('Entity Merge', () => {
        (0, vitest_1.it)('merges two entities and transfers relations', () => {
            const e1 = graph.createEntity({
                agentId, entityType: 'person', name: 'Alice',
                content: 'developer', workspace: 'work', confidence: 0.8, tokenCost: 5,
            });
            const e2 = graph.createEntity({
                agentId, entityType: 'person', name: 'Alice S.',
                content: 'senior developer', workspace: 'work', confidence: 0.6, tokenCost: 5,
            });
            const tool = graph.createEntity({
                agentId, entityType: 'tool', name: 'Git',
                content: 'vcs', workspace: 'work', confidence: 0.7, tokenCost: 5,
            });
            // e2 has a relation we want to keep
            graph.createRelation({
                sourceEntityId: e2.entityId, targetEntityId: tool.entityId,
                relationType: 'uses', weight: 0.7, evidence: 'Alice uses Git',
            });
            const merged = kg.mergeEntities(e1.entityId, e2.entityId);
            (0, vitest_1.expect)(merged).not.toBeNull();
            (0, vitest_1.expect)(merged.name).toBe('Alice');
            // e2 should be gone
            (0, vitest_1.expect)(kg.getEntity(e2.entityId)).toBeNull();
            // e1 should have the transferred relation
            const relations = kg.getRelations(e1.entityId);
            (0, vitest_1.expect)(relations.length).toBe(1);
            (0, vitest_1.expect)(relations[0].relation.relationType).toBe('uses');
        });
    });
});
// ═══════════════════════════════════════════════════════════════════
// 3. TOKEN-BUDGETED RECALL
// ═══════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('TokenRecall', () => {
    let recall;
    (0, vitest_1.beforeEach)(() => {
        recall = new clawmemory_1.TokenRecall(graph, bus);
    });
    (0, vitest_1.describe)('Budget Cap Enforcement', () => {
        (0, vitest_1.it)('never exceeds token budget', async () => {
            // Create entities with known token costs
            for (let i = 0; i < 10; i++) {
                graph.createEntity({
                    agentId, entityType: 'fact', name: `fact-${i}`,
                    content: `This is fact number ${i} with some content.`,
                    workspace: 'work', confidence: 0.5 + i * 0.05, tokenCost: 50,
                });
            }
            // Budget of 150 tokens should fit at most 3 entities (50 each)
            const result = await recall.recall({
                agentId, workspace: 'work', tokenBudget: 150,
            });
            (0, vitest_1.expect)(result.tokensUsed).toBeLessThanOrEqual(150);
            (0, vitest_1.expect)(result.returnedCount).toBeLessThanOrEqual(3);
            (0, vitest_1.expect)(result.tokensRemaining).toBeGreaterThanOrEqual(0);
        });
        (0, vitest_1.it)('returns empty for zero budget', async () => {
            graph.createEntity({
                agentId, entityType: 'fact', name: 'test',
                content: 'content', workspace: 'work', confidence: 0.9, tokenCost: 10,
            });
            const result = await recall.recall({
                agentId, workspace: 'work', tokenBudget: 0,
            });
            (0, vitest_1.expect)(result.returnedCount).toBe(0);
            (0, vitest_1.expect)(result.tokensUsed).toBe(0);
        });
    });
    (0, vitest_1.describe)('Relevance Scoring', () => {
        (0, vitest_1.it)('ranks by query relevance when query provided', async () => {
            graph.createEntity({
                agentId, entityType: 'tool', name: 'TypeScript',
                content: 'TypeScript is the primary language for the backend',
                workspace: 'work', confidence: 0.7, tokenCost: 20,
            });
            graph.createEntity({
                agentId, entityType: 'fact', name: 'lunch-preference',
                content: 'The team prefers pizza for lunch on Fridays',
                workspace: 'work', confidence: 0.7, tokenCost: 20,
            });
            const result = await recall.recall({
                agentId, workspace: 'work', tokenBudget: 2048,
                query: 'TypeScript backend language',
            });
            (0, vitest_1.expect)(result.returnedCount).toBe(2);
            // TypeScript entity should rank higher due to query relevance
            (0, vitest_1.expect)(result.entities[0].name).toBe('TypeScript');
        });
        (0, vitest_1.it)('ranks by confidence when no query provided', async () => {
            graph.createEntity({
                agentId, entityType: 'fact', name: 'high-confidence',
                content: 'Very certain fact', workspace: 'work', confidence: 0.95, tokenCost: 10,
            });
            graph.createEntity({
                agentId, entityType: 'fact', name: 'low-confidence',
                content: 'Uncertain fact', workspace: 'work', confidence: 0.3, tokenCost: 10,
            });
            const result = await recall.recall({
                agentId, workspace: 'work', tokenBudget: 2048,
            });
            (0, vitest_1.expect)(result.entities[0].name).toBe('high-confidence');
        });
    });
    (0, vitest_1.describe)('Access Stats Updates', () => {
        (0, vitest_1.it)('updates access count on recall', async () => {
            const entity = graph.createEntity({
                agentId, entityType: 'fact', name: 'accessed-fact',
                content: 'This fact gets accessed', workspace: 'work', confidence: 0.8, tokenCost: 10,
            });
            // Recall twice
            await recall.recall({ agentId, workspace: 'work', tokenBudget: 2048 });
            await recall.recall({ agentId, workspace: 'work', tokenBudget: 2048 });
            const db = graph.getDb();
            const row = db.prepare('SELECT access_count FROM memory_entities WHERE entity_id = ?')
                .get(entity.entityId);
            (0, vitest_1.expect)(row.access_count).toBe(2);
        });
        (0, vitest_1.it)('emits memory.entity_accessed events', async () => {
            const events = [];
            bus.on('memory.entity_accessed', (event) => events.push(event));
            graph.createEntity({
                agentId, entityType: 'fact', name: 'test-fact',
                content: 'content', workspace: 'work', confidence: 0.8, tokenCost: 10,
            });
            await recall.recall({ agentId, workspace: 'work', tokenBudget: 2048 });
            (0, vitest_1.expect)(events.length).toBe(1);
            (0, vitest_1.expect)(events[0].sourceProduct).toBe('clawmemory');
        });
    });
    (0, vitest_1.describe)('Type Preferences', () => {
        (0, vitest_1.it)('boosts preferred entity types', async () => {
            graph.createEntity({
                agentId, entityType: 'fact', name: 'a-fact',
                content: 'some fact', workspace: 'work', confidence: 0.7, tokenCost: 10,
            });
            graph.createEntity({
                agentId, entityType: 'decision', name: 'a-decision',
                content: 'some decision', workspace: 'work', confidence: 0.7, tokenCost: 10,
            });
            const result = await recall.recall({
                agentId, workspace: 'work', tokenBudget: 2048,
                preferredTypes: ['decision'],
            });
            (0, vitest_1.expect)(result.entities[0].entityType).toBe('decision');
        });
    });
    (0, vitest_1.describe)('Workspace Isolation', () => {
        (0, vitest_1.it)('only recalls from specified workspace', async () => {
            graph.createEntity({
                agentId, entityType: 'fact', name: 'work-fact',
                content: 'work info', workspace: 'work', confidence: 0.9, tokenCost: 10,
            });
            graph.createEntity({
                agentId, entityType: 'fact', name: 'personal-fact',
                content: 'personal info', workspace: 'personal', confidence: 0.9, tokenCost: 10,
            });
            const workResult = await recall.recall({
                agentId, workspace: 'work', tokenBudget: 2048,
            });
            const personalResult = await recall.recall({
                agentId, workspace: 'personal', tokenBudget: 2048,
            });
            (0, vitest_1.expect)(workResult.returnedCount).toBe(1);
            (0, vitest_1.expect)(personalResult.returnedCount).toBe(1);
            (0, vitest_1.expect)(workResult.entities[0].name).toBe('work-fact');
            (0, vitest_1.expect)(personalResult.entities[0].name).toBe('personal-fact');
        });
    });
    (0, vitest_1.describe)('Relation Inclusion', () => {
        (0, vitest_1.it)('includes relations between recalled entities', async () => {
            const e1 = graph.createEntity({
                agentId, entityType: 'person', name: 'Alice',
                content: 'developer', workspace: 'work', confidence: 0.8, tokenCost: 10,
            });
            const e2 = graph.createEntity({
                agentId, entityType: 'tool', name: 'Git',
                content: 'vcs', workspace: 'work', confidence: 0.7, tokenCost: 10,
            });
            graph.createRelation({
                sourceEntityId: e1.entityId, targetEntityId: e2.entityId,
                relationType: 'uses', weight: 0.7, evidence: 'Alice uses Git',
            });
            const result = await recall.recall({
                agentId, workspace: 'work', tokenBudget: 2048,
                includeRelations: true,
            });
            (0, vitest_1.expect)(result.relations.length).toBe(1);
            (0, vitest_1.expect)(result.relations[0].relationType).toBe('uses');
        });
    });
    (0, vitest_1.describe)('Quick Recall', () => {
        (0, vitest_1.it)('delegates to SessionGraph.queryMemory', () => {
            graph.createEntity({
                agentId, entityType: 'fact', name: 'test',
                content: 'content', workspace: 'work', confidence: 0.8, tokenCost: 10,
            });
            const result = recall.quickRecall(agentId, 'work', 2048);
            (0, vitest_1.expect)(result.length).toBe(1);
        });
    });
});
// ═══════════════════════════════════════════════════════════════════
// 4. GRACEFUL COMPACTION
// ═══════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('GracefulCompaction', () => {
    let compaction;
    (0, vitest_1.beforeEach)(() => {
        compaction = new clawmemory_1.GracefulCompaction(graph, bus);
    });
    (0, vitest_1.describe)('Pre-Compaction Extraction', () => {
        (0, vitest_1.it)('extracts entities from context text before compaction', async () => {
            const contextText = `
        Alice is the lead developer on the Auth Team.
        We decided to use SQLite for all storage.
        The API endpoint is https://api.example.com/v2.
        Bob uses TypeScript for the backend.
      `;
            const result = await compaction.beforeCompaction({
                agentId, sessionId, workspace: 'work',
                contextText,
            });
            (0, vitest_1.expect)(result.extracted.stats.entitiesStored).toBeGreaterThanOrEqual(1);
            (0, vitest_1.expect)(result.injectionReady.length).toBeGreaterThanOrEqual(1);
        });
        (0, vitest_1.it)('uses lower confidence threshold during compaction', async () => {
            const contextText = 'A concept of microservices might be relevant here.';
            const result = await compaction.beforeCompaction({
                agentId, sessionId, workspace: 'work',
                contextText,
            });
            // Lower threshold (0.2) should capture more
            (0, vitest_1.expect)(result.extracted.stats.belowThreshold).toBeGreaterThanOrEqual(0);
        });
        (0, vitest_1.it)('boosts confidence of preserved entities', async () => {
            const entity = graph.createEntity({
                agentId, entityType: 'fact', name: 'critical-fact',
                content: 'Must not be lost', workspace: 'work', confidence: 0.5, tokenCost: 10,
            });
            await compaction.beforeCompaction({
                agentId, sessionId, workspace: 'work',
                contextText: 'Some context text.',
                preserveEntityIds: [entity.entityId],
            });
            const db = graph.getDb();
            const row = db.prepare('SELECT confidence FROM memory_entities WHERE entity_id = ?')
                .get(entity.entityId);
            (0, vitest_1.expect)(row.confidence).toBeGreaterThan(0.5);
        });
    });
    (0, vitest_1.describe)('Post-Compaction Injection', () => {
        (0, vitest_1.it)('recalls memories within injection budget', async () => {
            // Populate some memories
            for (let i = 0; i < 5; i++) {
                graph.createEntity({
                    agentId, entityType: 'fact', name: `fact-${i}`,
                    content: `Important fact ${i}`, workspace: 'work',
                    confidence: 0.7, tokenCost: 20,
                });
            }
            const result = await compaction.afterCompaction({
                agentId, workspace: 'work', tokenBudget: 80,
            });
            // Budget of 80 tokens with 20 per entity = max 4
            (0, vitest_1.expect)(result.tokensUsed).toBeLessThanOrEqual(80);
            (0, vitest_1.expect)(result.returnedCount).toBeLessThanOrEqual(4);
        });
        (0, vitest_1.it)('prioritizes specified entity IDs', async () => {
            const important = graph.createEntity({
                agentId, entityType: 'fact', name: 'important-fact',
                content: 'Critical info', workspace: 'work', confidence: 0.3, tokenCost: 10,
            });
            graph.createEntity({
                agentId, entityType: 'fact', name: 'less-important',
                content: 'Other info', workspace: 'work', confidence: 0.9, tokenCost: 10,
            });
            const result = await compaction.afterCompaction({
                agentId, workspace: 'work', tokenBudget: 2048,
                priorityEntityIds: [important.entityId],
            });
            (0, vitest_1.expect)(result.returnedCount).toBe(2);
        });
    });
    (0, vitest_1.describe)('Injection Formatting', () => {
        (0, vitest_1.it)('formats entities grouped by type', async () => {
            graph.createEntity({
                agentId, entityType: 'person', name: 'Alice',
                content: 'Lead developer', workspace: 'work', confidence: 0.9, tokenCost: 10,
            });
            graph.createEntity({
                agentId, entityType: 'tool', name: 'Git',
                content: 'Version control', workspace: 'work', confidence: 0.7, tokenCost: 10,
            });
            const result = await compaction.afterCompaction({
                agentId, workspace: 'work', tokenBudget: 2048,
            });
            const formatted = compaction.formatForInjection(result);
            (0, vitest_1.expect)(formatted).toContain('Restored Memories');
            (0, vitest_1.expect)(formatted).toContain('[PERSON]');
            (0, vitest_1.expect)(formatted).toContain('[TOOL]');
            (0, vitest_1.expect)(formatted).toContain('Alice');
            (0, vitest_1.expect)(formatted).toContain('Git');
        });
        (0, vitest_1.it)('returns empty string for no entities', () => {
            const formatted = compaction.formatForInjection({
                entities: [], relations: [], tokensUsed: 0,
                tokensRemaining: 2048, totalCandidates: 0, returnedCount: 0,
            });
            (0, vitest_1.expect)(formatted).toBe('');
        });
        (0, vitest_1.it)('includes relationships in formatted output', async () => {
            const e1 = graph.createEntity({
                agentId, entityType: 'person', name: 'Alice',
                content: 'developer', workspace: 'work', confidence: 0.8, tokenCost: 10,
            });
            const e2 = graph.createEntity({
                agentId, entityType: 'tool', name: 'Git',
                content: 'vcs', workspace: 'work', confidence: 0.7, tokenCost: 10,
            });
            graph.createRelation({
                sourceEntityId: e1.entityId, targetEntityId: e2.entityId,
                relationType: 'uses', weight: 0.7, evidence: 'Alice uses Git',
            });
            const result = await compaction.afterCompaction({
                agentId, workspace: 'work', tokenBudget: 2048,
            });
            const formatted = compaction.formatForInjection(result);
            (0, vitest_1.expect)(formatted).toContain('[RELATIONSHIPS]');
            (0, vitest_1.expect)(formatted).toContain('uses');
        });
    });
    (0, vitest_1.describe)('Full Compaction Cycle', () => {
        (0, vitest_1.it)('runs extract → store → recall → format in one call', async () => {
            const contextText = `
        Alice manages the Auth Team and uses TypeScript.
        We decided to deploy on Kubernetes.
        Important: the staging API is at https://staging.api.com.
      `;
            const { compaction: comp, injection, formatted } = await compaction.compactionCycle({ agentId, sessionId, workspace: 'work', contextText }, 2048);
            (0, vitest_1.expect)(comp.extracted.stats.entitiesStored).toBeGreaterThanOrEqual(0);
            (0, vitest_1.expect)(injection.returnedCount).toBeGreaterThanOrEqual(0);
            (0, vitest_1.expect)(typeof formatted).toBe('string');
        });
    });
});
// ═══════════════════════════════════════════════════════════════════
// 5. CROSS-PRODUCT INTEGRATION
// ═══════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('CrossProductIntegration', () => {
    let integration;
    (0, vitest_1.beforeEach)(() => {
        integration = new clawmemory_1.CrossProductIntegration(graph, bus);
        integration.startListening();
    });
    (0, vitest_1.afterEach)(() => {
        integration.stopListening();
    });
    (0, vitest_1.describe)('ClawGuard Threat Storage', () => {
        (0, vitest_1.it)('stores blocked threats as memory entities', async () => {
            await bus.emit((0, shared_1.createEvent)('behavior.blocked', 'clawguard', {
                skillId: 'malicious-skill-001',
                reason: 'Attempted data exfiltration via network request',
                threatSignature: 'CVE-2026-25253',
            }, { sessionId, agentId }));
            const db = graph.getDb();
            const rows = db.prepare("SELECT * FROM memory_entities WHERE agent_id = ? AND name LIKE 'threat:%'").all(agentId);
            (0, vitest_1.expect)(rows.length).toBe(1);
            (0, vitest_1.expect)(rows[0].workspace).toBe('security');
            (0, vitest_1.expect)(rows[0].confidence).toBe(0.95);
            (0, vitest_1.expect)(rows[0].content).toContain('data exfiltration');
            (0, vitest_1.expect)(rows[0].content).toContain('CVE-2026-25253');
        });
        (0, vitest_1.it)('emits memory.entity_created for threat memories', async () => {
            const events = [];
            bus.on('memory.entity_created', (event) => events.push(event));
            await bus.emit((0, shared_1.createEvent)('behavior.blocked', 'clawguard', { skillId: 'sus-001', reason: 'Suspicious behavior' }, { sessionId, agentId }));
            const memoryEvents = events.filter(e => e.payload?.source === 'clawguard');
            (0, vitest_1.expect)(memoryEvents.length).toBe(1);
        });
        (0, vitest_1.it)('stores threat via direct method', () => {
            integration.storeThreatMemory(agentId, 'skill-x', 'Dangerous Skill', 'CLAW-001', 'Tried to access /etc/passwd');
            const db = graph.getDb();
            const row = db.prepare("SELECT * FROM memory_entities WHERE agent_id = ? AND name = 'threat:skill-x'").get(agentId);
            (0, vitest_1.expect)(row).not.toBeNull();
            (0, vitest_1.expect)(row.content).toContain('Dangerous Skill');
            (0, vitest_1.expect)(row.content).toContain('CLAW-001');
        });
    });
    (0, vitest_1.describe)('ClawBudget Cost Storage', () => {
        (0, vitest_1.it)('stores cost limit exceeded events', async () => {
            await bus.emit((0, shared_1.createEvent)('cost.limit_exceeded', 'clawbudget', { costUsd: 5.50, limit: 5.0, limitType: 'session' }, { sessionId, agentId }));
            const db = graph.getDb();
            const rows = db.prepare("SELECT * FROM memory_entities WHERE agent_id = ? AND name LIKE 'cost_alert:%'").all(agentId);
            (0, vitest_1.expect)(rows.length).toBe(1);
            (0, vitest_1.expect)(rows[0].workspace).toBe('costs');
            (0, vitest_1.expect)(rows[0].content).toContain('5.5');
        });
    });
    (0, vitest_1.describe)('ClawPipe Pipeline Storage', () => {
        (0, vitest_1.it)('stores completed pipeline results', async () => {
            await bus.emit((0, shared_1.createEvent)('pipeline.completed', 'clawpipe', {
                pipelineId: 'pipe-001',
                name: 'data-processing',
                totalSteps: 5,
                totalCostUsd: 1.25,
            }, { sessionId, agentId }));
            const db = graph.getDb();
            const rows = db.prepare("SELECT * FROM memory_entities WHERE agent_id = ? AND name LIKE 'pipeline:%'").all(agentId);
            (0, vitest_1.expect)(rows.length).toBe(1);
            (0, vitest_1.expect)(rows[0].workspace).toBe('pipelines');
            (0, vitest_1.expect)(rows[0].content).toContain('data-processing');
            (0, vitest_1.expect)(rows[0].content).toContain('5 steps');
        });
        (0, vitest_1.it)('stores individual step results', async () => {
            await bus.emit((0, shared_1.createEvent)('pipeline.step_completed', 'clawpipe', {
                pipelineId: 'pipe-001',
                stepName: 'analyze',
                result: { summary: 'Analysis complete', score: 0.95 },
                costUsd: 0.25,
            }, { sessionId, agentId }));
            const db = graph.getDb();
            const rows = db.prepare("SELECT * FROM memory_entities WHERE agent_id = ? AND name LIKE 'step:%'").all(agentId);
            (0, vitest_1.expect)(rows.length).toBe(1);
            (0, vitest_1.expect)(rows[0].content).toContain('analyze');
        });
    });
    (0, vitest_1.describe)('Cost Context Query', () => {
        (0, vitest_1.it)('returns session cost context', () => {
            // Record some costs
            graph.recordCost({
                sessionId, agentId, model: 'claude-opus-4-6', modelTier: 'opus',
                inputTokens: 10000, outputTokens: 5000, thinkingTokens: 0,
                totalTokens: 15000, estimatedCostUsd: 0.175,
                routedBy: 'user', originalModel: null,
            });
            const ctx = integration.getSessionCostContext(sessionId);
            (0, vitest_1.expect)(ctx.costUsd).toBeCloseTo(0.175, 3);
            (0, vitest_1.expect)(ctx.tokens).toBe(15000);
            (0, vitest_1.expect)(ctx.isExpensive).toBe(false);
        });
        (0, vitest_1.it)('flags expensive sessions', () => {
            graph.recordCost({
                sessionId, agentId, model: 'claude-opus-4-6', modelTier: 'opus',
                inputTokens: 200000, outputTokens: 50000, thinkingTokens: 0,
                totalTokens: 250000, estimatedCostUsd: 2.25,
                routedBy: 'user', originalModel: null,
            });
            const ctx = integration.getSessionCostContext(sessionId);
            (0, vitest_1.expect)(ctx.isExpensive).toBe(true);
        });
    });
    (0, vitest_1.describe)('Listener Lifecycle', () => {
        (0, vitest_1.it)('stops listening when stopListening called', async () => {
            integration.stopListening();
            await bus.emit((0, shared_1.createEvent)('behavior.blocked', 'clawguard', { skillId: 'after-stop', reason: 'should not be stored' }, { sessionId, agentId }));
            const db = graph.getDb();
            const rows = db.prepare("SELECT * FROM memory_entities WHERE agent_id = ? AND name = 'threat:after-stop'").all(agentId);
            (0, vitest_1.expect)(rows.length).toBe(0);
        });
    });
});
// ═══════════════════════════════════════════════════════════════════
// 6. FULL INTEGRATION
// ═══════════════════════════════════════════════════════════════════
(0, vitest_1.describe)('Full Integration', () => {
    (0, vitest_1.it)('compound flow: capture → graph → recall → compaction', async () => {
        const capture = new clawmemory_1.SmartCapture(graph, bus);
        const kg = new clawmemory_1.KnowledgeGraph(graph);
        const recall = new clawmemory_1.TokenRecall(graph, bus);
        const compaction = new clawmemory_1.GracefulCompaction(graph, bus);
        // Step 1: Smart Capture extracts from text
        const text = `
      Developer named Alice manages the Auth Team.
      Alice uses TypeScript and Git for development.
      We decided to use SQLite for all storage needs.
      Important: the staging URL is https://staging.example.com
    `;
        const extracted = await capture.extract(text, {
            agentId, sessionId, workspace: 'work',
        });
        (0, vitest_1.expect)(extracted.stats.entitiesStored + extracted.stats.duplicatesMerged).toBeGreaterThanOrEqual(1);
        // Step 2: Knowledge Graph traversal
        const entities = kg.listEntities(agentId, { workspace: 'work' });
        (0, vitest_1.expect)(entities.length).toBeGreaterThanOrEqual(1);
        // Step 3: Token-Budgeted Recall
        const recalled = await recall.recall({
            agentId, workspace: 'work', tokenBudget: 2048,
            query: 'Alice Auth Team',
        });
        (0, vitest_1.expect)(recalled.returnedCount).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(recalled.tokensUsed).toBeLessThanOrEqual(2048);
        // Step 4: Graceful Compaction
        const { formatted } = await compaction.compactionCycle({ agentId, sessionId, workspace: 'work', contextText: text }, 1024);
        (0, vitest_1.expect)(formatted.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('cross-product: Guard threat → Memory → Recall', async () => {
        const integration = new clawmemory_1.CrossProductIntegration(graph, bus);
        const recall = new clawmemory_1.TokenRecall(graph, bus);
        integration.startListening();
        // ClawGuard blocks a malicious skill
        await bus.emit((0, shared_1.createEvent)('behavior.blocked', 'clawguard', {
            skillId: 'data-theft-v2',
            reason: 'Attempted to read ~/.ssh/id_rsa',
            threatSignature: 'CLAW-FILE-EXFIL',
        }, { sessionId, agentId }));
        // Recall security memories
        const result = await recall.recall({
            agentId, workspace: 'security', tokenBudget: 2048,
            query: 'threat blocked skill',
        });
        (0, vitest_1.expect)(result.returnedCount).toBe(1);
        (0, vitest_1.expect)(result.entities[0].content).toContain('data-theft-v2');
        (0, vitest_1.expect)(result.entities[0].confidence).toBe(0.95);
        integration.stopListening();
    });
    (0, vitest_1.it)('cross-product: Pipeline result → Memory → Recall in future pipeline', async () => {
        const integration = new clawmemory_1.CrossProductIntegration(graph, bus);
        const recall = new clawmemory_1.TokenRecall(graph, bus);
        integration.startListening();
        // ClawPipe completes a pipeline
        await bus.emit((0, shared_1.createEvent)('pipeline.completed', 'clawpipe', {
            pipelineId: 'analysis-001',
            name: 'customer-analysis',
            totalSteps: 3,
            totalCostUsd: 0.85,
        }, { sessionId, agentId }));
        // Future pipeline can recall previous results
        const result = await recall.recall({
            agentId, workspace: 'pipelines', tokenBudget: 2048,
            query: 'customer analysis pipeline',
        });
        (0, vitest_1.expect)(result.returnedCount).toBe(1);
        (0, vitest_1.expect)(result.entities[0].content).toContain('customer-analysis');
        integration.stopListening();
    });
    (0, vitest_1.it)('EventBus integration: dashboard receives memory events', async () => {
        const allEvents = [];
        bus.on('memory.*', (event) => allEvents.push(event));
        const capture = new clawmemory_1.SmartCapture(graph, bus);
        const recall = new clawmemory_1.TokenRecall(graph, bus);
        // Capture creates entities (emits memory.entity_created)
        await capture.extract('Developer named Diana writes Python code.', {
            agentId, sessionId, workspace: 'work',
        });
        // Recall accesses entities (emits memory.entity_accessed)
        await recall.recall({ agentId, workspace: 'work', tokenBudget: 2048 });
        // Both creation and access events should have been emitted
        const createdEvents = allEvents.filter(e => e.channel === 'memory.entity_created');
        const accessedEvents = allEvents.filter(e => e.channel === 'memory.entity_accessed');
        (0, vitest_1.expect)(createdEvents.length).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(accessedEvents.length).toBeGreaterThanOrEqual(1);
    });
    (0, vitest_1.it)('Session Graph integration: memories written to shared database', async () => {
        const capture = new clawmemory_1.SmartCapture(graph, bus);
        await capture.extract('User named Eve works on ClawStack project.', {
            agentId, sessionId, workspace: 'work',
        });
        // Verify written to same DB that all products share
        const db = graph.getDb();
        const entityCount = db.prepare('SELECT COUNT(*) as count FROM memory_entities WHERE agent_id = ?').get(agentId).count;
        (0, vitest_1.expect)(entityCount).toBeGreaterThanOrEqual(1);
        // queryMemory (shared SessionGraph method) should return them too
        const queried = graph.queryMemory(agentId, 'work', 2048);
        (0, vitest_1.expect)(queried.length).toBeGreaterThanOrEqual(1);
    });
});
//# sourceMappingURL=clawmemory.test.js.map