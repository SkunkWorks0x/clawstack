# SOVEREIGN Codex: Wins
Patterns that worked. Read this before starting work.

---


### 2026-02-24 — Phase 0 Foundation Verified
- Context: First-ever ClawStack setup on local machine
- What worked: Agent Session Graph + Event Bus pass all 16 tests on first run (after path fix)
- Why it worked: SQLite via better-sqlite3 with WAL mode, typed schema, comprehensive test coverage
- Reuse when: Setting up any new shared infrastructure — test it before building products on top
