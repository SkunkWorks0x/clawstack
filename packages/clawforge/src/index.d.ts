/**
 * ClawForge — Secure Deployment & Lifecycle Management
 * "From zero to secure in one command."
 *
 * npx clawforge init   → secure setup + agent registration
 * npx clawforge audit  → scan existing deployment
 * npx clawforge status → agent status from Session Graph
 */
export declare const VERSION = "0.1.0";
export { init } from './commands/init.js';
export type { InitResult, InitOptions } from './commands/init.js';
export { audit } from './commands/audit.js';
export type { AuditResult, AuditOptions } from './commands/audit.js';
export { status } from './commands/status.js';
export type { StatusResult, StatusOptions } from './commands/status.js';
export { checkGatewayBinding, checkTokenStrength, checkDockerSandbox, checkConfigPermissions, checkExposedPorts, checkOpenClawVersion, checkOpenClaw, checkDocker, getSystemInfo, formatReportCard, formatSecurityCheck, } from './utils.js';
export type { OpenClawConfig, OpenClawStatus, DockerStatus, SystemInfo, SecurityCheck, CheckResult, } from './utils.js';
//# sourceMappingURL=index.d.ts.map