"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.audit = audit;
const utils_js_1 = require("../utils.js");
function audit(opts) {
    const system = (0, utils_js_1.getSystemInfo)();
    const openClawHome = opts?.openClawHome || system.openClawHome;
    const openClaw = (0, utils_js_1.checkOpenClaw)(openClawHome);
    const docker = (0, utils_js_1.checkDocker)();
    const checks = [
        (0, utils_js_1.checkGatewayBinding)(openClaw.config),
        (0, utils_js_1.checkTokenStrength)(openClaw.config),
        (0, utils_js_1.checkDockerSandbox)(openClaw.config, docker.running),
        (0, utils_js_1.checkExposedPorts)(),
        openClaw.configExists
            ? (0, utils_js_1.checkConfigPermissions)(openClaw.configPath)
            : { name: 'Config Permissions', result: 'warn', detail: `Config not found at ${openClaw.configPath}` },
        (0, utils_js_1.checkOpenClawVersion)(openClaw.version),
    ];
    return { checks, report: (0, utils_js_1.formatReportCard)(checks) };
}
//# sourceMappingURL=audit.js.map