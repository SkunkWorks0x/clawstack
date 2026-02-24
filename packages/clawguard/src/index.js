"use strict";
/**
 * ClawGuard — Behavioral Runtime Security + Trust Certification
 * "The trust layer OpenClaw is missing."
 *
 * Runtime monitor OUTSIDE LLM context (cannot be prompt-injected).
 * Process-level network/file/memory monitoring.
 * Rogue agent kill switch. Threat intelligence feed.
 * ClawGuard Certified program for premium skill publishers.
 *
 * Unlike SecureClaw (~1,230 tokens in-context, prompt-injectable),
 * ClawGuard operates at process/network level. You can't prompt-inject
 * a network firewall.
 *
 * Revenue: Free → $19/mo → $2,500-10K/mo enterprise
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThreatIntel = exports.KillSwitch = exports.DEFAULT_POLICY = exports.PolicyEngine = exports.RuntimeMonitor = exports.VERSION = void 0;
exports.VERSION = '0.1.0';
// Core components
var runtime_monitor_js_1 = require("./runtime-monitor.js");
Object.defineProperty(exports, "RuntimeMonitor", { enumerable: true, get: function () { return runtime_monitor_js_1.RuntimeMonitor; } });
var policy_engine_js_1 = require("./policy-engine.js");
Object.defineProperty(exports, "PolicyEngine", { enumerable: true, get: function () { return policy_engine_js_1.PolicyEngine; } });
Object.defineProperty(exports, "DEFAULT_POLICY", { enumerable: true, get: function () { return policy_engine_js_1.DEFAULT_POLICY; } });
var kill_switch_js_1 = require("./kill-switch.js");
Object.defineProperty(exports, "KillSwitch", { enumerable: true, get: function () { return kill_switch_js_1.KillSwitch; } });
var threat_intel_js_1 = require("./threat-intel.js");
Object.defineProperty(exports, "ThreatIntel", { enumerable: true, get: function () { return threat_intel_js_1.ThreatIntel; } });
//# sourceMappingURL=index.js.map