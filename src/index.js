/**
 * aptunnel — CLI router
 *
 * Parses argv and dispatches to the appropriate command handler.
 * No third-party arg-parsing library — manual, minimal, fast.
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { logger } from './lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require    = createRequire(import.meta.url);
const pkg        = require(resolve(__dirname, '../package.json'));

// ─── Signal handling — clean up tunnels on exit ───────────────────────────────

async function gracefulShutdown(signal) {
  // Only run cleanup if tunnels are open
  try {
    const { getAllRunningTunnels, cleanup } = await import('./lib/process-manager.js');
    const { killProcess } = await import('./lib/platform.js');
    const tunnels = getAllRunningTunnels();
    if (tunnels.length > 0) {
      process.stderr.write(`\n[aptunnel] Caught ${signal}. Closing ${tunnels.length} tunnel(s)…\n`);
      for (const t of tunnels) {
        if (t.running) killProcess(t.pid);
        cleanup(t.identifier);
      }
    }
  } catch { /* ignore errors during shutdown */ }
  process.exit(0);
}

process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
if (process.platform === 'win32') {
  process.on('SIGBREAK', () => gracefulShutdown('SIGBREAK'));
}

// ─── Main router ──────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const [command, ...rest] = argv;

// Global flags
if (!command || command === '--help' || command === '-h' || command === 'help') {
  const { runHelp } = await import('./commands/help.js');
  runHelp();
  process.exit(0);
}

if (command === '--version' || command === '-v') {
  console.log(`aptunnel v${pkg.version}`);
  process.exit(0);
}

// Route to command handlers
try {
  switch (command) {
    case 'init': {
      const { runInit } = await import('./commands/init.js');
      await runInit(rest);
      break;
    }

    case 'login': {
      const { runLogin } = await import('./commands/login.js');
      await runLogin(rest);
      break;
    }

    case 'status': {
      const { runStatus } = await import('./commands/status.js');
      runStatus();
      break;
    }

    case 'config': {
      const { runConfig } = await import('./commands/config.js');
      await runConfig(rest);
      break;
    }

    case 'dbs': {
      const { runDbs } = await import('./commands/dbs.js');
      runDbs(rest);
      break;
    }

    case 'completions': {
      const { runCompletions } = await import('./commands/completions.js');
      await runCompletions(rest);
      break;
    }

    case 'uninstall': {
      const { runUninstall } = await import('./commands/uninstall.js');
      await runUninstall(rest);
      break;
    }

    default: {
      // Any other command is treated as a db alias (or "all")
      const { runTunnel } = await import('./commands/tunnel.js');
      await runTunnel([command, ...rest]);
      break;
    }
  }
} catch (err) {
  // Detect config-missing errors and give a friendly message
  if (err.message?.includes('Run `aptunnel init`')) {
    logger.error(err.message);
  } else if (err.message?.includes('Config file is corrupted')) {
    logger.error(err.message);
  } else {
    logger.error(`Unexpected error: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
  }
  process.exit(1);
}
