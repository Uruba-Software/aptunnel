import chalk from 'chalk';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { exists, load, getDefaultEnv, getAllDatabases } from '../lib/config-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require    = createRequire(import.meta.url);
const pkg        = require(resolve(__dirname, '../../package.json'));

export function runHelp() {
  const hasConfig = exists();
  let config      = null;
  let databases   = [];
  let defaultEnv  = null;

  if (hasConfig) {
    try {
      config     = load();
      databases  = getAllDatabases();
      defaultEnv = getDefaultEnv();
    } catch {
      // Corrupted config — show generic help
    }
  }

  console.log('');
  console.log(chalk.bold(`aptunnel`) + chalk.dim(` — Aptible Tunnel Manager v${pkg.version}`));
  console.log('');

  section('USAGE');
  console.log('  aptunnel <command> [options]');
  console.log('');

  section('COMMANDS');
  cmd('aptunnel init',                          'Setup wizard (login, discover environments & databases)');
  cmd('aptunnel login [--status]',              'Login to Aptible or show token status');
  cmd('aptunnel status',                        'Show all tunnel statuses and login info');
  cmd('aptunnel dbs [--env=ALIAS]',             'List all configured databases');
  cmd('aptunnel config',                        'View or modify configuration');
  cmd('aptunnel completions <bash|zsh|fish>',   'Print shell completion script');
  cmd('aptunnel <db-alias> [--port=N]',         'Open a tunnel to a database');
  cmd('aptunnel <db-alias> --close',            'Close a tunnel');
  cmd('aptunnel all [--env=ALIAS]',             'Open all tunnels for an environment');
  cmd('aptunnel all --close [--env=ALIAS]',     'Close all tunnels');
  cmd('aptunnel uninstall [--force]',           'Stop tunnels, remove config, and uninstall');
  console.log('');

  if (hasConfig && databases.length > 0) {
    // Resolve default env alias
    let defaultAlias = defaultEnv;
    if (defaultEnv && config?.environments?.[defaultEnv]?.alias) {
      defaultAlias = config.environments[defaultEnv].alias;
    }

    section(`YOUR DATABASES (default env: ${chalk.cyan(defaultAlias ?? '(none)')})`);

    // Show databases for default environment first
    const defaultDbs = databases.filter(d => d.environment === defaultEnv);
    const otherDbs   = databases.filter(d => d.environment !== defaultEnv);

    for (const db of defaultDbs) {
      cmd(`aptunnel ${db.alias}`, `→ ${db.handle}  ${chalk.dim(`(port ${db.port})`)}`);
    }

    if (otherDbs.length > 0) {
      console.log('');
      section('OTHER ENVIRONMENTS');
      for (const db of otherDbs) {
        cmd(`aptunnel ${db.alias} --env=${db.envAlias}`, `→ ${db.handle}  ${chalk.dim(`(port ${db.port})`)}`);
      }
    }
    console.log('');
  } else {
    console.log(chalk.dim('  (no config found — run `aptunnel init` to get started)'));
    console.log('');
  }

  section('OPTIONS');
  opt('--port=N',      'Override port for this session');
  opt('--env=ALIAS',   'Target a specific environment');
  opt('--close',       'Close tunnel(s)');
  opt('--force',       'Open: auto-select a free port if configured port is busy');
  opt('',              'Close: force-release port even if no PID file exists');
  opt('',              'Uninstall: also wipe the entire ~/.aptunnel directory');
  opt('--help, -h',    'Show this help');
  opt('--version, -v', 'Show version');
  console.log('');

  section('CONFIG SUBCOMMANDS');
  cmd('aptunnel config',                        'Print full config (password masked)');
  cmd('aptunnel config --raw',                  'Print full config including password');
  cmd('aptunnel config --set-port <alias> <N>', 'Update port for a database');
  cmd('aptunnel config --set-default <env>',    'Change default environment');
  cmd('aptunnel config --refresh',              'Re-discover envs/dbs from Aptible');
  cmd('aptunnel config --path',                 'Print config file path');
  console.log('');
}

function section(title) {
  console.log(chalk.bold(title));
}

function cmd(name, description) {
  console.log(`  ${chalk.cyan(name.padEnd(48))} ${chalk.dim(description)}`);
}

function opt(name, description) {
  console.log(`  ${chalk.yellow(name.padEnd(20))} ${description}`);
}
