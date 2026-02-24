/**
 * clawforge audit — Security Audit for Existing OpenClaw Installation
 *
 * Checks:
 *  1. Gateway binding (loopback vs 0.0.0.0)
 *  2. Token strength (length, placeholder detection)
 *  3. Docker sandbox status
 *  4. Exposed ports (18789)
 *  5. Config file permissions (should be 600)
 *  6. Version security (CVE-2026-25253 check)
 */
import { type SecurityCheck } from '../utils.js';
export interface AuditResult {
    checks: SecurityCheck[];
    report: string;
}
export interface AuditOptions {
    openClawHome?: string;
}
export declare function audit(opts?: AuditOptions): AuditResult;
//# sourceMappingURL=audit.d.ts.map