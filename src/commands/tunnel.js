import { createInterface } from 'readline';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../lib/logger.js';
import { isInstalled, openTunnel, login } from '../lib/aptible.js';
import {
  getDatabase, getAllTunnelTargets, getAllDatabases, readPassword, load, getEnvironment,
} from '../lib/config-manager.js';
import { isPortInUse, killProcess } from '../lib/platform.js';
import {
  isRunning, readPid, readConnectionInfo, saveConnectionInfo, savePid,
  cleanup, toIdentifier, logFilePath, saveWatchdogPid, readWatchdogPid, getTempDir,
} from '../lib/process-manager.js';
import chalk from 'chalk';

const APTIBLE_MAX_HOURS = 24;
const WATCHDOG_PATH = join(dirname(fileURLToPath(import.meta.url)), '../lib/watchdog.js');

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
  const aliveArg  = parseFlag(args, '--alive');
  const aliveHours = parseAliveHours(aliveArg);

  if (aliveHours !== null && aliveHours instanceof Error) {
    logger.error(aliveHours.message);
    process.exit(1);
  }

  if (target === 'all') {
    await handleAll({ doClose, envArg, doForce, aliveHours });
  } else {
    await handleOne({ alias: target, doClose, doForce, portOverride: portArg ? Number(portArg) : null, envOverride: envArg, aliveHours });
  }
}

// ─── Single tunnel ────────────────────────────────────────────────────────────

async function handleOne({ alias, doClose, doForce, portOverride, envOverride, aliveHours }) {
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

  await openOneTunnel({ db, environment, port, id, doForce, aliveHours });
}

// ─── All tunnels ──────────────────────────────────────────────────────────────

const PROD_RE = /\b(prod|production|live)\b/i;

async function handleAll({ doClose, envArg, doForce, aliveHours }) {
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
      aliveHours,
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
    if (r.success) {
      logger.plain(`${r.db.alias.padEnd(labelW)}  ${String(r.db.port).padEnd(6)}  ${chalk.green('UP')}`);
    } else {
      const reasonStr = r.reason ? chalk.dim(`  (${r.reason})`) : '';
      logger.plain(`${r.db.alias.padEnd(labelW)}  ${String(r.db.port).padEnd(6)}  ${chalk.red('FAILED')}${reasonStr}`);
    }
  }
}

// ─── Core open logic ──────────────────────────────────────────────────────────

async function openOneTunnel({ db, environment, port, id, doForce, aliveHours = null, skipRelogin = false, silent = false }) {
  // Already running?
  if (isRunning(id)) {
    const conn = readConnectionInfo(id);
    logger.info(`${db.alias} tunnel already running (PID ${readPid(id)})`);
    if (conn) printConnectionInfo(db.alias, port, conn);
    return { success: true };
  }

  // Stale state: PID file exists but process is dead (aptible hit its own connection limit
  // and exited naturally). Its SSH child may have been re-parented to init and still holds
  // the port. Also kill any lingering watchdog so it doesn't fire against the new tunnel.
  const stalePid = readPid(id);
  if (stalePid) {
    const staleWatchdog = readWatchdogPid(id);
    if (staleWatchdog) {
      try { process.kill(staleWatchdog, 'SIGKILL'); } catch { /* already gone */ }
    }
    const stalePort = isPortInUse(port);
    if (stalePort.inUse && stalePort.pid) {
      killProcess(stalePort.pid);
      await sleep(400);
    }
    cleanup(id);
  }

  // Port in use by something else?
  const portState = isPortInUse(port);
  if (portState.inUse) {
    if (doForce) {
      const free = findFreePort(port + 1);
      if (free === null) {
        logger.warn(`Port ${port} is in use and no free port was found nearby. Use --port=<N> to specify one.`);
        return { success: false, reason: `port ${port} in use, no free port found nearby` };
      }
      logger.info(`Port ${port} is in use — switching to port ${free}.`);
      port = free;
    } else {
      logger.warn(`Port ${port} is already in use (PID ${portState.pid}). Use --force to auto-select a free port, or --port=<N>.`);
      return { success: false, reason: `port ${port} in use (PID ${portState.pid}) — use --force` };
    }
  }

  const ora = (await import('ora')).default;
  const spinner = ora(`Opening tunnel to ${db.alias}…`).start();

  async function attempt(isRetry) {
    try {
      const result = await openTunnel({ dbHandle: db.handle, environment, port });

      savePid(id, result.pid);
      const ttlExpiresAt = aliveHours ? Date.now() + aliveHours * 3_600_000 : null;
      saveConnectionInfo(id, {
        url:      result.connectionUrl,
        host:     result.credentials.host,
        port:     result.credentials.port ?? port,
        user:     result.credentials.user,
        password: result.credentials.password,
        dbName:   result.credentials.dbName,
        ttl_expires_at: ttlExpiresAt,
      });

      if (aliveHours) {
        const watcher = spawn(
          process.execPath,
          [WATCHDOG_PATH, String(result.pid), String(aliveHours * 3_600_000), getTempDir(), id],
          { detached: true, stdio: 'ignore' },
        );
        watcher.unref();
        saveWatchdogPid(id, watcher.pid);
      }

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
          return { success: false, reason: 'credentials missing — run `aptunnel login`' };
        }
        const ok = await login({ email, password });
        if (!ok) {
          spinner.fail('Re-authentication failed. Run `aptunnel login`.');
          return { success: false, reason: 're-authentication failed — run `aptunnel login`' };
        }
        return attempt(true);
      }

      if (err.message === 'PORT_IN_USE') {
        spinner.fail(`Port ${port} is in use. Use --port=<N> to specify a different port.`);
        return { success: false, reason: `port ${port} in use — use --port=<N>` };
      }

      spinner.fail(`Failed to open tunnel to ${db.alias}: ${err.message}`);
      logger.dim(`  Log: ${logFilePath(id)}`);
      return { success: false, reason: err.message };
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

  // Kill the watchdog timer (if any) before killing the tunnel process.
  const watchdogPid = readWatchdogPid(id);
  if (watchdogPid) {
    try { process.kill(watchdogPid, 'SIGKILL'); } catch { /* already gone */ }
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
    if (portState.pid) {
      // Port still held — almost certainly an SSH child re-parented after aptible exited
      // naturally (aptible's own connection limit). Kill the orphan to free the port.
      killProcess(portState.pid);
      await sleep(250);
      logger.success(`${id} tunnel closed (port ${port} released).`);
    } else {
      logger.warn(`Port ${port} still in use (PID unknown).`);
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

// Returns: null (no flag), Error (invalid), or number (hours, 1–24)
function parseAliveHours(raw) {
  if (raw === null || raw === undefined) return null;
  if (raw === 'max') return APTIBLE_MAX_HOURS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return new Error(`--alive: invalid value "${raw}". Use a positive number of hours or "max" (${APTIBLE_MAX_HOURS}h).`);
  }
  if (n > APTIBLE_MAX_HOURS) {
    return new Error(`--alive: ${n}h exceeds Aptible's ${APTIBLE_MAX_HOURS}h tunnel limit. Use --alive=max for the maximum.`);
  }
  return n;
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
