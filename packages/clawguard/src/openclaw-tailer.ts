/**
 * OpenClaw Session Transcript Tailer
 *
 * Watches ~/.openclaw/agents/main/sessions/*.jsonl for new entries.
 * Parses each line into ClawGuard behavior events and feeds them
 * through RuntimeMonitor.intercept*() methods.
 *
 * This is the "quick win" — passive monitoring with zero OpenClaw
 * plugin installation. Just point it at the session directory.
 */

import { watch, readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, basename } from 'path';
import type { SessionGraph, EventBus } from '@clawstack/shared';
import { RuntimeMonitor } from './runtime-monitor.js';
import type { MonitorConfig } from './runtime-monitor.js';

// ─── OpenClaw JSONL Types ─────────────────────────────────────────

export interface OpenClawToolCall {
  type: 'toolCall';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface OpenClawMessage {
  role: 'user' | 'assistant' | 'toolResult';
  content: Array<{ type: string; [key: string]: unknown }>;
  model?: string;
  provider?: string;
  usage?: {
    input: number;
    output: number;
    totalTokens: number;
    cost?: { total: number };
  };
  toolName?: string;
  toolCallId?: string;
  isError?: boolean;
  details?: Record<string, unknown>;
}

export interface OpenClawJSONLEntry {
  type: 'session' | 'message' | 'model_change' | 'thinking_level_change' | 'custom';
  id: string;
  parentId?: string | null;
  timestamp: string;
  message?: OpenClawMessage;
  // session header fields
  version?: number;
  cwd?: string;
}

// ─── Tailer Config ────────────────────────────────────────────────

export interface TailerConfig {
  /** Path to OpenClaw sessions directory */
  sessionsDir: string;
  /** ClawStack agent ID to record events under */
  agentId: string;
  /** ClawStack session ID to record events under */
  sessionId: string;
  /** RuntimeMonitor config overrides */
  monitorConfig?: MonitorConfig;
  /** Callback on each processed event */
  onEvent?: (event: TailerEvent) => void;
  /** Callback on errors */
  onError?: (error: Error) => void;
}

export interface TailerEvent {
  openclawEntryId: string;
  toolName: string;
  action: 'tool_call' | 'network_request' | 'file_access' | 'process_spawn' | 'cost_event';
  allowed: boolean;
  threatLevel: string;
  threatSignature: string | null;
  timestamp: string;
}

// ─── Default sessions directory ───────────────────────────────────

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';
export const DEFAULT_SESSIONS_DIR = join(HOME, '.openclaw', 'agents', 'main', 'sessions');

// ─── OpenClawTailer ───────────────────────────────────────────────

export class OpenClawTailer {
  private monitor: RuntimeMonitor;
  private config: TailerConfig;
  private fileOffsets: Map<string, number> = new Map();
  private watcher: ReturnType<typeof watch> | null = null;
  private running = false;
  private processedEntries = 0;

  constructor(
    graph: SessionGraph,
    bus: EventBus,
    config: TailerConfig
  ) {
    this.config = config;
    this.monitor = new RuntimeMonitor(graph, bus, config.monitorConfig);
  }

  getMonitor(): RuntimeMonitor {
    return this.monitor;
  }

  getProcessedCount(): number {
    return this.processedEntries;
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Start tailing. Reads existing files from current offset,
   * then watches for new files and appended lines.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    const { sessionsDir } = this.config;

    if (!existsSync(sessionsDir)) {
      this.running = false;
      throw new Error(`Sessions directory does not exist: ${sessionsDir}`);
    }

    // Process existing JSONL files
    this.scanExistingFiles();

    // Watch for changes
    this.watcher = watch(sessionsDir, (eventType, filename) => {
      if (!filename || !filename.endsWith('.jsonl')) return;
      const filePath = join(sessionsDir, filename);
      if (existsSync(filePath)) {
        this.processFile(filePath);
      }
    });
  }

  /**
   * Stop tailing and release the fs watcher.
   */
  stop(): void {
    this.running = false;
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Process a single JSONL line. Exposed for testing and direct feeding.
   */
  async processLine(line: string): Promise<TailerEvent | null> {
    const trimmed = line.trim();
    if (!trimmed) return null;

    let entry: OpenClawJSONLEntry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      return null;
    }

    // Only process message entries
    if (entry.type !== 'message' || !entry.message) return null;

    const { message } = entry;

    // Handle assistant messages with tool calls
    if (message.role === 'assistant' && message.content) {
      const toolCalls = message.content
        .filter(c => c.type === 'toolCall')
        .map(c => c as unknown as OpenClawToolCall);

      let lastEvent: TailerEvent | null = null;
      for (const tc of toolCalls) {
        const result = await this.processToolCall(entry, tc);
        if (result) lastEvent = result;
      }

      // Process cost events from usage data
      if (message.usage?.totalTokens) {
        await this.processCostEvent(entry, message.usage.totalTokens);
      }

      return lastEvent;
    }

    return null;
  }

