# SOVEREIGN Codex: Decisions
Strategic decisions and their reasoning.

---

### 2026-02-23 — Phase 0 Architecture Decisions
- Context: Initializing ClawStack monorepo and shared infrastructure
- Decision: TypeScript monorepo with better-sqlite3, local-first
- Reasoning: Solo founder needs type safety across 5 products. SQLite = zero ops overhead. better-sqlite3 is synchronous (simpler) and fast on M5.
- Decision: Agent Session Graph as single SQLite DB shared across all packages
- Reasoning: Compound integration requires all products reading/writing the same data. One DB file = simple, local, portable.
- Decision: Event Bus as in-process pub/sub (not Redis/NATS)
- Reasoning: Local-first. Single machine. No network overhead. Enterprise tier can add distributed messaging later.

