#!/usr/bin/env node
"use strict";
/**
 * ClawForge CLI — Secure OpenClaw Deployment
 *
 * Usage:
 *   clawforge init      Initialize secure setup + register agent
 *   clawforge audit     Audit existing OpenClaw installation
 *   clawforge status    Show agent status from Session Graph
 */
Object.defineProperty(exports, "__esModule", { value: true });
const init_js_1 = require("./commands/init.js");
const audit_js_1 = require("./commands/audit.js");
const status_js_1 = require("./commands/status.js");
const USAGE = `
ClawForge — Secure OpenClaw Deployment

Usage:
  clawforge init      Initialize secure OpenClaw setup
  clawforge audit     Audit existing OpenClaw installation
  clawforge status    Show agent status from Session Graph
  clawforge help      Show this help message

Version: 0.1.0
`;
async function main() {
    const command = process.argv[2];
    switch (command) {
        case 'init': {
            console.log('ClawForge: Initializing secure OpenClaw deployment...\n');
            const result = await (0, init_js_1.init)();
            console.log(result.report);
            console.log(`\nAgent registered: ${result.agent.agentId}`);
            console.log(`Session started:  ${result.sessionId}`);
            console.log(`Config written:   ${result.clawstackDir}/config.json`);
            break;
        }
        case 'audit': {
            console.log('ClawForge: Auditing OpenClaw installation...\n');
            const result = (0, audit_js_1.audit)();
            console.log(result.report);
            break;
        }
        case 'status': {
            const result = (0, status_js_1.status)();
            console.log(result.report);
            break;
        }
        case 'help':
        case '--help':
        case '-h':
        case undefined:
            console.log(USAGE);
            break;
        default:
            console.error(`Unknown command: ${command}`);
            console.log(USAGE);
            process.exit(1);
    }
}
main().catch((err) => {
    console.error('ClawForge error:', err.message);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map