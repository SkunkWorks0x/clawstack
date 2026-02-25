# INTEL: OpenClaw Integration for ClawGuard RuntimeMonitor

**Type:** FINDING
**Confidence:** VERIFIED (local filesystem inspected, web docs fetched, codebase read)
**Date:** 2026-02-25
**Author:** @ORACLE

---

## 1. OpenClaw Installation on This Machine

OpenClaw `2026.2.24` is installed globally via npm and actively running.

### Key Paths

| Path | Purpose |
|------|---------|
| `~/.openclaw/openclaw.json` | Main config (model, sandbox, gateway, plugins) |
| `~/.openclaw/agents/main/sessions/*.jsonl` | Session transcripts (append-only, 6 files) |
| `~/.openclaw/agents/main/agent/models.json` | Model config (Grok 4.1 Fast Reasoning via xAI) |
| `~/.openclaw/sandbox/containers.json` | Active Docker sandbox registry |
| `~/.openclaw/sandboxes/agent-main-f331f052/` | Sandbox workspace volume (mounted into container) |
| `~/.openclaw/logs/gateway.log` | Gateway runtime log |
| `~/.openclaw/logs/gateway.err.log` | Gateway error log |
| `~/.openclaw/logs/config-audit.jsonl` | Config change audit trail |
| `~/.openclaw/workspace/` | Agent personality files (SOUL.md, USER.md, IDENTITY.md) |
| `~/.openclaw/exec-approvals.json` | Execution approval allowlist (currently empty) |
| `~/.openclaw/hooks/` | External hook handler directory |

### Active Docker Sandbox

```
Container: openclaw-sbx-agent-main-f331f052
Image:     openclaw-sandbox:bookworm-slim (138MB)
Status:    Up 4 days
Mode:      "all" (every session containerized)
Scope:     agent (one container per agent)
```

50 skills installed in sandbox workspace under `~/.openclaw/sandboxes/agent-main-f331f052/skills/`.

### Agent Identity

