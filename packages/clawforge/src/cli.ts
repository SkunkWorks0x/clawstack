#!/usr/bin/env node

/**
 * ClawForge CLI — Secure OpenClaw Deployment
 *
 * Usage:
 *   clawforge init      Initialize secure setup + register agent
 *   clawforge audit     Audit existing OpenClaw installation
 *   clawforge status    Show agent status from Session Graph
 */

import { init } from './commands/init.js';
import { audit } from './commands/audit.js';
import { status } from './commands/status.js';

const USAGE = `
ClawForge — Secure OpenClaw Deployment

Usage:
  clawforge init      Initialize secure OpenClaw setup
  clawforge audit     Audit existing OpenClaw installation
  clawforge status    Show agent status from Session Graph
  clawforge help      Show this help message

Version: 0.1.0
`;

async function main(): Promise<void> {
  const command = process.argv[2];

  switch (command) {
    case 'init': {
      console.log('ClawForge: Initializing secure OpenClaw deployment...\n');
      const result = await init();
      console.log(result.report);
      console.log(`\nAgent registered: ${result.agent.agentId}`);
      console.log(`Session started:  ${result.sessionId}`);
      console.log(`Config written:   ${result.clawstackDir}/config.json`);
      break;
    }

    case 'audit': {
      console.log('ClawForge: Auditing OpenClaw installation...\n');
      const result = audit();
      console.log(result.report);
      break;
    }

    case 'status': {
      const result = status();
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
