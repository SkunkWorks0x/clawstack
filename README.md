# ClawStack

**The operating system for OpenClaw agents.**

ClawStack solves the five crises killing OpenClaw deployments — security, cost, memory, orchestration, and onboarding — with five integrated products on one shared primitive.

## The Problem

OpenClaw has 223K+ stars. It also has:

- **824+ malicious skills** on the marketplace (CVE-2026-25253, ClawHavoc, data exfiltration via `fetch()`)
- **$3,600/month hemorrhaging** from uncontrolled API calls (documented by Federico Viticci — $42/day in heartbeat polling alone)
- **75-100KB per LLM request** because agents dump their entire memory every turn. No recall. No compaction. Just bloat.
- **No pipeline determinism.** Multi-agent workflows are ad-hoc, unreproducible, and impossible to audit.
- **30-minute onboarding** that fails silently. No security audit. No budget limits. No guardrails.

These aren't edge cases. They're the default experience.

## The Solution

Five products. One shared primitive. Every product reads from and writes to the **Agent Session Graph** — a unified SQLite database capturing agent identity, behavior, cost, memory, lineage, and trust.

| Product | What It Does | Components |
|---------|-------------|------------|
| **ClawForge** | One-command secure deployment with built-in audit | CLI (init, audit, status), security scanner, Session Graph registration |
| **ClawGuard** | Runtime behavioral security — process-level, can't be prompt-injected | PolicyEngine, KillSwitch, ThreatIntel (9 builtin signatures incl. CVE-2026-25253), RuntimeMonitor |
| **ClawBudget** | Hard spending limits + smart model routing + context surgery | BudgetGuardian, SmartRouter (task complexity classification), ContextSurgeon (170K+ token detection), HeartbeatOptimizer |
| **ClawPipe** | YAML-defined deterministic multi-agent pipelines | PipelineParser, StepExecutor (sequential + parallel + conditional), ResultValidator (JSON Schema), VariableResolver (`${steps.x.output}`) |
| **ClawMemory** | Knowledge graph memory with token-budgeted recall | SmartCapture (entity/relation extraction), KnowledgeGraph (BFS traversal, workspace isolation), TokenRecall (scored retrieval under token cap), GracefulCompaction |
| **Dashboard** | Unified web UI for all five products | 6 pages, 15 API endpoints, SSE real-time alerts, Recharts visualizations |

## Demo

![306 tests passing across all 5 products](assets/demo-tests.png)

![ClawForge security audit: 9/9 checks passed](assets/demo-clawforge.png)

![ClawGuard blocking data exfiltration in real-time](assets/demo-clawguard.png)

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Dashboard (React)                        │
│   Overview │ Agents │ Security │ Cost │ Memory │ Pipelines   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ClawForge    ClawGuard    ClawBudget   ClawPipe  ClawMemory│
│   ┌────────┐  ┌─────────┐  ┌─────────┐  ┌──────┐ ┌────────┐│
│   │ Deploy │  │ Monitor │  │ Budget  │  │ YAML │ │ Graph  ││
│   │ Audit  │  │ Kill    │  │ Route   │  │ Exec │ │ Recall ││
│   │ Status │  │ Threat  │  │ Surgery │  │ Valid│ │Compact ││
│   └───┬────┘  └────┬────┘  └────┬────┘  └──┬───┘ └───┬────┘│
│       │            │            │           │         │      │
├───────┴────────────┴────────────┴───────────┴─────────┴──────┤
│                    Event Bus (pub/sub)                        │
│         behavior.* │ cost.* │ pipeline.* │ memory.*           │
├──────────────────────────────────────────────────────────────┤
│                 Agent Session Graph (SQLite)                  │
│   Identity │ Behavior │ Cost │ Memory │ Lineage │ Trust      │
└──────────────────────────────────────────────────────────────┘
```

Cross-product flows work out of the box:
- ClawGuard blocks a skill → ClawMemory stores the threat → Dashboard shows the alert
- ClawBudget hits a limit → ClawGuard correlates the cost spike → agent session terminated
- ClawPipe completes a step → ClawMemory persists the result → next pipeline recalls it

## Getting Started

```bash
git clone https://github.com/Skunkworks0x/clawstack.git
cd clawstack

# Install dependencies
npm install

# Run all 306 tests
npm test

# Build all packages
npm run build
```

To launch the dashboard:

```bash
# Create the database directory and start the dashboard
mkdir -p packages/dashboard/.clawstack
npm run dev:dashboard
# Express API on :3001, React UI on :5173
```

## Project Structure

```
clawstack/
├── packages/
│   ├── shared/                  # Agent Session Graph, Event Bus, types
│   │   ├── session-graph/       # SQLite-backed agent state (better-sqlite3, WAL mode)
│   │   ├── event-bus/           # In-process pub/sub with wildcard matching
│   │   └── types/               # Shared TypeScript interfaces
│   ├── clawforge/               # Secure deployment CLI (npm-publishable)
│   ├── clawguard/               # Runtime behavioral security engine
│   ├── clawbudget/              # Cost control + smart model routing
│   ├── clawpipe/                # Pipeline orchestration framework
│   ├── clawmemory/              # Knowledge graph + token-budgeted recall
│   └── dashboard/               # React frontend + Express API
│       ├── src/                 # React 18 + Tailwind + Recharts
│       ├── server/              # Express API (15 endpoints + SSE)
│       └── tests/               # API route tests
├── tests/                       # Integration tests for all packages
├── codex/                       # SOVEREIGN learning engine
├── vitest.config.ts             # Test runner config with path aliases
├── tsconfig.json                # Root TypeScript config (ES2022, strict)
└── package.json                 # npm workspaces monorepo
```

## Test Suite

306 tests across 7 test files. All passing.

| Package | Tests | Coverage |
|---------|-------|----------|
| Shared (Session Graph) | 16 | Schema, CRUD, events, WAL mode |
| ClawForge | 39 | Init, audit, status, event emission, lifecycle |
| ClawGuard | 53 | Policy engine, kill switch, threat intel, runtime monitor, attack scenarios |
| ClawBudget | 47 | Budget limits, smart routing, context surgery, heartbeat detection |
| ClawPipe | 69 | YAML parsing, sequential/parallel execution, conditionals, variables, validation |
| ClawMemory | 60 | Entity extraction, knowledge graph traversal, token recall, compaction, cross-product |
| Dashboard | 22 | API routes for all 15 endpoints |

## Pricing

| Tier | Price | What You Get |
|------|-------|--------------|
| **Free** | $0 | ClawForge CLI + basic threat monitoring + session spending limits |
| **Pro** | $29/mo | Full ClawGuard + SmartRouter model optimization + ClawMemory + basic pipelines |
| **Team** | $99/mo | Pro + 5 agent seats + shared threat intelligence feed |
| **Enterprise** | $2,500-10K/mo | Everything + compliance reporting + audit trails + RBAC + SLA |

## Built With

- **TypeScript** — strict mode, ES2022 target, full type coverage
- **SQLite** (better-sqlite3) — local-first, zero ops, WAL mode
- **React 18** + Tailwind CSS + Recharts — dashboard UI
- **Express** — API server with SSE real-time events
- **Vitest** — test runner with path aliases across all packages
- **SOVEREIGN** — agentic development framework (this entire stack was built by coordinated AI agents)

## Author

Built by Imani ([@Skunkworks0x](https://x.com/Skunkworks0x))

## License

MIT
