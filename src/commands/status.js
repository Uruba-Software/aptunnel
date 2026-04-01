import chalk from 'chalk';
import { logger } from '../lib/logger.js';
import { exists, getAllDatabases } from '../lib/config-manager.js';
import { isRunning, readPid, readConnectionInfo, toIdentifier } from '../lib/process-manager.js';
import { getProcessUptime, formatUptime } from '../lib/platform.js';
import { getTokenInfo } from '../lib/aptible.js';

export function runStatus(args = []) {
  if (!exists()) {
    logger.warn('No config found. Run `aptunnel init` to set up.');
    return;
  }

  const doWatch = Array.isArray(args) && args.includes('--watch');

  if (doWatch) {
    const render = () => {
      process.stdout.write('\x1B[2J\x1B[H');
      printStatus();
    };
    render();
    setInterval(render, 2000);
  } else {
    printStatus();
  }
}

function printStatus() {
  // ── Login status ──────────────────────────────────────────────────────────
  logger.section('LOGIN STATUS');
  const token = getTokenInfo();
  if (!token) {
    logger.warn('  Token:  not found — run `aptunnel login`');
  } else {
    console.log(`  User:   ${chalk.cyan(token.email)}`);
    if (token.isExpired) {
      console.log(`  Token:  ${chalk.red('EXPIRED')} — run \`aptunnel login\` to re-authenticate`);
    } else {
      const d = Math.floor(token.remainingHours / 24);
      const h = token.remainingHours % 24;
      const remaining = d > 0 ? `${d}d ${h}h` : `${h}h`;
      console.log(`  Token:  ${chalk.green('valid')} (expires in ${remaining})`);
    }
  }

  // ── Tunnel table ──────────────────────────────────────────────────────────
  console.log('');
  logger.section('TUNNELS');
  console.log('');

  const dbs = getAllDatabases();
  if (dbs.length === 0) {
    logger.dim('  No databases configured.');
    return;
  }

  // Group by environment handle (preserving config order)
  const byEnv = new Map();
  for (const db of dbs) {
    if (!byEnv.has(db.environment)) {
      byEnv.set(db.environment, { alias: db.envAlias, dbs: [] });
    }
    byEnv.get(db.environment).dbs.push(db);
  }

  for (const [envHandle, { alias: envAlias, dbs: envDbs }] of byEnv) {
    // Environment header — show alias (handle) if they differ, otherwise just the handle
    const envLabel = envAlias !== envHandle
      ? `${envAlias} (${envHandle})`
      : envHandle;

    // Database display name: handle + alias in parens when they differ
    const dbNames = envDbs.map(db =>
      db.alias !== db.handle ? `${db.handle} (${db.alias})` : db.handle,
    );

    const cols = {
      db:     Math.max(8, ...dbNames.map(n => n.length)),
      port:   6,
      status: 6,
      uptime: 11,
      pid:    6,
    };

    const headerLine = [
      'DATABASE'.padEnd(cols.db),
      'PORT'.padEnd(cols.port),
      'STATUS'.padEnd(cols.status),
      'UPTIME'.padEnd(cols.uptime),
      'PID'.padEnd(cols.pid),
      'URL',
    ].join('  ');

    const sepWidth = Math.max(headerLine.length, envLabel.length + 6);
    console.log(chalk.dim('── ') + chalk.bold(envLabel) + chalk.dim(' ' + '─'.repeat(Math.max(0, sepWidth - envLabel.length - 4))));
    console.log(chalk.bold(headerLine));
    console.log(chalk.dim('─'.repeat(Math.min(headerLine.length, 120))));

    for (let i = 0; i < envDbs.length; i++) {
      const db     = envDbs[i];
      const dbName = dbNames[i];

      const id      = toIdentifier(db.alias);
      const running = isRunning(id);
      const pid     = running ? readPid(id) : null;
      const uptime  = pid ? getProcessUptime(pid) : null;
      const conn    = running ? readConnectionInfo(id) : null;

      const statusLabel = running ? 'UP' : 'DOWN';
      const statusStr   = running ? chalk.green('UP') : chalk.dim('DOWN');
      const uptimeStr   = running ? formatUptime(uptime) : '-';
      const pidStr      = pid ? String(pid) : '-';
      const urlStr      = conn?.url ? chalk.dim(conn.url) : '-';

      // padEnd doesn't account for invisible ANSI escape codes — pad manually
      const statusPad = ' '.repeat(Math.max(0, cols.status - statusLabel.length));

      const row = [
        dbName.padEnd(cols.db),
        String(db.port).padEnd(cols.port),
        statusStr + statusPad,
        uptimeStr.padEnd(cols.uptime),
        pidStr.padEnd(cols.pid),
        urlStr,
      ].join('  ');

      console.log(row);
    }

    console.log('');
  }
}
