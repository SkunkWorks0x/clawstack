"use strict";
/**
 * ClawForge — Secure Deployment & Lifecycle Management
 * "From zero to secure in one command."
 *
 * npx clawforge init   → secure setup + agent registration
 * npx clawforge audit  → scan existing deployment
 * npx clawforge status → agent status from Session Graph
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatSecurityCheck = exports.formatReportCard = exports.getSystemInfo = exports.checkDocker = exports.checkOpenClaw = exports.checkOpenClawVersion = exports.checkExposedPorts = exports.checkConfigPermissions = exports.checkDockerSandbox = exports.checkTokenStrength = exports.checkGatewayBinding = exports.status = exports.audit = exports.init = exports.VERSION = void 0;
exports.VERSION = '0.1.0';
var init_js_1 = require("./commands/init.js");
Object.defineProperty(exports, "init", { enumerable: true, get: function () { return init_js_1.init; } });
var audit_js_1 = require("./commands/audit.js");
Object.defineProperty(exports, "audit", { enumerable: true, get: function () { return audit_js_1.audit; } });
var status_js_1 = require("./commands/status.js");
Object.defineProperty(exports, "status", { enumerable: true, get: function () { return status_js_1.status; } });
var utils_js_1 = require("./utils.js");
Object.defineProperty(exports, "checkGatewayBinding", { enumerable: true, get: function () { return utils_js_1.checkGatewayBinding; } });
Object.defineProperty(exports, "checkTokenStrength", { enumerable: true, get: function () { return utils_js_1.checkTokenStrength; } });
Object.defineProperty(exports, "checkDockerSandbox", { enumerable: true, get: function () { return utils_js_1.checkDockerSandbox; } });
Object.defineProperty(exports, "checkConfigPermissions", { enumerable: true, get: function () { return utils_js_1.checkConfigPermissions; } });
Object.defineProperty(exports, "checkExposedPorts", { enumerable: true, get: function () { return utils_js_1.checkExposedPorts; } });
Object.defineProperty(exports, "checkOpenClawVersion", { enumerable: true, get: function () { return utils_js_1.checkOpenClawVersion; } });
Object.defineProperty(exports, "checkOpenClaw", { enumerable: true, get: function () { return utils_js_1.checkOpenClaw; } });
Object.defineProperty(exports, "checkDocker", { enumerable: true, get: function () { return utils_js_1.checkDocker; } });
Object.defineProperty(exports, "getSystemInfo", { enumerable: true, get: function () { return utils_js_1.getSystemInfo; } });
Object.defineProperty(exports, "formatReportCard", { enumerable: true, get: function () { return utils_js_1.formatReportCard; } });
Object.defineProperty(exports, "formatSecurityCheck", { enumerable: true, get: function () { return utils_js_1.formatSecurityCheck; } });
//# sourceMappingURL=index.js.map