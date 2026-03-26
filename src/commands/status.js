import chalk from 'chalk';
import { logger } from '../lib/logger.js';
import { exists, getAllDatabases, load } from '../lib/config-manager.js';
import { isRunning, readPid, readConnectionInfo, toIdentifier } from '../lib/process-manager.js';
import { getProcessUptime, formatUptime } from '../lib/platform.js';
import { getTokenInfo } from '../lib/aptible.js';

export function runStatus() {
  if (!exists()) {
    logger.warn('No config found. Run `aptunnel init` to set up.');
    return;
  }

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

  // Compute column widths
  const cols = {
    env:     Math.max(11, ...dbs.map(d => d.envAlias.length)),
    db:      Math.max(8,  ...dbs.map(d => d.handle.length)),
    alias:   Math.max(5,  ...dbs.map(d => d.alias.length)),
    port:    6,
    status:  6,
    uptime:  11,
    pid:     6,
    url:     3,
  };

  const header = [
    'ENVIRONMENT'.padEnd(cols.env),
    'DATABASE'.padEnd(cols.db),
    'ALIAS'.padEnd(cols.alias),
    'PORT'.padEnd(cols.port),
    'STATUS'.padEnd(cols.status),
    'UPTIME'.padEnd(cols.uptime),
    'PID'.padEnd(cols.pid),
    'CONNECTION URL',
  ].join('  ');

  console.log(chalk.bold(header));
  console.log(chalk.dim('─'.repeat(Math.min(header.length, 120))));

  for (const db of dbs) {
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

    // padEnd doesn't account for invisible ANSI escape chars — pad manually
    const statusPad = ' '.repeat(Math.max(0, cols.status - statusLabel.length));

    const row = [
      db.envAlias.padEnd(cols.env),
      db.handle.padEnd(cols.db),
      db.alias.padEnd(cols.alias),
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
