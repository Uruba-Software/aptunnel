import { createInterface } from 'readline';
import { logger } from '../lib/logger.js';
import { isInstalled, openTunnel, login } from '../lib/aptible.js';
import {
  getDatabase, getAllTunnelTargets, getAllDatabases, readPassword, load, getEnvironment,
} from '../lib/config-manager.js';
import { isPortInUse, killProcess } from '../lib/platform.js';
import {
  isRunning, readPid, readConnectionInfo, saveConnectionInfo, savePid,
  cleanup, toIdentifier, logFilePath,
} from '../lib/process-manager.js';
import chalk from 'chalk';

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function runTunnel(args) {
  if (!isInstalled()) {
    logger.error('Aptible CLI not found. Run `aptunnel init` first.');
    process.exit(1);
  }

  const target    = args[0];                               // db alias or "all"
  const doClose   = args.includes('--close');
  const doForce   = args.includes('--force');
  const portArg   = parseFlag(args, '--port');
  const envArg    = parseFlag(args, '--env');

  if (target === 'all') {
    await handleAll({ doClose, envArg, doForce });
  } else {
    await handleOne({ alias: target, doClose, doForce, portOverride: portArg ? Number(portArg) : null, envOverride: envArg });
  }
}

// ─── Single tunnel ────────────────────────────────────────────────────────────

async function handleOne({ alias, doClose, doForce, portOverride, envOverride }) {
  const db = getDatabase(alias);
  if (!db) {
    logger.error(`Unknown database: "${alias}". Run \`aptunnel status\` or \`aptunnel --help\` to see available aliases.`);
    process.exit(1);
  }

  // Environment override
  const environment = envOverride
    ? (getEnvironment(envOverride) ?? envOverride)
    : db.environment;

  const port = portOverride ?? db.port;
  const id   = toIdentifier(db.alias);

  if (doClose) {
    await closeTunnel(id, port, doForce);
    return;
  }

  await openOneTunnel({ db, environment, port, id, doForce });
}

// ─── All tunnels ──────────────────────────────────────────────────────────────

const PROD_RE = /\b(prod|production|live)\b/i;

async function handleAll({ doClose, envArg, doForce }) {
  let targets;
  let envDesc;

  if (envArg) {
    const envHandle = getEnvironment(envArg) ?? envArg;
    targets = getAllTunnelTargets(envHandle);
    envDesc = envHandle;
    if (targets.length === 0) {
      logger.warn(`No databases configured for environment: ${envHandle}`);
      return;
    }
  } else {
    // No --env: operate across all configured environments
    targets = getAllDatabases();
    envDesc = 'all environments';
    if (targets.length === 0) {
      logger.warn('No databases configured. Run `aptunnel init`.');
      return;
    }

    if (!doClose) {
      // Warn if any env handle or alias looks like production
      const config = load();
      const prodEnvs = [...new Set(targets.map(t => t.environment))].filter(h => {
        const envAlias = config.environments?.[h]?.alias ?? '';
        return PROD_RE.test(h) || PROD_RE.test(envAlias);
      });

      if (prodEnvs.length > 0) {
        logger.warn(`Production environment(s) detected: ${prodEnvs.join(', ')}`);
        const ok = await confirm('Open tunnels to production? (y/N) [N]: ');
        if (!ok) {
          logger.info('Aborted.');
          return;
        }
      }
    }
  }

  if (doClose) {
    for (const db of targets) {
      const id = toIdentifier(db.alias);
      await closeTunnel(id, db.port, doForce);
    }
    return;
  }

  logger.info(`Opening ${targets.length} tunnel(s) for ${envDesc}`);
  console.log('');

  const results = [];
  let sessionValid = false;

  for (const db of targets) {
    const id = toIdentifier(db.alias);
    const result = await openOneTunnel({
      db,
      environment: db.environment,
      port: db.port,
      id,
      doForce,
      skipRelogin: sessionValid,
      silent: false,
    });
    if (result?.success) sessionValid = true;
    results.push({ db, ...result });
  }

  // Summary table
  console.log('');
  logger.section('Summary');
  console.log('');
  const labelW = Math.max(...results.map(r => r.db.alias.length), 8);
  const header = `${'ALIAS'.padEnd(labelW)}  ${'PORT'.padEnd(6)}  STATUS`;
  logger.plain(chalk.bold(header));
  logger.plain('─'.repeat(header.length));
  for (const r of results) {
    const status = r.success ? chalk.green('UP') : chalk.red('FAILED');
    logger.plain(`${r.db.alias.padEnd(labelW)}  ${String(r.db.port).padEnd(6)}  ${status}`);
  }
}

// ─── Core open logic ──────────────────────────────────────────────────────────

