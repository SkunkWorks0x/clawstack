/**
 * clawforge init — Secure OpenClaw Setup
 *
 * 1. Detects OS + arch
 * 2. Checks OpenClaw installation + version (CVE check)
 * 3. Verifies Docker is running
 * 4. Checks gateway binding (must be loopback, not 0.0.0.0)
 * 5. Generates secure tokens
 * 6. Creates .clawstack/ directory
 * 7. Registers agent in the Agent Session Graph
 * 8. Emits session.started to Event Bus
 * 9. Outputs security report card
 */
import type { AgentIdentity } from '@clawstack/shared';
import { type SecurityCheck } from '../utils.js';
export interface InitResult {
    agent: AgentIdentity;
    sessionId: string;
    clawstackDir: string;
    checks: SecurityCheck[];
    report: string;
}
export interface InitOptions {
    dbPath?: string;
    cwd?: string;
}
export declare function init(opts?: InitOptions): Promise<InitResult>;
//# sourceMappingURL=init.d.ts.map