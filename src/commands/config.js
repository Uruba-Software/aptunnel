import chalk from 'chalk';
import yaml from 'js-yaml';
import { logger } from '../lib/logger.js';
import {
  exists, load, save, getConfigPath, setPort, getDefaultEnv, getAllTunnelTargets,
} from '../lib/config-manager.js';
import { listEnvironments, listDatabases } from '../lib/aptible.js';

export async function runConfig(args) {
  if (!exists() && !args.includes('--path')) {
    logger.warn('No config found. Run `aptunnel init` to set up.');
    return;
  }

  if (args.includes('--path')) {
    console.log(getConfigPath());
    return;
  }

  if (args.includes('--refresh')) {
    await refreshConfig();
    return;
  }

  const setPortArg = args.indexOf('--set-port');
  if (setPortArg !== -1) {
    const alias = args[setPortArg + 1];
    const port  = parseInt(args[setPortArg + 2], 10);
    if (!alias || isNaN(port) || port < 1 || port > 65535) {
      logger.error('Usage: aptunnel config --set-port <alias> <port>  (port must be 1–65535)');
      process.exit(1);
    }
    setPort(alias, port);
    logger.success(`Port for "${alias}" set to ${port}.`);
    return;
  }

  const setDefaultArg = args.indexOf('--set-default');
  if (setDefaultArg !== -1) {
    const envAlias = args[setDefaultArg + 1];
    if (!envAlias) {
      logger.error('Usage: aptunnel config --set-default <env-alias>');
      process.exit(1);
    }
    const config = load();
    // Resolve alias or handle
    const { getEnvironment } = await import('../lib/config-manager.js');
    const handle = getEnvironment(envAlias) ?? envAlias;
    config.defaults = config.defaults ?? {};
    config.defaults.environment = handle;
    save(config);
    logger.success(`Default environment set to "${handle}".`);
    return;
  }

  // Default: print config (mask password by default)
  const showRaw = args.includes('--raw');
  const config  = load();

  // Deep-clone and mask password unless --raw
  let display = JSON.parse(JSON.stringify(config));
  if (!showRaw) {
    if (display.credentials?.password) {
      display.credentials.password = '***masked***';
    }
  }

  const raw = yaml.dump(display, { lineWidth: 120, noRefs: true });
  console.log('');
  console.log(chalk.dim(`# ${getConfigPath()}`));
  console.log(raw);
}

// ─── Refresh: re-discover environments and databases ─────────────────────────

async function refreshConfig() {
  const ora = (await import('ora')).default;
  const config = load();

  const spinner = ora('Fetching environments from Aptible…').start();
  const envs = listEnvironments();
  spinner.succeed(`Found ${envs.length} environment(s).`);

  let added = 0;

  for (const env of envs) {
    if (!config.environments) config.environments = {};
    if (!config.environments[env.handle]) {
      config.environments[env.handle] = { alias: env.handle, databases: {} };
    }

    const dbSpinner = ora(`Fetching databases for ${env.handle}…`).start();
    const dbs = listDatabases(env.handle);
    dbSpinner.succeed(`  ${dbs.length} database(s) in ${env.handle}`);

    for (const db of dbs) {
      if (!config.environments[env.handle].databases[db.handle]) {
        // Find next unused port
        const usedPorts = new Set(
          Object.values(config.environments).flatMap(e =>
            Object.values(e.databases ?? {}).map(d => d.port)
          ).filter(Boolean)
        );
        let port = config.tunnel_defaults?.start_port ?? 55550;
        while (usedPorts.has(port)) port++;

        config.environments[env.handle].databases[db.handle] = {
          alias: db.handle,
          port,
          type: db.type,
        };
        added++;
      }
    }
  }

  save(config);
  logger.success(`Config refreshed. ${added} new database(s) added.`);
}