  // ─── Internal ───────────────────────────────────────────────────

  private scanExistingFiles(): void {
    const { sessionsDir } = this.config;
    let files: string[];
    try {
      files = readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
    } catch {
      return;
    }

    // Seek to the END of all existing files so only new lines
    // written after start() are processed. This prevents replaying
    // historical events which floods the monitor on startup.
    for (const file of files) {
      const filePath = join(sessionsDir, file);
      try {
        const stat = statSync(filePath);
        this.fileOffsets.set(filePath, stat.size);
      } catch {
        // File disappeared between readdir and stat — ignore
      }
    }
  }

  private processFile(filePath: string): void {
    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      return;
    }

    const currentOffset = this.fileOffsets.get(filePath) ?? 0;
    if (stat.size <= currentOffset) return;

    // Read only new bytes
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Find the line offset corresponding to byte offset
    let bytesSeen = 0;
    let startLine = 0;
    for (let i = 0; i < lines.length; i++) {
      if (bytesSeen >= currentOffset) {
        startLine = i;
        break;
      }
      bytesSeen += Buffer.byteLength(lines[i] + '\n', 'utf-8');
    }

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      // Fire and forget — errors handled via onError callback
      this.processLine(line).catch(err => {
        this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
      });
    }

    this.fileOffsets.set(filePath, stat.size);
  }

  private async processToolCall(
    entry: OpenClawJSONLEntry,
    tc: OpenClawToolCall
  ): Promise<TailerEvent | null> {
    const { agentId, sessionId } = this.config;
    const args = tc.arguments;

    try {
      switch (tc.name) {
        case 'exec': {
          const command = String(args.command || '');
          const parts = command.split(/\s+/);
          const result = await this.monitor.interceptProcessSpawn(sessionId, agentId, {
            command: parts[0] || command,
            args: parts.slice(1),
            cwd: args.cwd as string | undefined,
          });
          return this.emitEvent(entry, tc.name, 'process_spawn', result);
        }

        case 'read': {
          const result = await this.monitor.interceptFileAccess(sessionId, agentId, {
            path: String(args.file_path || args.path || ''),
            operation: 'read',
          });
          return this.emitEvent(entry, tc.name, 'file_access', result);
        }

        case 'write': {
          const content = String(args.content || '');
          const result = await this.monitor.interceptFileAccess(sessionId, agentId, {
            path: String(args.file_path || args.path || ''),
            operation: 'write',
            size: Buffer.byteLength(content, 'utf-8'),
          });
          return this.emitEvent(entry, tc.name, 'file_access', result);
        }

        case 'edit':
        case 'apply_patch': {
          const result = await this.monitor.interceptFileAccess(sessionId, agentId, {
            path: String(args.file_path || args.path || ''),
            operation: 'write',
          });
          return this.emitEvent(entry, tc.name, 'file_access', result);
        }

        case 'web_fetch':
        case 'http': {
          const url = String(args.url || '');
          let hostname = '';
          try { hostname = new URL(url).hostname; } catch { hostname = url; }
          const result = await this.monitor.interceptNetworkRequest(sessionId, agentId, {
            url,
            method: String(args.method || 'GET'),
            hostname,
          });
          return this.emitEvent(entry, tc.name, 'network_request', result);
        }

        default:
          // Unknown tool — record as generic tool_call via process spawn
          // so PolicyEngine still evaluates it
          return null;
      }
    } catch (err) {
      this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }

  private async processCostEvent(
    entry: OpenClawJSONLEntry,
    totalTokens: number
  ): Promise<void> {
    const { agentId, sessionId } = this.config;
    try {
      await this.monitor.interceptCostEvent(sessionId, agentId, totalTokens);
    } catch (err) {
      this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private emitEvent(
    entry: OpenClawJSONLEntry,
    toolName: string,
    action: TailerEvent['action'],
    result: { allowed: boolean; event: { threatLevel: string; threatSignature: string | null }; detection: unknown }
  ): TailerEvent {
    this.processedEntries++;
    const event: TailerEvent = {
      openclawEntryId: entry.id,
      toolName,
      action,
      allowed: result.allowed,
      threatLevel: result.event.threatLevel,
      threatSignature: result.event.threatSignature,
      timestamp: entry.timestamp,
    };
    this.config.onEvent?.(event);
    return event;
  }
}
