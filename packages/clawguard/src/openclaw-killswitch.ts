/**
 * OpenClaw Gateway Kill Switch Connector
 *
 * Connects to the OpenClaw Gateway WebSocket (ws://127.0.0.1:18789)
 * as an operator. When ClawGuard's KillSwitch fires, sends a session
 * termination command via the Gateway protocol.
 *
 * This makes the kill switch actually stop the agent, not just log it.
 *
 * Gateway Protocol:
 *   Request:  { type: "req", id, method, params }
 *   Response: { type: "res", id, ok, payload | error }
 *   Event:    { type: "event", event, payload }
 */

import { randomUUID } from 'crypto';
import type { EventBus, BusEvent } from '@clawstack/shared';

// ─── Types ────────────────────────────────────────────────────────

export interface GatewayConfig {
  /** Gateway WebSocket URL. Default: ws://127.0.0.1:18789 */
  url?: string;
  /** Gateway auth token */
  token?: string;
  /** Auto-reconnect on disconnect */
  reconnect?: boolean;
  /** Max reconnect attempts */
  maxReconnectAttempts?: number;
  /** Reconnect delay in ms */
  reconnectDelayMs?: number;
  /** Callback on connection state changes */
  onStateChange?: (state: ConnectionState) => void;
  /** Callback on errors */
  onError?: (error: Error) => void;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'authenticated';

export interface GatewayRequest {
  type: 'req';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface GatewayResponse {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
}

export interface KillResult {
  success: boolean;
  sessionKey: string;
  method: string;
  error?: string;
  timestamp: string;
}

// ─── WebSocket Abstraction ────────────────────────────────────────
// Allows injection of a mock for testing without real WebSocket deps

export interface GatewaySocket {
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  readyState: number;
}

export type SocketFactory = (url: string) => GatewaySocket;

// ─── OpenClawKillSwitch ──────────────────────────────────────────

export class OpenClawKillSwitch {
  private config: Required<Omit<GatewayConfig, 'onStateChange' | 'onError'>> & Pick<GatewayConfig, 'onStateChange' | 'onError'>;
  private socket: GatewaySocket | null = null;
  private socketFactory: SocketFactory | null;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private pendingRequests: Map<string, { resolve: (res: GatewayResponse) => void; timer: ReturnType<typeof setTimeout> }> = new Map();
  private unsubscribe: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private killCount = 0;

  constructor(
    private bus: EventBus,
    config?: GatewayConfig,
    socketFactory?: SocketFactory
  ) {
    this.config = {
      url: config?.url ?? 'ws://127.0.0.1:18789',
      token: config?.token ?? '',
      reconnect: config?.reconnect ?? true,
      maxReconnectAttempts: config?.maxReconnectAttempts ?? 5,
      reconnectDelayMs: config?.reconnectDelayMs ?? 2000,
      onStateChange: config?.onStateChange,
      onError: config?.onError,
    };
    this.socketFactory = socketFactory ?? null;
  }

  getState(): ConnectionState {
    return this.state;
  }

  getKillCount(): number {
    return this.killCount;
  }

  /**
   * Connect to the Gateway and start listening for kill switch events.
   */
  async connect(): Promise<void> {
    this.setState('connecting');

    try {
      if (this.socketFactory) {
        this.socket = this.socketFactory(this.config.url);
      } else {
        // Dynamic import WebSocket — works in Node 22+ (built-in) or via 'ws'
        const WS = (globalThis as any).WebSocket ?? (await import(/* webpackIgnore: true */ 'ws' as string)).default;
        this.socket = new WS(this.config.url) as unknown as GatewaySocket;
      }
    } catch (err) {
      this.setState('disconnected');
      throw new Error(`Failed to create WebSocket: ${err}`);
    }

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.setState('connected');
      this.authenticate();
    };

    this.socket.onmessage = (ev) => {
      this.handleMessage(ev.data);
    };

    this.socket.onclose = () => {
      this.setState('disconnected');
      this.attemptReconnect();
    };

    this.socket.onerror = (ev) => {
      this.config.onError?.(new Error(`WebSocket error: ${ev}`));
    };

