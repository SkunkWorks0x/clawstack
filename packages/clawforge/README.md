# ClawForge

Secure deployment and lifecycle management for OpenClaw agents. ClawForge scans your OpenClaw installation for security misconfigurations (exposed ports, weak tokens, missing sandboxes, known CVEs), registers agents in the ClawStack Session Graph, and gives you a single command to go from zero to secure.

## Quick Start

```bash
# Initialize secure OpenClaw setup + register agent
npx clawforge init

# Audit an existing OpenClaw installation
npx clawforge audit

# Check agent status from the Session Graph
npx clawforge status
```

## Commands

### `clawforge init`

Detects your OS and architecture, checks OpenClaw installation and version (including CVE-2026-25253), verifies Docker sandbox availability, audits gateway binding and token strength, generates secure tokens, creates a `.clawstack/` configuration directory, and registers your agent in the Agent Session Graph.

### `clawforge audit`

Runs a security audit against your existing OpenClaw configuration without modifying anything. Checks gateway binding, token strength, Docker sandbox status, exposed ports, config file permissions, and version security.

### `clawforge status`

Reads your local `.clawstack/config.json` and queries the Agent Session Graph for live agent state — identity, active sessions, and cost tracking.

## Part of ClawStack

ClawStack is the operating system for OpenClaw agents — security, cost control, memory, orchestration, and deployment on one shared primitive.

[github.com/Skunkworks0x/clawstack](https://github.com/Skunkworks0x/clawstack)
