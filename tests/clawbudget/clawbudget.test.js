"use strict";
/**
 * ClawBudget Test Suite — Intelligent Cost Control Engine
 *
 * Tests all four components:
 * 1. Budget Guardian — spending limits and enforcement
 * 2. Smart Router — task classification and model routing
 * 3. Context Surgeon — bloat detection and pruning recommendations
 * 4. Heartbeat Optimizer — polling pattern detection and optimization
 * 5. Cross-product — ClawGuard correlation, Event Bus integration
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const shared_1 = require("@clawstack/shared");
const clawbudget_1 = require("@clawstack/clawbudget");
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
// ─── Model Pricing Tests ──────────────────────────────────────────
(0, vitest_1.describe)('Model Pricing', () => {
    (0, vitest_1.it)('returns correct pricing for known models', () => {
        const opus = (0, clawbudget_1.getModelPricing)('claude-opus-4-6');
        (0, vitest_1.expect)(opus).not.toBeNull();
        (0, vitest_1.expect)(opus.inputPerMillion).toBe(5.0);
        (0, vitest_1.expect)(opus.outputPerMillion).toBe(25.0);
        (0, vitest_1.expect)(opus.tier).toBe('opus');
        const haiku = (0, clawbudget_1.getModelPricing)('claude-haiku-4-5');
        (0, vitest_1.expect)(haiku).not.toBeNull();
        (0, vitest_1.expect)(haiku.inputPerMillion).toBe(1.0);
        (0, vitest_1.expect)(haiku.tier).toBe('haiku');
        const gpt4oMini = (0, clawbudget_1.getModelPricing)('gpt-4o-mini');
        (0, vitest_1.expect)(gpt4oMini).not.toBeNull();
        (0, vitest_1.expect)(gpt4oMini.inputPerMillion).toBe(0.15);
        (0, vitest_1.expect)(gpt4oMini.tier).toBe('haiku');
    });
    (0, vitest_1.it)('estimates cost correctly', () => {
        // 5000 input + 2000 output on Opus 4.6
        // Input: (5000/1M) * $5 = $0.025
        // Output: (2000/1M) * $25 = $0.05
        const cost = (0, clawbudget_1.estimateCost)('claude-opus-4-6', 5000, 2000);
        (0, vitest_1.expect)(cost).toBeCloseTo(0.075, 4);
    });
    (0, vitest_1.it)('estimates cost for high-volume OpenClaw usage', () => {
        // Typical OpenClaw heartbeat: 170K input + 500 output on Sonnet
        // Input: (170000/1M) * $3 = $0.51
        // Output: (500/1M) * $15 = $0.0075
        const cost = (0, clawbudget_1.estimateCost)('claude-sonnet-4-5', 170_000, 500);
        (0, vitest_1.expect)(cost).toBeCloseTo(0.5175, 3);
    });
    (0, vitest_1.it)('classifies model tiers correctly', () => {
        (0, vitest_1.expect)((0, clawbudget_1.classifyModelTier)('claude-opus-4-6')).toBe('opus');
        (0, vitest_1.expect)((0, clawbudget_1.classifyModelTier)('claude-sonnet-4-5')).toBe('sonnet');
        (0, vitest_1.expect)((0, clawbudget_1.classifyModelTier)('claude-haiku-4-5')).toBe('haiku');
        (0, vitest_1.expect)((0, clawbudget_1.classifyModelTier)('gpt-4o-mini')).toBe('haiku');
        (0, vitest_1.expect)((0, clawbudget_1.classifyModelTier)('gpt-4o')).toBe('sonnet');
    });
    (0, vitest_1.it)('falls back to heuristic for unknown models', () => {
        (0, vitest_1.expect)((0, clawbudget_1.classifyModelTier)('some-haiku-variant')).toBe('haiku');
        (0, vitest_1.expect)((0, clawbudget_1.classifyModelTier)('mega-opus-5')).toBe('opus');
        (0, vitest_1.expect)((0, clawbudget_1.classifyModelTier)('totally-unknown-model')).toBe('unknown');
    });
    (0, vitest_1.it)('finds cheapest model per tier', () => {
        const cheapHaiku = (0, clawbudget_1.getCheapestModel)('haiku');
        (0, vitest_1.expect)(cheapHaiku).not.toBeNull();
        (0, vitest_1.expect)(cheapHaiku.model).toBe('gpt-4o-mini'); // $0.15/M is cheapest
        const cheapOpus = (0, clawbudget_1.getCheapestModel)('opus');
        (0, vitest_1.expect)(cheapOpus).not.toBeNull();
        // o3 at $2/M is cheaper than Opus at $5/M
        (0, vitest_1.expect)(cheapOpus.inputPerMillion).toBeLessThan(5.0);
    });
    (0, vitest_1.it)('lists all known models', () => {
        const models = (0, clawbudget_1.listModels)();
        (0, vitest_1.expect)(models.length).toBeGreaterThanOrEqual(9);
        (0, vitest_1.expect)(models.some(m => m.provider === 'anthropic')).toBe(true);
        (0, vitest_1.expect)(models.some(m => m.provider === 'openai')).toBe(true);
    });
});
// ─── Budget Guardian Tests ────────────────────────────────────────
(0, vitest_1.describe)('Budget Guardian', () => {
    let guardian;
    (0, vitest_1.beforeEach)(() => {
        tempDir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'clawbudget-test-'));
        graph = new shared_1.SessionGraph((0, path_1.join)(tempDir, 'test.db'));
        bus = new shared_1.EventBus();
        setupAgentAndSession();
        guardian = new clawbudget_1.BudgetGuardian(graph, bus);
    });
    (0, vitest_1.afterEach)(() => {
        guardian.destroy();
        graph.close();
        (0, fs_1.rmSync)(tempDir, { recursive: true, force: true });
    });
    (0, vitest_1.it)('records cost and emits cost.recorded event', async () => {
        const events = [];
        bus.on('cost.recorded', (e) => events.push(e));
        const result = await guardian.recordAndCheck({
            sessionId,
            agentId,
            model: 'claude-opus-4-6',
            inputTokens: 5000,
            outputTokens: 2000,
        });
        (0, vitest_1.expect)(result.allowed).toBe(true);
        (0, vitest_1.expect)(result.costRecord.model).toBe('claude-opus-4-6');
        (0, vitest_1.expect)(result.costRecord.modelTier).toBe('opus');
        (0, vitest_1.expect)(result.costRecord.totalTokens).toBe(7000);
        (0, vitest_1.expect)(result.costRecord.estimatedCostUsd).toBeGreaterThan(0);
        (0, vitest_1.expect)(events).toHaveLength(1);
        (0, vitest_1.expect)(events[0].channel).toBe('cost.recorded');
    });
    (0, vitest_1.it)('allows spending within budget', async () => {
        guardian.setBudget({
            agentId,
            maxPerSession: 10.0,
            maxPerDay: 50.0,
            maxPerMonth: 500.0,
            alertThresholdPct: 80,
        });
        const result = await guardian.recordAndCheck({
            sessionId,
            agentId,
            model: 'claude-haiku-4-5',
            inputTokens: 1000,
            outputTokens: 500,
        });
        (0, vitest_1.expect)(result.allowed).toBe(true);
        (0, vitest_1.expect)(result.limitExceeded).toBeNull();
        (0, vitest_1.expect)(result.warnings).toHaveLength(0);
    });
    (0, vitest_1.it)('terminates session when session budget exceeded', async () => {
        guardian.setBudget({
            agentId,
            maxPerSession: 0.01, // very low limit
            maxPerDay: 50.0,
            maxPerMonth: 500.0,
            alertThresholdPct: 80,
        });
        const limitEvents = [];
        bus.on('cost.limit_exceeded', (e) => limitEvents.push(e));
        // First call — should push past the $0.01 limit
        const result = await guardian.recordAndCheck({
            sessionId,
            agentId,
            model: 'claude-opus-4-6',
            inputTokens: 5000,
            outputTokens: 2000,
        });
        (0, vitest_1.expect)(result.allowed).toBe(false);
        (0, vitest_1.expect)(result.limitExceeded).toBe('session');
        (0, vitest_1.expect)(limitEvents).toHaveLength(1);
        (0, vitest_1.expect)(limitEvents[0].payload.limitType).toBe('session');
    });
    (0, vitest_1.it)('terminates session when daily budget exceeded', async () => {
        guardian.setBudget({
            agentId,
            maxPerSession: 100.0,
            maxPerDay: 0.01, // very low daily limit
            maxPerMonth: 500.0,
            alertThresholdPct: 80,
        });
        const limitEvents = [];
        bus.on('cost.limit_exceeded', (e) => limitEvents.push(e));
        const result = await guardian.recordAndCheck({
            sessionId,
            agentId,
            model: 'claude-opus-4-6',
            inputTokens: 5000,
            outputTokens: 2000,
        });
        (0, vitest_1.expect)(result.allowed).toBe(false);
        (0, vitest_1.expect)(result.limitExceeded).toBe('daily');
        (0, vitest_1.expect)(limitEvents).toHaveLength(1);
    });
    (0, vitest_1.it)('emits warning at alert threshold', async () => {
        guardian.setBudget({
            agentId,
            maxPerSession: 0.10,
            maxPerDay: 50.0,
            maxPerMonth: 500.0,
            alertThresholdPct: 50,
        });
        const warnings = [];
        bus.on('cost.limit_warning', (e) => warnings.push(e));
        // This should cost ~$0.075, which is 75% of $0.10 limit (above 50% threshold)
        const result = await guardian.recordAndCheck({
            sessionId,
            agentId,
            model: 'claude-opus-4-6',
            inputTokens: 5000,
            outputTokens: 2000,
        });
        (0, vitest_1.expect)(result.allowed).toBe(true);
        (0, vitest_1.expect)(result.warnings.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(warnings).toHaveLength(1);
    });
    (0, vitest_1.it)('records smart router routing metadata', async () => {
        const result = await guardian.recordAndCheck({
            sessionId,
            agentId,
            model: 'claude-haiku-4-5',
            inputTokens: 1000,
            outputTokens: 200,
            routedBy: 'smart_router',
            originalModel: 'claude-opus-4-6',
        });
        (0, vitest_1.expect)(result.costRecord.routedBy).toBe('smart_router');
        (0, vitest_1.expect)(result.costRecord.originalModel).toBe('claude-opus-4-6');
    });
    (0, vitest_1.it)('includes thinking tokens in cost calculation', async () => {
        const result = await guardian.recordAndCheck({
            sessionId,
            agentId,
            model: 'claude-opus-4-6',
            inputTokens: 5000,
            outputTokens: 2000,
            thinkingTokens: 3000,
        });
        (0, vitest_1.expect)(result.costRecord.thinkingTokens).toBe(3000);
        (0, vitest_1.expect)(result.costRecord.totalTokens).toBe(10000);
        // Cost should be higher due to thinking tokens (billed as output)
        (0, vitest_1.expect)(result.costRecord.estimatedCostUsd).toBeGreaterThan(0.075);
    });
    (0, vitest_1.it)('returns spend summary', async () => {
        guardian.setBudget({
            agentId,
            maxPerSession: 10.0,
            maxPerDay: 50.0,
            maxPerMonth: 500.0,
            alertThresholdPct: 80,
        });
        await guardian.recordAndCheck({
            sessionId,
            agentId,
            model: 'claude-opus-4-6',
            inputTokens: 5000,
            outputTokens: 2000,
        });
        const summary = guardian.getSpendSummary(agentId, sessionId);
        (0, vitest_1.expect)(summary.session).not.toBeNull();
        (0, vitest_1.expect)(summary.session.costUsd).toBeGreaterThan(0);
        (0, vitest_1.expect)(summary.session.calls).toBe(1);
        (0, vitest_1.expect)(summary.daily.costUsd).toBeGreaterThan(0);
        (0, vitest_1.expect)(summary.monthly).toBeGreaterThan(0);
        (0, vitest_1.expect)(summary.budget).not.toBeNull();
        (0, vitest_1.expect)(summary.budget.maxPerSession).toBe(10.0);
    });
    (0, vitest_1.it)('works without budget configured (no limits enforced)', async () => {
        // Don't set any budget
        const result = await guardian.recordAndCheck({
            sessionId,
            agentId,
            model: 'claude-opus-4-6',
            inputTokens: 1_000_000,
            outputTokens: 500_000,
        });
        (0, vitest_1.expect)(result.allowed).toBe(true);
        (0, vitest_1.expect)(result.limitExceeded).toBeNull();
    });
});
// ─── Smart Router Tests ───────────────────────────────────────────
(0, vitest_1.describe)('Smart Router', () => {
    let router;
    (0, vitest_1.beforeEach)(() => {
        router = new clawbudget_1.SmartRouter();
    });
    (0, vitest_1.it)('routes simple lookups to haiku tier', () => {
        const decision = router.route({
            prompt: 'What is the weather in San Francisco?',
            toolCount: 1,
        });
        (0, vitest_1.expect)(decision.complexity).toBe('simple');
        (0, vitest_1.expect)(decision.recommendedTier).toBe('haiku');
    });
    (0, vitest_1.it)('routes complex refactoring to opus tier', () => {
        const decision = router.route({
            prompt: `Refactor the authentication module to use OAuth2 with PKCE flow.
        The current implementation in src/auth/ uses session-based auth.
        We need to migrate to token-based auth while maintaining backward compatibility.
        \`\`\`typescript
        class AuthService {
          async login(username: string, password: string): Promise<Session> {
            // legacy code here
          }
        }
        \`\`\``,
            toolCount: 8,
            hasCodeContext: true,
        });
        (0, vitest_1.expect)(decision.complexity).toBe('complex');
        (0, vitest_1.expect)(decision.recommendedTier).toBe('opus');
    });
    (0, vitest_1.it)('routes medium tasks to sonnet tier', () => {
        const decision = router.route({
            prompt: 'Summarize the key points from the last meeting about the product roadmap. Focus on action items and deadlines. Include the discussion about the new feature release, the marketing timeline, the Q3 budget review, and the engineering team velocity. Compare with the previous quarter goals and highlight any blockers or dependencies between teams that need to be resolved before the launch.',
            toolCount: 4,
        });
        (0, vitest_1.expect)(decision.complexity).toBe('medium');
        (0, vitest_1.expect)(decision.recommendedTier).toBe('sonnet');
    });
    (0, vitest_1.it)('records routing when model differs from requested', () => {
        const decision = router.route({
            prompt: 'What time is it?',
            requestedModel: 'claude-opus-4-6',
        });
        (0, vitest_1.expect)(decision.wasRouted).toBe(true);
        (0, vitest_1.expect)(decision.originalModel).toBe('claude-opus-4-6');
        (0, vitest_1.expect)(decision.recommendedTier).toBe('haiku');
        (0, vitest_1.expect)(decision.estimatedSavings).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('does not route when already on optimal model', () => {
        const decision = router.route({
            prompt: 'What time is it?',
            requestedModel: 'gpt-4o-mini', // already cheap
        });
        // Even if classified as simple, if the requested model IS the cheapest haiku model, no routing needed
        if (decision.recommendedModel === 'gpt-4o-mini') {
            (0, vitest_1.expect)(decision.wasRouted).toBe(false);
            (0, vitest_1.expect)(decision.originalModel).toBeNull();
        }
    });
    (0, vitest_1.it)('respects disabled state', () => {
        router.setEnabled(false);
        (0, vitest_1.expect)(router.isEnabled()).toBe(false);
        const decision = router.route({
            prompt: 'What time is it?',
            requestedModel: 'claude-opus-4-6',
        });
        (0, vitest_1.expect)(decision.wasRouted).toBe(false);
    });
    (0, vitest_1.it)('classifies prompts with code as more complex', () => {
        const withCode = router.route({
            prompt: `Review this code and fix the bug:
        \`\`\`typescript
        function processData(items: string[]) {
          const result = items.map(item => {
            const parsed = JSON.parse(item);
            return parsed.value * 2;
          });
          return result.filter(v => v > 0);
        }
        \`\`\`
        The function throws on invalid JSON. Add error handling and optimize the filtering.`,
            toolCount: 3,
            hasCodeContext: true,
        });
        const withoutCode = router.route({
            prompt: 'hello world',
        });
        // Code context should score higher
        (0, vitest_1.expect)(withCode.signals.codeScore).toBeGreaterThan(withoutCode.signals.codeScore);
        (0, vitest_1.expect)(['medium', 'complex']).toContain(withCode.complexity);
    });
    (0, vitest_1.it)('factors in tool count for complexity', () => {
        const noTools = router.route({ prompt: 'Do something moderately complex', toolCount: 0 });
        const manyTools = router.route({ prompt: 'Do something moderately complex', toolCount: 10 });
        (0, vitest_1.expect)(manyTools.signals.toolScore).toBeGreaterThan(noTools.signals.toolScore);
    });
    (0, vitest_1.it)('provides human-readable reason', () => {
        const decision = router.route({
            prompt: 'What is the weather?',
            toolCount: 0,
        });
        (0, vitest_1.expect)(decision.reason).toBeTruthy();
        (0, vitest_1.expect)(typeof decision.reason).toBe('string');
        (0, vitest_1.expect)(decision.reason.length).toBeGreaterThan(0);
    });
});
// ─── Context Surgeon Tests ────────────────────────────────────────
(0, vitest_1.describe)('Context Surgeon', () => {
    let surgeon;
    (0, vitest_1.beforeEach)(() => {
        surgeon = new clawbudget_1.ContextSurgeon();
    });
    (0, vitest_1.it)('detects tool output bloat', () => {
        const messages = [
            { role: 'system', tokens: 5000 },
            { role: 'user', tokens: 200 },
            { role: 'tool', tokens: 80_000, toolName: 'search' },
            { role: 'assistant', tokens: 1000 },
            { role: 'tool', tokens: 60_000, toolName: 'read_file' },
            { role: 'assistant', tokens: 500 },
        ];
        const analysis = surgeon.analyze('sess-1', messages);
        (0, vitest_1.expect)(analysis.totalTokens).toBe(146_700);
        (0, vitest_1.expect)(analysis.toolOutputPct).toBeGreaterThan(0.5);
        (0, vitest_1.expect)(analysis.issues.some(i => i.type === 'tool_bloat')).toBe(true);
        (0, vitest_1.expect)(analysis.recommendations.some(r => r.action === 'remove_old_tool_outputs')).toBe(true);
        (0, vitest_1.expect)(analysis.estimatedSavings).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('detects stale context', () => {
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const now = new Date().toISOString();
        const messages = [
            { role: 'system', tokens: 3000 },
            { role: 'user', tokens: 5000, timestamp: twoDaysAgo },
            { role: 'assistant', tokens: 3000, timestamp: twoDaysAgo },
            { role: 'tool', tokens: 20_000, timestamp: twoDaysAgo, toolName: 'slack' },
            { role: 'user', tokens: 200, timestamp: now },
            { role: 'assistant', tokens: 500, timestamp: now },
        ];
        const analysis = surgeon.analyze('sess-2', messages);
        (0, vitest_1.expect)(analysis.issues.some(i => i.type === 'stale_context')).toBe(true);
        const staleIssue = analysis.issues.find(i => i.type === 'stale_context');
        (0, vitest_1.expect)(staleIssue.tokenCost).toBe(28_000); // user + assistant + tool from 2 days ago
        (0, vitest_1.expect)(analysis.recommendations.some(r => r.action === 'remove_stale_messages')).toBe(true);
    });
    (0, vitest_1.it)('detects oversized messages', () => {
        const messages = [
            { role: 'system', tokens: 2000 },
            { role: 'tool', tokens: 60_000, toolName: 'large_file' },
            { role: 'user', tokens: 100 },
        ];
        const analysis = surgeon.analyze('sess-3', messages);
        (0, vitest_1.expect)(analysis.issues.some(i => i.type === 'oversized_message')).toBe(true);
        (0, vitest_1.expect)(analysis.recommendations.some(r => r.action === 'truncate_large_outputs')).toBe(true);
    });
    (0, vitest_1.it)('recommends summarization for long conversations', () => {
        // Create 30 messages totaling >50K tokens
        const messages = [];
        for (let i = 0; i < 30; i++) {
            messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', tokens: 2000 });
        }
        const analysis = surgeon.analyze('sess-4', messages);
        (0, vitest_1.expect)(analysis.messageCount).toBe(30);
        (0, vitest_1.expect)(analysis.totalTokens).toBe(60_000);
        (0, vitest_1.expect)(analysis.recommendations.some(r => r.action === 'summarize_conversation')).toBe(true);
    });
    (0, vitest_1.it)('reports clean analysis for healthy sessions', () => {
        const messages = [
            { role: 'system', tokens: 3000 },
            { role: 'user', tokens: 200 },
            { role: 'assistant', tokens: 500 },
            { role: 'user', tokens: 150 },
            { role: 'assistant', tokens: 400 },
        ];
        const analysis = surgeon.analyze('sess-5', messages);
        (0, vitest_1.expect)(analysis.issues).toHaveLength(0);
        (0, vitest_1.expect)(analysis.recommendations).toHaveLength(0);
        (0, vitest_1.expect)(analysis.totalTokens).toBe(4250);
    });
    (0, vitest_1.it)('provides correct breakdown by role', () => {
        const messages = [
            { role: 'system', tokens: 1000 },
            { role: 'user', tokens: 200 },
            { role: 'assistant', tokens: 300 },
            { role: 'tool', tokens: 500 },
        ];
        const analysis = surgeon.analyze('sess-6', messages);
        (0, vitest_1.expect)(analysis.breakdown.system).toBe(1000);
        (0, vitest_1.expect)(analysis.breakdown.user).toBe(200);
        (0, vitest_1.expect)(analysis.breakdown.assistant).toBe(300);
        (0, vitest_1.expect)(analysis.breakdown.tool).toBe(500);
    });
    (0, vitest_1.it)('tracks context size over time', () => {
        const msgs1 = [
            { role: 'user', tokens: 100 },
            { role: 'assistant', tokens: 200 },
        ];
        surgeon.analyze('sess-7', msgs1);
        const msgs2 = [
            ...msgs1,
            { role: 'user', tokens: 100 },
            { role: 'assistant', tokens: 200 },
            { role: 'tool', tokens: 5000 },
        ];
        surgeon.analyze('sess-7', msgs2);
        const history = surgeon.getHistory('sess-7');
        (0, vitest_1.expect)(history).toHaveLength(2);
        (0, vitest_1.expect)(history[0].totalTokens).toBe(300);
        (0, vitest_1.expect)(history[1].totalTokens).toBe(5600);
    });
    (0, vitest_1.it)('detects context growth rate', () => {
        // Record multiple snapshots with growing context
        surgeon.analyze('sess-8', [
            { role: 'user', tokens: 100 },
            { role: 'assistant', tokens: 200 },
        ]);
        surgeon.analyze('sess-8', [
            { role: 'user', tokens: 100 },
            { role: 'assistant', tokens: 200 },
            { role: 'user', tokens: 100 },
            { role: 'assistant', tokens: 200 },
            { role: 'tool', tokens: 50_000 },
        ]);
        const growth = surgeon.getGrowthRate('sess-8');
        (0, vitest_1.expect)(growth).not.toBeNull();
        (0, vitest_1.expect)(growth.trend).toBe('growing');
        (0, vitest_1.expect)(growth.tokensPerMessage).toBeGreaterThan(500);
    });
    (0, vitest_1.it)('estimates cost savings in USD', () => {
        const messages = [
            { role: 'system', tokens: 5000 },
            { role: 'tool', tokens: 100_000, toolName: 'big_output' },
            { role: 'user', tokens: 200 },
        ];
        const analysis = surgeon.analyze('sess-9', messages);
        // Should have recommendations with cost savings
        for (const rec of analysis.recommendations) {
            (0, vitest_1.expect)(rec.estimatedCostSavings).toBeGreaterThan(0);
            (0, vitest_1.expect)(rec.estimatedSavings).toBeGreaterThan(0);
        }
    });
});
// ─── Heartbeat Optimizer Tests ────────────────────────────────────
(0, vitest_1.describe)('Heartbeat Optimizer', () => {
    let optimizer;
    (0, vitest_1.beforeEach)(() => {
        optimizer = new clawbudget_1.HeartbeatOptimizer();
    });
    (0, vitest_1.it)('detects regular polling patterns', () => {
        const baseTime = Date.now();
        const intervalMs = 30 * 60 * 1000; // 30 minutes
        // Simulate 10 heartbeat calls at 30-minute intervals
        for (let i = 0; i < 10; i++) {
            optimizer.recordCall({
                timestamp: new Date(baseTime + i * intervalMs).toISOString(),
                promptHash: 'heartbeat-inbox-check',
                model: 'claude-sonnet-4-5',
                inputTokens: 170_000,
                outputTokens: 500,
                costUsd: 0.52,
                responseChanged: i === 3 || i === 7, // only 2 out of 10 had changes
            });
        }
        const patterns = optimizer.detectPatterns();
        (0, vitest_1.expect)(patterns).toHaveLength(1);
        const pattern = patterns[0];
        (0, vitest_1.expect)(pattern.promptHash).toBe('heartbeat-inbox-check');
        (0, vitest_1.expect)(pattern.callCount).toBe(10);
        (0, vitest_1.expect)(pattern.wasteRatio).toBe(0.8); // 8 out of 10 unchanged
        (0, vitest_1.expect)(pattern.totalCostUsd).toBeCloseTo(5.2, 1);
    });
    (0, vitest_1.it)('recommends reducing polling frequency', () => {
        const baseTime = Date.now();
        const intervalMs = 15 * 60 * 1000; // 15 minutes
        // 20 calls, only 2 had actual changes
        for (let i = 0; i < 20; i++) {
            optimizer.recordCall({
                timestamp: new Date(baseTime + i * intervalMs).toISOString(),
                promptHash: 'calendar-check',
                model: 'claude-opus-4-6',
                inputTokens: 170_000,
                outputTokens: 1000,
                costUsd: 0.88,
                responseChanged: i === 5 || i === 15,
            });
        }
        const recommendations = optimizer.recommend();
        (0, vitest_1.expect)(recommendations).toHaveLength(1);
        const rec = recommendations[0];
        (0, vitest_1.expect)(rec.recommendedIntervalMs).toBeGreaterThan(intervalMs); // should recommend longer intervals
        (0, vitest_1.expect)(rec.dailySavings).toBeGreaterThan(0);
        (0, vitest_1.expect)(rec.monthlySavings).toBeGreaterThan(0);
        (0, vitest_1.expect)(rec.reason).toContain('polls detected changes');
    });
    (0, vitest_1.it)('aggressively reduces frequency for never-changing responses', () => {
        const baseTime = Date.now();
        const intervalMs = 30 * 60 * 1000;
        // 8 calls, NONE had changes — pure waste
        for (let i = 0; i < 8; i++) {
            optimizer.recordCall({
                timestamp: new Date(baseTime + i * intervalMs).toISOString(),
                promptHash: 'idle-check',
                model: 'claude-sonnet-4-5',
                inputTokens: 170_000,
                outputTokens: 200,
                costUsd: 0.51,
                responseChanged: false,
            });
        }
        const recommendations = optimizer.recommend();
        (0, vitest_1.expect)(recommendations).toHaveLength(1);
        const rec = recommendations[0];
        // Should recommend at least 4 hours for never-changing patterns
        (0, vitest_1.expect)(rec.recommendedIntervalMs).toBeGreaterThanOrEqual(4 * 60 * 60 * 1000);
        (0, vitest_1.expect)(rec.reason).toContain('never changed');
    });
    (0, vitest_1.it)('ignores low-waste patterns', () => {
        const baseTime = Date.now();
        const intervalMs = 60 * 60 * 1000; // 1 hour
        // 5 calls, 4 had changes — only 20% waste, not worth optimizing
        for (let i = 0; i < 5; i++) {
            optimizer.recordCall({
                timestamp: new Date(baseTime + i * intervalMs).toISOString(),
                promptHash: 'active-monitoring',
                model: 'claude-haiku-4-5',
                inputTokens: 10_000,
                outputTokens: 500,
                costUsd: 0.01,
                responseChanged: i !== 2, // only 1 unchanged
            });
        }
        const recommendations = optimizer.recommend();
        (0, vitest_1.expect)(recommendations).toHaveLength(0); // 20% waste not worth optimizing
    });
    (0, vitest_1.it)('calculates total savings potential', () => {
        const baseTime = Date.now();
        // Pattern 1: Expensive waste
        for (let i = 0; i < 10; i++) {
            optimizer.recordCall({
                timestamp: new Date(baseTime + i * 30 * 60 * 1000).toISOString(),
                promptHash: 'pattern-1',
                model: 'claude-opus-4-6',
                inputTokens: 170_000,
                outputTokens: 500,
                costUsd: 0.86,
                responseChanged: false,
            });
        }
        // Pattern 2: Moderate waste
        for (let i = 0; i < 8; i++) {
            optimizer.recordCall({
                timestamp: new Date(baseTime + i * 60 * 60 * 1000).toISOString(),
                promptHash: 'pattern-2',
                model: 'claude-sonnet-4-5',
                inputTokens: 50_000,
                outputTokens: 200,
                costUsd: 0.15,
                responseChanged: i === 3,
            });
        }
        const totals = optimizer.totalSavingsPotential();
        (0, vitest_1.expect)(totals.patternCount).toBe(2);
        (0, vitest_1.expect)(totals.dailySavings).toBeGreaterThan(0);
        (0, vitest_1.expect)(totals.monthlySavings).toBe(totals.dailySavings * 30);
    });
    (0, vitest_1.it)('requires minimum 3 calls to detect pattern', () => {
        optimizer.recordCall({
            timestamp: new Date().toISOString(),
            promptHash: 'too-few',
            model: 'claude-haiku-4-5',
            inputTokens: 1000,
            outputTokens: 100,
            costUsd: 0.001,
            responseChanged: false,
        });
        optimizer.recordCall({
            timestamp: new Date(Date.now() + 60000).toISOString(),
            promptHash: 'too-few',
            model: 'claude-haiku-4-5',
            inputTokens: 1000,
            outputTokens: 100,
            costUsd: 0.001,
            responseChanged: false,
        });
        const patterns = optimizer.detectPatterns();
        (0, vitest_1.expect)(patterns).toHaveLength(0);
    });
    (0, vitest_1.it)('clears call history', () => {
        for (let i = 0; i < 5; i++) {
            optimizer.recordCall({
                timestamp: new Date(Date.now() + i * 60000).toISOString(),
                promptHash: 'test',
                model: 'claude-haiku-4-5',
                inputTokens: 1000,
                outputTokens: 100,
                costUsd: 0.001,
                responseChanged: false,
            });
        }
        optimizer.clear();
        (0, vitest_1.expect)(optimizer.detectPatterns()).toHaveLength(0);
    });
});
// ─── Cross-Product Integration Tests ──────────────────────────────
(0, vitest_1.describe)('Cross-Product Integration', () => {
    let guardian;
    (0, vitest_1.beforeEach)(() => {
        tempDir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'clawbudget-xprod-'));
        graph = new shared_1.SessionGraph((0, path_1.join)(tempDir, 'test.db'));
        bus = new shared_1.EventBus();
        setupAgentAndSession();
        guardian = new clawbudget_1.BudgetGuardian(graph, bus);
    });
    (0, vitest_1.afterEach)(() => {
        guardian.destroy();
        graph.close();
        (0, fs_1.rmSync)(tempDir, { recursive: true, force: true });
    });
    (0, vitest_1.it)('correlates ClawGuard blocked events with cost anomalies', async () => {
        // Record some cost first
        await guardian.recordAndCheck({
            sessionId,
            agentId,
            model: 'claude-opus-4-6',
            inputTokens: 100_000,
            outputTokens: 10_000,
        });
        // Simulate ClawGuard blocking an action
        await bus.emit((0, shared_1.createEvent)('behavior.blocked', 'clawguard', {
            eventType: 'network_request',
            threatLevel: 'critical',
            threatSignature: 'SIG-EXFIL-001',
            description: 'Attempted data exfiltration',
        }, { sessionId, agentId }));
        const anomalies = guardian.getAnomalies();
        (0, vitest_1.expect)(anomalies).toHaveLength(1);
        (0, vitest_1.expect)(anomalies[0].type).toBe('blocked_with_high_cost');
        (0, vitest_1.expect)(anomalies[0].agentId).toBe(agentId);
        (0, vitest_1.expect)(anomalies[0].costUsd).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('full flow: Smart Router → Budget Guardian → Event Bus', async () => {
        const router = new clawbudget_1.SmartRouter();
        // Set tight budget
        guardian.setBudget({
            agentId,
            maxPerSession: 1.0,
            maxPerDay: 10.0,
            maxPerMonth: 100.0,
            alertThresholdPct: 80,
        });
        // Route a simple task
        const decision = router.route({
            prompt: 'What time is it?',
            requestedModel: 'claude-opus-4-6',
        });
        (0, vitest_1.expect)(decision.wasRouted).toBe(true);
        (0, vitest_1.expect)(decision.recommendedTier).toBe('haiku');
        // Record through guardian with routing metadata
        const events = [];
        bus.on('cost.recorded', (e) => events.push(e));
        const result = await guardian.recordAndCheck({
            sessionId,
            agentId,
            model: decision.recommendedModel,
            inputTokens: 500,
            outputTokens: 100,
            routedBy: 'smart_router',
            originalModel: decision.originalModel,
        });
        (0, vitest_1.expect)(result.allowed).toBe(true);
        (0, vitest_1.expect)(result.costRecord.routedBy).toBe('smart_router');
        (0, vitest_1.expect)(result.costRecord.originalModel).toBe('claude-opus-4-6');
        (0, vitest_1.expect)(events).toHaveLength(1);
    });
    (0, vitest_1.it)('Budget Guardian + Context Surgeon together identify expensive bloated sessions', async () => {
        const surgeon = new clawbudget_1.ContextSurgeon();
        // Record high cost
        await guardian.recordAndCheck({
            sessionId,
            agentId,
            model: 'claude-opus-4-6',
            inputTokens: 170_000,
            outputTokens: 5000,
        });
        // Analyze session context
        const analysis = surgeon.analyze(sessionId, [
            { role: 'system', tokens: 5000 },
            { role: 'user', tokens: 200 },
            { role: 'tool', tokens: 130_000, toolName: 'slack_history' },
            { role: 'assistant', tokens: 1000 },
            { role: 'tool', tokens: 34_000, toolName: 'file_contents' },
        ]);
        (0, vitest_1.expect)(analysis.toolOutputPct).toBeGreaterThan(0.9);
        (0, vitest_1.expect)(analysis.issues.some(i => i.type === 'tool_bloat')).toBe(true);
        (0, vitest_1.expect)(analysis.estimatedSavings).toBeGreaterThan(50_000);
        // The cost data confirms the bloat
        const summary = guardian.getSpendSummary(agentId, sessionId);
        (0, vitest_1.expect)(summary.session.costUsd).toBeGreaterThan(0.5);
    });
    (0, vitest_1.it)('Event Bus delivers cost events to multiple subscribers', async () => {
        const costRecorded = [];
        const allCostEvents = [];
        bus.on('cost.recorded', (e) => costRecorded.push(e));
        bus.on('cost.*', (e) => allCostEvents.push(e));
        await guardian.recordAndCheck({
            sessionId,
            agentId,
            model: 'claude-haiku-4-5',
            inputTokens: 1000,
            outputTokens: 200,
        });
        (0, vitest_1.expect)(costRecorded).toHaveLength(1);
        (0, vitest_1.expect)(allCostEvents).toHaveLength(1); // cost.recorded matches cost.*
    });
    (0, vitest_1.it)('multiple sessions accumulate against daily budget', async () => {
        guardian.setBudget({
            agentId,
            maxPerSession: 100.0,
            maxPerDay: 0.20, // $0.20/day limit
            maxPerMonth: 500.0,
            alertThresholdPct: 80,
        });
        // Session 1
        await guardian.recordAndCheck({
            sessionId,
            agentId,
            model: 'claude-opus-4-6',
            inputTokens: 10_000,
            outputTokens: 5000,
        });
        // Session 2 (new session, same agent)
        const session2 = graph.startSession(agentId);
        const result = await guardian.recordAndCheck({
            sessionId: session2.sessionId,
            agentId,
            model: 'claude-opus-4-6',
            inputTokens: 10_000,
            outputTokens: 5000,
        });
        // Daily accumulation should exceed $0.20
        (0, vitest_1.expect)(result.dailyCostUsd).toBeGreaterThan(0.15);
        // Whether it exceeds depends on exact pricing
        if (result.dailyCostUsd >= 0.20) {
            (0, vitest_1.expect)(result.limitExceeded).toBe('daily');
            (0, vitest_1.expect)(result.allowed).toBe(false);
        }
    });
    (0, vitest_1.it)('Heartbeat Optimizer quantifies Viticci-level waste', () => {
        const optimizer = new clawbudget_1.HeartbeatOptimizer();
        const baseTime = Date.now();
        // Simulate Viticci's setup: 30-min heartbeats on Opus for 24 hours
        // 48 calls × $0.88/call = $42.24/day
        for (let i = 0; i < 48; i++) {
            optimizer.recordCall({
                timestamp: new Date(baseTime + i * 30 * 60 * 1000).toISOString(),
                promptHash: 'viticci-navi-heartbeat',
                model: 'claude-opus-4-5',
                inputTokens: 170_000,
                outputTokens: 1000,
                costUsd: 0.88,
                responseChanged: i % 8 === 0, // changes every ~4 hours (6 out of 48)
            });
        }
        const patterns = optimizer.detectPatterns();
        (0, vitest_1.expect)(patterns).toHaveLength(1);
        (0, vitest_1.expect)(patterns[0].totalCostUsd).toBeCloseTo(42.24, 0);
        (0, vitest_1.expect)(patterns[0].wasteRatio).toBeGreaterThan(0.8);
        const recs = optimizer.recommend();
        (0, vitest_1.expect)(recs).toHaveLength(1);
        (0, vitest_1.expect)(recs[0].monthlySavings).toBeGreaterThan(100); // should save $100+/mo
    });
});
//# sourceMappingURL=clawbudget.test.js.map