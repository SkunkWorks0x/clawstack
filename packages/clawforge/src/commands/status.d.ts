/**
 * clawforge status — Agent Status from Session Graph
 *
 * Reads .clawstack/config.json to find the local agent,
 * then queries the Agent Session Graph for live state.
 */
export interface StatusResult {
    found: boolean;
    agentId: string | null;
    agentName: string | null;
    platform: string | null;
    version: string | null;
    dockerSandboxed: boolean | null;
    activeSessions: number;
    totalCost: {
        tokens: number;
        costUsd: number;
        calls: number;
    } | null;
    report: string;
}
export interface StatusOptions {
    cwd?: string;
    dbPath?: string;
}
export declare function status(opts?: StatusOptions): StatusResult;
//# sourceMappingURL=status.d.ts.map