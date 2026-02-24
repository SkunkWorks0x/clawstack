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
