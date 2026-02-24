# SOVEREIGN Codex: Wins
Patterns that worked. Read this before starting work.

---


### 2026-02-24 — Phase 0 Foundation Verified
- Context: First-ever ClawStack setup on local machine
- What worked: Agent Session Graph + Event Bus pass all 16 tests on first run (after path fix)
- Why it worked: SQLite via better-sqlite3 with WAL mode, typed schema, comprehensive test coverage
- Reuse when: Setting up any new shared infrastructure — test it before building products on top

### 2026-02-24 — ClawForge Built via Agent Teams
- Context: First product built using Claude Code + Opus 4.6 with parallel agents
- What worked: DUO config — research agent + build agent in parallel, 7m41s total
- Why it worked: Specific prompt with exact requirements, file paths, and integration points
- Reuse when: Building ClawGuard and ClawBudget — same pattern, same prompt structure

### 2026-02-24 — ClawGuard Built — Highest Moat Product
- Context: Runtime behavioral security operating OUTSIDE LLM context
- What worked: Same DUO pattern as ClawForge — research first, build second
- Why it worked: Specific prompt listing all 4 components with integration requirements
- Reuse when: ClawBudget next — same structure, same integration pattern
- Key detail: 9 builtin threat signatures including CVE-2026-25253 and ClawHavoc

### 2026-02-24 — ClawBudget Built — Most Monetizable Product
- Context: Intelligent cost control engine — 4 components, 47 tests, 155 total across stack
- What worked: Web research first (OpenClaw costs, API pricing, Viticci $3,600/mo) → informed real pricing data in model-pricing.ts
- Why it worked: Reading shared infrastructure (SessionGraph API, EventBus, types) before writing any code ensured perfect integration
- Reuse when: ClawPipe and ClawMemory — same pattern: research → read shared → build → test → verify full suite
- Key details: Budget Guardian enforces hard limits + terminates sessions. Smart Router classifies task complexity → routes to cheapest model. Context Surgeon detects 170K+ token bloated sessions. Heartbeat Optimizer detects polling waste (quantified Viticci's $42/day heartbeat pattern). ClawGuard correlation via behavior.blocked subscription.

### 2026-02-24 — ClawBudget Built — Phase 1 Complete
- Context: Third product built same session. All Phase 1 products done in one day.
- What worked: Identical prompt pattern — research, build 4 components, integrate with Session Graph + Event Bus
- Why it worked: Compound pattern proven — each product writes to same DB, listens to same bus, tests cross-product flow
- Key detail: 155 tests passing across shared infra + 3 products. Zero regressions at each step.
- Milestone: Day 30 target (three products in beta) achieved in Day 1 of building.

### 2026-02-24 — ClawPipe Built — Deterministic Multi-Agent Pipeline Framework
- Context: Fourth product. "Humans define the flow. Agents do the work." 69 tests, 224 total across stack.
- What worked: Same proven pattern — web research (YAML frameworks, OpenClaw, multi-agent orchestration) → deep codebase read (SessionGraph, EventBus, types, existing product patterns) → build 4 components → test → verify full suite.
- Why it worked: Reading exact API signatures (SessionGraph.startSession opts, createEvent signature, pipeline_steps schema) before writing any code. Variable resolution designed with clean ${steps.x.output.field} syntax. Parallel execution via Promise.all.
- Key details: Pipeline Parser validates YAML → typed PipelineDefinition. Executor handles sequential + parallel + conditional branching + timeout + cost tracking. Result Validator does lightweight JSON Schema (type/required/min/max/enum). Registry stores/queries pipeline records. StepExecutor callback pattern lets ClawBudget SmartRouter optimize model per step and ClawGuard monitor each session independently.
- Reuse when: ClawMemory next — same pattern. Also: the StepExecutor pattern (callback for actual execution) is good for any integration point.
- Zero regressions: 224 tests passing across shared + 4 products.

### 2026-02-24 — ClawMemory Built — Unified Intelligent Memory Layer
- Context: Fifth product. "Your agent never forgets. Your tokens never bloat." 60 tests, 284 total across stack.
- What worked: Web research first (Mem0 architecture, Cognee ECL pipeline, OpenClaw memory failures, knowledge graph patterns) → deep codebase read (SessionGraph memory methods, EventBus, all shared types, existing product patterns) → build 5 components → test → verify full suite.
- Why it worked: Research identified three critical patterns to adopt (active curation from Mem0, ECL pipeline from Cognee, workspace isolation from OpenClaw's failure to isolate) and one anti-pattern to avoid (LLM-as-memory-router — OpenClaw's core failure). Building extraction as deterministic pattern matching, not LLM-dependent.
- Key details: SmartCapture extracts entities+relations via regex patterns with confidence scoring, deduplicates on upsert (same name+type+workspace = merge, not append). KnowledgeGraph does BFS traversal N-hops with weight filtering, workspace isolation, entity merge. TokenRecall scores by relevance+confidence+recency+frequency with hard token cap enforcement. GracefulCompaction runs pre-compaction extraction (low threshold) + post-compaction injection (formatted context block). CrossProductIntegration auto-subscribes to behavior.blocked, cost.limit_exceeded, pipeline.completed, pipeline.step_completed and stores as typed memory entities in isolated workspaces (security, costs, pipelines).
- Key insight: Case-insensitive flag needed on person entity regex — "Developer named Alice" (sentence-start capitalization) must match the lowercase keyword "developer" in the pattern.
- Reuse when: Dashboard next — same pattern. SmartCapture's pattern-based extraction can be extended with new entity types without changing the architecture.
- Zero regressions: 284 tests passing across shared + 5 products.

### 2026-02-24 — ALL FIVE PRODUCTS BUILT IN ONE DAY
- Context: Full ClawStack suite — ClawForge, ClawGuard, ClawBudget, ClawPipe, ClawMemory
- Total: 284 tests passing, zero regressions, ~12,000+ lines of production code
- Phase 1 + Phase 2 completed in a single day (original timeline: 8 weeks)
- Compound integration verified: all products share Agent Session Graph + Event Bus
- Cross-product flows working: Guard→Budget correlation, Pipe→Memory persistence, Guard→Memory threat storage
- Pattern: identical prompt structure for every product — research first, 4 components, integration requirements, tests
