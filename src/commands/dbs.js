import chalk from 'chalk';
import { logger } from '../lib/logger.js';
import { exists, getAllDatabases } from '../lib/config-manager.js';

export function runDbs(args) {
  if (!exists()) {
    logger.warn('No config found. Run `aptunnel init` to set up.');
    return;
  }

  // Optional filter: --env=ALIAS
  const envFlag = args.find(a => a.startsWith('--env='))?.slice(6) ?? null;

  let dbs = getAllDatabases();

  if (envFlag) {
    dbs = dbs.filter(d => d.envAlias === envFlag || d.environment === envFlag);
    if (dbs.length === 0) {
      logger.warn(`No databases found for environment: ${envFlag}`);
      return;
    }
  }

  if (dbs.length === 0) {
    logger.dim('  No databases configured.');
    return;
  }

  console.log('');

  // Compute column widths
  const cols = {
    alias: Math.max(5,  ...dbs.map(d => d.alias.length)),
    handle: Math.max(8, ...dbs.map(d => d.handle.length)),
    type:  Math.max(4,  ...dbs.map(d => d.type.length)),
    port:  Math.max(4,  ...dbs.map(d => String(d.port).length)),
    env:   Math.max(11, ...dbs.map(d => d.envAlias.length)),
  };

  const header = [
    'ALIAS'.padEnd(cols.alias),
    'DATABASE'.padEnd(cols.handle),
    'TYPE'.padEnd(cols.type),
    'PORT'.padEnd(cols.port),
    'ENVIRONMENT',
  ].join('  ');

  console.log(chalk.bold(header));
  console.log(chalk.dim('─'.repeat(header.length)));

  for (const db of dbs) {
    const row = [
      chalk.cyan(db.alias.padEnd(cols.alias)),
      db.handle.padEnd(cols.handle),
      chalk.yellow(db.type.padEnd(cols.type)),
      String(db.port).padEnd(cols.port),
      chalk.dim(db.envAlias),
    ].join('  ');

    console.log(row);
  }

  console.log('');
  console.log(chalk.dim(`  ${dbs.length} database(s) configured. Use \`aptunnel <alias>\` to open a tunnel.`));
  console.log('');
}