async function openOneTunnel({ db, environment, port, id, doForce, skipRelogin = false, silent = false }) {
  // Already running?
  if (isRunning(id)) {
    const conn = readConnectionInfo(id);
    logger.info(`${db.alias} tunnel already running (PID ${readPid(id)})`);
    if (conn) printConnectionInfo(db.alias, port, conn);
    return { success: true };
  }

  // Port in use by something else?
  const portState = isPortInUse(port);
  if (portState.inUse) {
    if (doForce) {
      const free = findFreePort(port + 1);
      if (free === null) {
        logger.warn(`Port ${port} is in use and no free port was found nearby. Use --port=<N> to specify one.`);
        return { success: false };
      }
      logger.info(`Port ${port} is in use — switching to port ${free}.`);
      port = free;
    } else {
      logger.warn(`Port ${port} is already in use (PID ${portState.pid}). Use --force to auto-select a free port, or --port=<N>.`);
      return { success: false };
    }
  }

  const ora = (await import('ora')).default;
  const spinner = ora(`Opening tunnel to ${db.alias}…`).start();

  async function attempt(isRetry) {
    try {
      const result = await openTunnel({ dbHandle: db.handle, environment, port });

      savePid(id, result.pid);
      saveConnectionInfo(id, {
        url:      result.connectionUrl,
        host:     result.credentials.host,
        port:     result.credentials.port ?? port,
        user:     result.credentials.user,
        password: result.credentials.password,
        dbName:   result.credentials.dbName,
      });

      spinner.succeed(`${db.alias} tunnel opened`);
      printConnectionInfo(db.alias, port, readConnectionInfo(id));
      return { success: true };
    } catch (err) {
      if (err.message === 'AUTH_EXPIRED' && !isRetry && !skipRelogin) {
        spinner.warn('Token expired. Re-authenticating…');
        const password = readPassword();
        const config   = load();
        const email    = config.credentials?.email;
        if (!email || !password) {
          spinner.fail('Cannot re-authenticate: credentials not found. Run `aptunnel login`.');
          return { success: false };
        }
        const ok = await login({ email, password });
        if (!ok) {
          spinner.fail('Re-authentication failed. Run `aptunnel login`.');
          return { success: false };
        }
        return attempt(true);
      }

      if (err.message === 'PORT_IN_USE') {
        spinner.fail(`Port ${port} is in use. Use --port=<N> to specify a different port.`);
        return { success: false };
      }

      spinner.fail(`Failed to open tunnel to ${db.alias}: ${err.message}`);
      logger.dim(`  Log: ${logFilePath(id)}`);
      return { success: false };
    }
  }

  return attempt(false);
}

// ─── Close logic ──────────────────────────────────────────────────────────────

async function closeTunnel(id, port, doForce = false) {
  const pid = readPid(id);

  if (!pid) {
    if (doForce) {
      // No PID file — check if anything is bound to the port and kill it.
      const portState = isPortInUse(port);
      if (portState.inUse && portState.pid) {
        logger.warn(`No PID file for ${id}, but port ${port} is held by PID ${portState.pid} — force-killing.`);
        killProcess(portState.pid);
        await sleep(300);
        cleanup(id);
        logger.success(`Port ${port} released.`);
      } else {
        logger.info(`${id}: nothing to close.`);
      }
    } else {
      logger.warn(`No tunnel found for ${id}.`);
    }
    return;
  }

  killProcess(pid);

  // Poll until the port is released (up to ~2 s in 250 ms steps).
  let portState = isPortInUse(port);
  for (let i = 0; i < 8 && portState.inUse; i++) {
    await sleep(250);
    portState = isPortInUse(port);
  }

  cleanup(id);

  if (portState.inUse) {
    if (doForce && portState.pid) {
      // Port still occupied — force-kill whatever is holding it.
      killProcess(portState.pid);
      await sleep(250);
      logger.success(`${id} tunnel closed (port ${port} force-released).`);
    } else {
      logger.warn(`Port ${port} still in use by PID ${portState.pid} (not aptunnel).`);
    }
  } else {
    logger.success(`${id} tunnel closed.`);
  }
}

// ─── Print helpers ────────────────────────────────────────────────────────────

function printConnectionInfo(alias, port, conn) {
  if (!conn) return;
  console.log('');
  logger.detail('Port:',     String(conn.port ?? port));
  logger.detail('Host:',     conn.host ?? 'localhost.aptible.in');
  logger.detail('User:',     conn.user ?? 'aptible');
  logger.detail('Password:', conn.password || chalk.dim('(not parsed)'));
  logger.detail('URL:',      conn.url ? chalk.cyan(conn.url) : chalk.dim('(not parsed)'));
  logger.detail('PID:',      String(readPid(toIdentifier(alias)) ?? '?'));
  console.log('');
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function findFreePort(startPort, maxTries = 20) {
  for (let p = startPort; p < startPort + maxTries; p++) {
    if (!isPortInUse(p).inUse) return p;
  }
  return null;
}

function parseFlag(args, flag) {
  const entry = args.find(a => a.startsWith(`${flag}=`));
  return entry ? entry.slice(flag.length + 1) : null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function confirm(prompt) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, answer => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}