    // Subscribe to kill switch events on the EventBus
    this.unsubscribe = this.bus.on('behavior.blocked', (event: BusEvent) => {
      const payload = event.payload as Record<string, unknown>;
      if (payload.action === 'kill_switch') {
        this.terminateSession(
          String(payload.sessionId || ''),
          String(payload.agentId || ''),
          String(payload.reason || 'ClawGuard kill switch')
        ).catch(err => {
          this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
        });
      }
    });
  }

  /**
   * Disconnect from the Gateway and stop listening.
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    // Reject pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.resolve({ type: 'res', id, ok: false, error: { code: 'DISCONNECTED', message: 'Connection closed' } });
    }
    this.pendingRequests.clear();

    if (this.socket) {
      this.socket.onclose = null; // prevent reconnect
      this.socket.close();
      this.socket = null;
    }
    this.setState('disconnected');
  }

  /**
   * Send a session termination command to the Gateway.
   */
  async terminateSession(sessionKey: string, agentId: string, reason: string): Promise<KillResult> {
    const timestamp = new Date().toISOString();

    // Try sessions.stop first (primary method)
    const stopResult = await this.sendRequest('sessions.stop', {
      sessionKey: sessionKey || `agent:${agentId}`,
      reason,
    });

    if (stopResult.ok) {
      this.killCount++;
      return {
        success: true,
        sessionKey: sessionKey || `agent:${agentId}`,
        method: 'sessions.stop',
        timestamp,
      };
    }

    // Fallback: try agent.stop
    const agentStopResult = await this.sendRequest('agent.stop', {
      agentId: agentId || 'main',
      reason,
    });

    if (agentStopResult.ok) {
      this.killCount++;
      return {
        success: true,
        sessionKey: sessionKey || `agent:${agentId}`,
        method: 'agent.stop',
        timestamp,
      };
    }

    return {
      success: false,
      sessionKey: sessionKey || `agent:${agentId}`,
      method: 'sessions.stop',
      error: stopResult.error?.message ?? 'Unknown error',
      timestamp,
    };
  }

  /**
   * Send an RPC request to the Gateway and wait for response.
   */
  async sendRequest(method: string, params: Record<string, unknown>): Promise<GatewayResponse> {
    if (!this.socket || this.state === 'disconnected') {
      return {
        type: 'res',
        id: 'none',
        ok: false,
        error: { code: 'NOT_CONNECTED', message: 'Not connected to Gateway' },
      };
    }

    const id = randomUUID();
    const request: GatewayRequest = { type: 'req', id, method, params };

    return new Promise<GatewayResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        resolve({
          type: 'res',
          id,
          ok: false,
          error: { code: 'TIMEOUT', message: `Request ${method} timed out` },
        });
      }, 10_000);

      this.pendingRequests.set(id, { resolve, timer });

      try {
        this.socket!.send(JSON.stringify(request));
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        resolve({
          type: 'res',
          id,
          ok: false,
          error: { code: 'SEND_FAILED', message: String(err) },
        });
      }
    });
  }

  // ─── Internal ───────────────────────────────────────────────────

  private handleMessage(data: string): void {
    let msg: GatewayResponse;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (msg.type === 'res' && msg.id) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.id);
        pending.resolve(msg);
      }
    }

    // Handle auth challenge response
    if ((msg as any).type === 'event' && (msg as any).event === 'hello-ok') {
      this.setState('authenticated');
    }
  }

  private authenticate(): void {
    if (!this.socket || !this.config.token) return;

    const handshake = {
      type: 'req',
      id: randomUUID(),
      method: 'connect',
      params: {
        protocolVersion: { min: 1, max: 1 },
        role: 'operator',
        token: this.config.token,
        client: { name: 'clawguard', version: '0.1.0' },
      },
    };

    try {
      this.socket.send(JSON.stringify(handshake));
    } catch (err) {
      this.config.onError?.(new Error(`Auth handshake failed: ${err}`));
    }
  }

  private attemptReconnect(): void {
    if (!this.config.reconnect) return;
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) return;

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(err => {
        this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
      });
    }, this.config.reconnectDelayMs);
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.config.onStateChange?.(state);
  }
}