- **Name:** Blade (this is the agent's persona name, NOT a separate tool)
- **Primary model:** `xai/grok-4-1-fast-reasoning` (131K context)
- **Fallback models:** Claude Sonnet 4.5, Claude Opus 4.5/4.6 (via Google Antigravity OAuth)
- **Telegram:** enabled (DM pairing, group allowlist, partial streaming)
- **Gateway:** port 18789, loopback-only, token auth

---

## 2. OpenClaw Architecture Overview

### Hub-and-Spoke Design

OpenClaw centers on a **Gateway** process (Node.js, WebSocket on `ws://127.0.0.1:18789`) that manages:

- WebSocket protocol for all clients (CLI, web UI, macOS app, mobile/headless nodes)
- Message routing from channels (Telegram, Discord, Slack, WhatsApp, Signal, iMessage, Teams)
- Session state as append-only JSONL
- Tool policy enforcement and approval workflows
- Cron scheduling and presence tracking

### Agent Execution Pipeline

```
Inbound Message -> Normalize Envelope -> Route to Gateway
  -> Access Control (dmPolicy) -> Resolve Session Key
  -> Load Transcript -> Build System Prompt -> Call AI Model
  -> Execute Tools (Sandbox?) -> Save Transcript
  -> Format Reply -> Deliver to User
```

---

## 3. How Agents Emit Events

OpenClaw has **two event systems**:

### 3a. Gateway Protocol Events (Internal)

The Gateway broadcasts events over WebSocket to connected clients:

- **Lifecycle events:** Phase transitions (`start` / `end` / `error`)
- **Assistant stream:** Model reasoning and text deltas
- **Tool stream:** Tool invocation events (`stream: "tool"` with `start` / `update` / `end`)
- **Approval events:** `exec.approval.requested` when ops need human sign-off
- **Heartbeat ticks:** Periodic liveness signals

All events flow through `subscribeEmbeddedPiSession`, bridging the pi-agent-core runtime to OpenClaw's event model.

### 3b. claw.events (External Pub/Sub)

Separate real-time pub/sub for inter-agent coordination:

- **Transport:** Centrifugo (Go) for WebSocket, Hono/TypeScript API for auth
- **Storage:** Redis for state (locks, permissions, rate limits)
- **Channels:** `public.*` (open), `agent.<user>.<topic>` (owner-publish), `system.timer.*` (server-generated)
- **CLI:** `claw.events pub/sub/subexec`
- **Limits:** 5 msg/s/user on public, 16KB max payload, no durable persistence

---

## 4. WebSocket Protocol Details

**Source:** `src/gateway/protocol/schema.ts` (TypeBox schemas)
**Docs:** https://docs.openclaw.ai/gateway/protocol

### Frame Types

```
Request:  { type: "req",   id, method, params }
Response: { type: "res",   id, ok, payload | error }
Event:    { type: "event", event, payload, seq?, stateVersion? }
```

### Handshake

1. Gateway sends: `{ event: "connect.challenge", payload: { nonce, ts } }`
2. Client responds: protocol version, client metadata, role (`operator` | `node`), auth token, device identity (Ed25519 public key + nonce signature)
3. Gateway returns: `hello-ok` with protocol version, tick interval, device token

### Client Roles

| Role | Purpose | Key Scopes |
|------|---------|------------|
| `operator` | Control plane (CLI, web UI, automation) | `operator.read`, `operator.write`, `operator.admin`, `operator.approvals` |
| `node` | Capability host (camera, screen, canvas, voice) | Declares `caps`, `commands`, `permissions` |

### RPC Methods

- `tools.catalog` -- runtime tool inventory with provenance
- `skills.bins` -- executable lists for auto-approval
- `system-presence` -- connected devices with roles
- `exec.approval.resolve` -- resolve pending approvals
- `device.token.rotate` / `device.token.revoke` -- credential management

---

## 5. Where OpenClaw Logs Agent Actions

### Session Transcripts (Primary)

```
~/.openclaw/agents/<agentId>/sessions/<SessionId>.jsonl
```

Each line is a JSON `AgentMessage`:
```json
{
  "type": "message",
  "timestamp": "2026-02-22T...",
  "message": {
    "role": "assistant",
    "content": [
      { "type": "toolCall", "toolName": "exec", "params": { "command": "ls" } }
    ],
    "usage": { "cost": { "total": 0.0023 } }
  }
}
```

Extract tool calls: `jq 'select(.message.content[].type == "toolCall")' session.jsonl`

### Command Logger (Bundled Hook)

```
~/.openclaw/logs/commands.log
```

### Telemetry Plugin (knostic/openclaw-telemetry)

Optional plugin providing comprehensive JSONL logging at `~/.openclaw/logs/telemetry.jsonl`:

| Event Type | Captures |
|------------|----------|
| `tool.start` | Tool name, parameters |
| `tool.end` | Duration, success/failure, error |
| `message.in` | Channel, sender, content length |
| `message.out` | Channel, recipient, delivery status |
| `llm.usage` | Token counts, cost, duration, model |
| `agent.start` | Session key, agent ID, prompt length |
| `agent.end` | Duration, success/failure |

Features: SHA-256 hash chain for tamper detection, automatic credential redaction, syslog forwarding (CEF/JSON for SIEM), rate limiting, log rotation with compression.

---

## 6. OpenClaw Hook System (Interception Points)

### Plugin Hook System (In-Process)

These fire within the agent pipeline with full access to modify behavior:

| Hook | Purpose | ClawGuard Relevance |
|------|---------|-------------------|
| `before_tool_call` | Intercept/modify tool params pre-execution; **can block** | **PRIMARY** -- intercept all tool calls |
| `after_tool_call` | Inspect tool results post-execution | Audit trail, anomaly detection |
| `tool_result_persist` | Transform results before writing to session | Redaction, metadata injection |
| `before_model_resolve` | Override provider/model selection | Cost control (ClawBudget) |
| `before_prompt_build` | Inject context or modify system prompt | Policy injection |
| `before_agent_start` | Capture agent initialization | Session registration |
| `agent_end` | Inspect final message list | Session wrap-up |
| `message_received` / `message_sent` | Capture inbound/outbound messages | Channel monitoring |
| `before_compaction` / `after_compaction` | Observe message compaction | Context window tracking |

### External Hook Handler System

Scripts in `~/.openclaw/hooks/` or `<workspace>/hooks/`:
- Events: `command:new`, `command:reset`, `command:stop`, `agent:bootstrap`, `gateway:startup`
- Each hook needs `HOOK.md` metadata + `handler.ts` implementation

**CRITICAL GAP:** External hooks do NOT receive `tool.*` or `llm.*` events. Per GitHub Discussion #20575, plugins requiring per-turn tool events must use the Plugin API, not external hooks.

---

## 7. Docker Sandbox Communication

### Host-to-Sandbox

- Gateway process runs on **host** -- sandbox only executes tool operations
- Tool calls are dispatched from host Gateway into container via Docker exec
- Sandboxed operations: `exec`, `read`, `write`, `edit`, `apply_patch`, `process`
- Non-sandboxed: Gateway itself, explicitly host-allowed tools, "elevated exec" escape hatch

### Sandbox Modes

| Mode | Behavior |
|------|----------|
| `off` | Disabled |
| `non-main` | Only non-main sessions (default) |
| `all` | Every session containerized (**current config**) |

### Sandbox Scopes

| Scope | Behavior |
|-------|----------|
| `session` | One container per session (default) |
| `agent` | One container per agent (**current config**) |
| `shared` | Single container for all |

### Filesystem Access

| Level | Behavior |
|-------|----------|
| `none` | Isolated workspace under `~/.openclaw/sandboxes` (default) |
| `ro` | Read-only agent workspace at `/agent` |
| `rw` | Read-write workspace at `/workspace` |

### Security Boundaries

- Blocks: `docker.sock`, `/etc`, `/proc`, `/sys`, `/dev`
- Custom bind mounts via config
- Default network isolation (no host mode, no namespace joins)
- TTL-based container cleanup (default 1 hour)

---

## 8. Current ClawGuard Architecture

### RuntimeMonitor

**File:** `packages/clawguard/src/runtime-monitor.ts`

Operates **outside the LLM context window** -- cannot be prompt-injected. Process-level monitoring of network, filesystem, process spawning, and cost anomalies.

```typescript
constructor(graph: SessionGraph, bus: EventBus, config?: MonitorConfig)
```

**Interception Methods:**
- `interceptNetworkRequest(sessionId, agentId, details)` -- exfiltration, blocked domains
- `interceptFileAccess(sessionId, agentId, details)` -- sensitive paths, sandbox escapes
- `interceptProcessSpawn(sessionId, agentId, details)` -- shell exec, blocked commands
- `interceptCostEvent(sessionId, agentId, details)` -- token spending anomalies

**Flow:**
```
Agent Action -> RuntimeMonitor.intercept*()
  -> PolicyEngine.evaluate*() -> ThreatDetection | null
  -> ThreatIntel.matchSignatures() -> upgrade level if matched
  -> SessionGraph.recordBehavior() -> persist BehaviorEvent
  -> EventBus.emit('behavior.detected')
  -> If blocked: EventBus.emit('behavior.blocked')
  -> If critical + autoKill: KillSwitch.kill() -> terminate session
```

### Agent Session Graph Platform Support

```typescript
graph.registerAgent({
  platform: 'openclaw' | 'custom',
  dockerSandboxed: boolean,
  // ...
})
```

The SessionGraph already supports `platform: 'openclaw'` and tracks Docker sandbox status.

### Existing OpenClaw Detection (ClawForge)

`packages/clawforge/src/utils.ts` already:
- Detects OpenClaw installation (`openclaw --version`)
- Reads `~/.openclaw/openclaw.json`
- Validates sandbox config
- Checks CVE-2026-25253 status

---

## 9. Third-Party Monitoring Ecosystem

| Tool | What It Does | License |
|------|-------------|---------|
| [knostic/openclaw-telemetry](https://github.com/knostic/openclaw-telemetry) | Full JSONL + syslog telemetry with SIEM integration | Apache 2.0 |
| [ClawBands](https://github.com/SeyZ/clawbands) | Security middleware: pause + approve before dangerous actions | OSS |
| [Tool Guard](https://openclawdir.com/plugins/tool-guard-9i24v4) | Plugin for tool access control | -- |
| [mission-control](https://github.com/crshdn/mission-control) | Agent orchestration dashboard via Gateway | OSS |

---

## 10. Integration Plan: ClawGuard RuntimeMonitor <-> OpenClaw Events

### Strategy: OpenClaw Plugin Adapter

Build an OpenClaw plugin that acts as a bridge between OpenClaw's internal event system and ClawGuard's RuntimeMonitor. This is the **only reliable path** -- external hooks don't receive tool events.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   OpenClaw Gateway                      │
│                                                         │
│  Agent Loop -> Tool Call -> Plugin Hook System           │
│                               │                         │
│                    ┌──────────┴──────────┐              │
│                    │  clawguard-plugin   │              │
│                    │  (OpenClaw Plugin)  │              │
│                    └──────────┬──────────┘              │
│                               │                         │
└───────────────────────────────┼─────────────────────────┘
                                │ IPC (Unix socket or HTTP localhost)
                                ▼
┌───────────────────────────────────────────────────────────┐
│              ClawGuard Process (Separate)                  │
│                                                           │
│  RuntimeMonitor                                           │
│    ├── interceptNetworkRequest()  ← network tool calls    │
│    ├── interceptFileAccess()      ← read/write/edit calls │
│    ├── interceptProcessSpawn()    ← exec tool calls       │
│    └── interceptCostEvent()       ← llm.usage events      │
│                                                           │
│  SessionGraph ← recordBehavior()                          │
│  EventBus     ← emit behavior.detected / behavior.blocked│
│  KillSwitch   ← terminate via Gateway RPC if critical     │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### Implementation Steps

#### Phase 1: OpenClaw Plugin (`clawguard-openclaw-plugin`)

**Purpose:** Hook into OpenClaw's plugin system, extract events, forward to ClawGuard.

```
packages/clawguard-openclaw/
  ├── package.json          # openclaw plugin manifest
  ├── src/
  │   ├── index.ts          # Plugin entry: register hooks
  │   ├── event-mapper.ts   # Map OpenClaw tool events -> ClawGuard intercept calls
  │   ├── ipc-client.ts     # Connect to ClawGuard process
  │   └── types.ts          # Shared types
  └── HOOK.md               # Plugin metadata
```

**Hook Registrations:**

| OpenClaw Hook | ClawGuard Method | Blocking? |
|--------------|-----------------|-----------|
| `before_tool_call` (exec) | `interceptProcessSpawn()` | YES -- can block |
| `before_tool_call` (read/write/edit) | `interceptFileAccess()` | YES -- can block |
| `after_tool_call` (web_fetch/http) | `interceptNetworkRequest()` | No (post-hoc audit) |
| `llm.usage` (via telemetry) | `interceptCostEvent()` | No (anomaly detection) |
| `before_agent_start` | `SessionGraph.registerAgent()` | No |
| `agent_end` | `SessionGraph.endSession()` | No |

**Critical design choice:** `before_tool_call` is the only hook that can **block** execution. This is where ClawGuard's process-level security enforcement happens.

#### Phase 2: IPC Layer

**Option A: Unix Domain Socket (Recommended)**

```
Socket: /tmp/clawguard.sock
Protocol: newline-delimited JSON
Latency: <1ms local
```

ClawGuard runs as a daemon. The plugin connects on startup, sends events, receives allow/block decisions synchronously for `before_tool_call`.

**Option B: HTTP Localhost**

```
Endpoint: http://127.0.0.1:18800/intercept
Protocol: JSON REST
Latency: ~2-5ms local
```

Simpler to debug but higher latency. Acceptable since tool calls already take 100ms+.

**Option C: In-Process (Embedded)**

Import ClawGuard directly into the plugin. Simplest, but couples ClawGuard to OpenClaw's Node.js process. Violates the "process-level security" principle -- a compromised agent process could disable ClawGuard.

**Recommendation:** Option A (Unix socket) for production, Option B (HTTP) for development/debugging.

#### Phase 3: Event Mapping

Map OpenClaw tool call parameters to ClawGuard's expected formats:

```typescript
// OpenClaw exec tool call
{ toolName: "exec", params: { command: "curl https://evil.com" } }
  -> interceptProcessSpawn(sessionId, agentId, {
       command: "curl",
       args: ["https://evil.com"],
       shell: true
     })

// OpenClaw write tool call
{ toolName: "write", params: { path: "/etc/passwd", content: "..." } }
  -> interceptFileAccess(sessionId, agentId, {
       path: "/etc/passwd",
       operation: "write"
     })

// OpenClaw read tool call
{ toolName: "read", params: { path: "~/.ssh/id_rsa" } }
  -> interceptFileAccess(sessionId, agentId, {
       path: "~/.ssh/id_rsa",
       operation: "read"
     })
```

#### Phase 4: Kill Switch Integration

When KillSwitch fires, ClawGuard needs to terminate the OpenClaw session:

1. Connect to Gateway WebSocket as `operator` role
2. Send RPC: `{ method: "sessions.stop", params: { sessionKey } }`
3. Optionally revoke device tokens: `{ method: "device.token.revoke" }`

This requires storing a Gateway auth token in ClawGuard's config.

#### Phase 5: Session Transcript Tailing (Passive Monitoring)

As a secondary data source, tail JSONL session files for offline analysis:

```
~/.openclaw/agents/main/sessions/*.jsonl
```

Use `fs.watch()` or `chokidar` to detect new lines. Parse tool calls for retrospective threat analysis without requiring the plugin to be installed.

### Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Plugin API instability (OpenClaw iterates fast) | High | Pin to specific OpenClaw version, abstract behind adapter interface |
| IPC latency adds to every tool call | Medium | Unix socket <1ms, benchmark at P99 |
| Agent process compromise disables in-process plugin | Critical | Run ClawGuard as separate process (Option A/B), not embedded |
| OpenClaw config changes break detection | Low | Watch `openclaw.json` for changes, re-validate on modify |
| `before_tool_call` hook removed in future version | High | Fall back to session transcript tailing (Phase 5) as degraded mode |
| Sandbox "elevated exec" bypasses monitoring | High | Monitor for elevated exec usage, flag as threat signature |

### New Threat Signatures to Add

```typescript
// For OpenClaw-specific threats
SIG_OPENCLAW_ELEVATED_EXEC    // Sandbox bypass via elevated exec
SIG_OPENCLAW_GATEWAY_EXPOSED  // Gateway bound to non-loopback
SIG_OPENCLAW_SANDBOX_DISABLED // Sandbox mode set to "off"
SIG_OPENCLAW_SKILL_SIDELOAD   // Skill installed outside normal flow
SIG_OPENCLAW_TOKEN_THEFT      // Agent accessing device auth tokens
```

### Deliverables

1. **`packages/clawguard-openclaw/`** -- OpenClaw plugin package (new)
2. **`packages/clawguard/src/adapters/openclaw.ts`** -- Adapter mapping OpenClaw events to RuntimeMonitor calls
3. **`packages/clawguard/src/ipc-server.ts`** -- Unix socket / HTTP server for receiving events from plugins
4. **`packages/clawguard/src/threat-intel.ts`** -- Add 5 new OpenClaw-specific signatures
5. **`packages/shared/session-graph/index.ts`** -- No changes needed (already supports `platform: 'openclaw'`)
6. **Tests** -- Integration tests using mock OpenClaw plugin events

### Priority Order

1. Session transcript tailing (Phase 5) -- quickest win, passive, no OpenClaw plugin needed
2. OpenClaw plugin with HTTP IPC (Phase 1 + 2B) -- full interception with blocking
3. Unix socket IPC (Phase 2A) -- production hardening
4. Kill switch Gateway integration (Phase 4) -- active response capability
5. New threat signatures (ongoing)

---

## Sources

- Local filesystem: `~/.openclaw/` directory tree (VERIFIED)
- https://docs.openclaw.ai/gateway/protocol
- https://docs.openclaw.ai/gateway/sandboxing
- https://docs.openclaw.ai/concepts/agent-loop
- https://github.com/openclaw/openclaw
- https://github.com/knostic/openclaw-telemetry
- https://github.com/openclaw/openclaw/discussions/20575
- https://github.com/SeyZ/clawbands
- https://mateffy.org/publications/introducing-claw-events
- ClawStack codebase: `packages/clawguard/`, `packages/shared/`, `packages/clawforge/`
