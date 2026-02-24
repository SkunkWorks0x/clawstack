/**
 * ClawForge Utilities — System Detection & Security Checks
 *
 * Real OpenClaw paths and defaults based on verified documentation:
 * - Config: ~/.openclaw/openclaw.json
 * - Default port: 18789
 * - Default bind: loopback (127.0.0.1)
 * - CVE-2026-25253: Critical RCE in all versions < 2026.1.29
 */
export interface ExecResult {
    stdout: string;
    success: boolean;
}
export declare function exec(cmd: string): ExecResult;
export interface SystemInfo {
    os: string;
    arch: string;
    homeDir: string;
    openClawHome: string;
}
export declare function getSystemInfo(): SystemInfo;
export interface OpenClawConfig {
    gateway?: {
        port?: number;
        bind?: string;
        mode?: string;
        auth?: {
            mode?: string;
            token?: string;
        };
    };
    agents?: {
        defaults?: {
            sandbox?: {
                mode?: string;
                [key: string]: unknown;
            };
            [key: string]: unknown;
        };
        [key: string]: unknown;
    };
    [key: string]: unknown;
}
export interface OpenClawStatus {
    installed: boolean;
    version: string | null;
    configPath: string;
    configExists: boolean;
    config: OpenClawConfig | null;
}
export declare function checkOpenClaw(openClawHome: string): OpenClawStatus;
export interface DockerStatus {
    installed: boolean;
    running: boolean;
    version: string | null;
}
export declare function checkDocker(): DockerStatus;
export type CheckResult = 'pass' | 'warn' | 'fail';
export interface SecurityCheck {
    name: string;
    result: CheckResult;
    detail: string;
}
export declare function checkGatewayBinding(config: OpenClawConfig | null): SecurityCheck;
export declare function checkTokenStrength(config: OpenClawConfig | null): SecurityCheck;
export declare function checkDockerSandbox(config: OpenClawConfig | null, dockerRunning: boolean): SecurityCheck;
export declare function checkConfigPermissions(configPath: string): SecurityCheck;
export declare function checkExposedPorts(): SecurityCheck;
export declare function checkOpenClawVersion(version: string | null): SecurityCheck;
export declare function formatSecurityCheck(check: SecurityCheck): string;
export declare function formatReportCard(checks: SecurityCheck[]): string;
//# sourceMappingURL=utils.d.ts.map