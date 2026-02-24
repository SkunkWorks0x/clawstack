# ClawStack

**The Operating System for OpenClaw Agents**

ClawStack is Rippling for AI agents. Five integrated products on one shared primitive — the Agent Session Graph.

## Products

| Product | What It Does | Status |
|---------|-------------|--------|
| **ClawForge** | One-command secure deployment | Phase 1 |
| **ClawGuard** | Runtime behavioral security (process-level, can't be prompt-injected) | Phase 1 |
| **ClawBudget** | Hard spending limits + smart model routing + context surgery | Phase 1 |
| **ClawPipe** | YAML-defined deterministic multi-agent pipelines | Phase 2 |
| **ClawMemory** | Knowledge graph memory with token-budgeted recall | Phase 2 |

## Architecture

Every product reads from and writes to the **Agent Session Graph** — a unified SQLite database capturing agent identity, behavior, cost, memory, lineage, and trust. Products communicate via the **Event Bus** (in-process pub/sub).

```
┌─────────────────────────────────────────────┐
│              Dashboard Shell                 │
│   Security │ Cost │ Memory │ Pipes │ Setup   │
├─────────────────────────────────────────────┤
│  ClawGuard │ ClawBudget │ ClawPipe │ ...    │
├─────────────────────────────────────────────┤
│              Event Bus (pub/sub)             │
├─────────────────────────────────────────────┤
│         Agent Session Graph (SQLite)         │
└─────────────────────────────────────────────┘
```

## Getting Started

```bash
# Clone the repo
git clone https://github.com/Skunkworks0x/clawstack.git
cd clawstack

# Install dependencies
npm install

# Run tests
npm test

# Build all packages
npm run build
```

## Monorepo Structure

```
clawstack/
├── CLAUDE.md                    # SOVEREIGN agent DNA
├── codex/                       # Learning engine (wins, fails, prompts, decisions)
├── packages/
│   ├── shared/                  # Agent Session Graph, Event Bus, types
│   ├── clawforge/               # Secure deployment
│   ├── clawguard/               # Runtime security
│   ├── clawbudget/              # Cost control
│   ├── clawpipe/                # Pipeline orchestration
│   ├── clawmemory/              # Knowledge graph memory
│   └── dashboard/               # Unified web UI
├── tests/
├── reviews/                     # SOVEREIGN review reports
├── intel/                       # Research findings
└── docs/
```

## Pricing

| Tier | Price | Includes |
|------|-------|----------|
| Free | $0 | ClawForge + basic monitoring + spending limits |
| Pro | $29/mo | Full ClawGuard + Smart Router + ClawMemory + basic ClawPipe |
| Team | $99/mo | Pro + 5 agent seats + shared threat feed |
| Enterprise | $2,500-10K/mo | Everything + compliance + audit trails + RBAC |

## Built With

- TypeScript, Node.js, React
- SQLite (better-sqlite3) — local-first, zero ops
- SOVEREIGN agentic development framework

## Author

Imani ([@Skunkworks0x](https://x.com/Skunkworks0x))

## License

MIT
