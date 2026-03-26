import readline from 'readline';
import { createInterface } from 'readline';
import { logger } from '../lib/logger.js';
import { isInstalled, login, listEnvironments, listDatabases } from '../lib/aptible.js';
import { installInstructions, detectOS } from '../lib/platform.js';
import {
  exists, save, savePassword, getConfigDir, getConfigPath, nextAvailablePort,
} from '../lib/config-manager.js';

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function runInit(args) {
  logger.section('aptunnel init — Setup Wizard');
  console.log('');

  // 1. Check aptible CLI
  if (!isInstalled()) {
    logger.error('Aptible CLI not found in PATH.');
    console.log('');
    console.log(installInstructions('aptible'));
    process.exit(1);
  }

  // 2. Check existing config
  if (exists()) {
    const reinit = await ask('Config already exists. Reinitialize? (y/N) ');
    if (!reinit.match(/^y(es)?$/i)) {
      logger.info('Aborted.');
      return;
    }
    console.log('');
  }

  // 3. Collect credentials
  const email    = await ask('Aptible email: ');
  const password = await askSecret('Aptible password: ');
  console.log('');

  // 4. Login (interactive — handles 2FA via stdio: inherit)
  const spinner = (await import('ora')).default({ text: 'Logging in to Aptible…' }).start();
  const ok = await login({ email, password });
  if (!ok) {
    spinner.fail('Login failed. Please check your credentials.');
    process.exit(1);
  }
  spinner.succeed('Logged in successfully.');
  console.log('');

  // 5. Discover environments
  const envSpinner = (await import('ora')).default({ text: 'Discovering environments…' }).start();
  const environments = listEnvironments();
  envSpinner.succeed(`Found ${environments.length} environment(s).`);

  if (environments.length === 0) {
    logger.warn('No environments found for this account.');
    process.exit(1);
  }

  // 6. Select environments
  console.log('');
  console.log('Available environments:');
  environments.forEach((env, i) => {
    console.log(`  [${i + 1}] ${env.handle}`);
  });
  console.log('');

  const selection = await ask(
    `Select environments to configure (comma-separated numbers, or "all") [all]: `
  );

  let selectedEnvs;
  if (!selection.trim() || selection.trim().toLowerCase() === 'all') {
    selectedEnvs = environments;
  } else {
    const indices = selection.split(',').map(s => parseInt(s.trim(), 10) - 1);
    selectedEnvs = indices
      .filter(i => i >= 0 && i < environments.length)
      .map(i => environments[i]);
  }

  if (selectedEnvs.length === 0) {
    logger.error('No valid environments selected.');
    process.exit(1);
  }

  // 7. Set default environment
  let defaultEnvHandle = selectedEnvs[0].handle;
  if (selectedEnvs.length > 1) {
    console.log('');
    selectedEnvs.forEach((env, i) => console.log(`  [${i + 1}] ${env.handle}`));
    const defChoice = await ask(`Default environment [1]: `);
    const defIdx = parseInt(defChoice.trim() || '1', 10) - 1;
    if (defIdx >= 0 && defIdx < selectedEnvs.length) {
      defaultEnvHandle = selectedEnvs[defIdx].handle;
    }
  }

  // 8. For each environment, discover databases and assign ports
  const configEnvironments = {};
  let portCounter = 55550;

  for (const env of selectedEnvs) {
    console.log('');
    const dbSpinner = (await import('ora')).default({ text: `Fetching databases for ${env.handle}…` }).start();
    const databases = listDatabases(env.handle);
    dbSpinner.succeed(`Found ${databases.length} database(s) in ${env.handle}.`);

    if (databases.length === 0) continue;

    // Auto-assign ports
    const assignedDbs = databases.map((db) => ({
      ...db,
      assignedPort: portCounter++,
      suggestedAlias: suggestDbAlias(db.handle, databases),
    }));

    // Show proposed config
    console.log('');
    console.log(`  Databases in ${env.handle}:`);
    assignedDbs.forEach((db, i) => {
      console.log(`  [${i + 1}] ${db.handle}  →  alias: ${db.suggestedAlias}  port: ${db.assignedPort}  (${db.type})`);
    });

    // 9. Customize ports?
    const customizePorts = await ask('  Customize ports? (y/N) ');
    if (customizePorts.match(/^y(es)?$/i)) {
      for (const db of assignedDbs) {
        const newPort = await ask(`    Port for ${db.handle} [${db.assignedPort}]: `);
        if (newPort.trim()) db.assignedPort = parseInt(newPort.trim(), 10);
      }
    }

    // 10. Customize aliases?
    const customizeAliases = await ask('  Customize aliases? (y/N) ');
    if (customizeAliases.match(/^y(es)?$/i)) {
      for (const db of assignedDbs) {
        const newAlias = await ask(`    Alias for ${db.handle} [${db.suggestedAlias}]: `);
        if (newAlias.trim()) db.suggestedAlias = deduplicateAlias(newAlias.trim(), assignedDbs);
      }
    }

    // Build environment alias
    const envAlias = suggestEnvAlias(env.handle);
    const confirmedEnvAlias = await ask(`  Alias for this environment [${envAlias}]: `);

    const databasesConfig = {};
    for (const db of assignedDbs) {
      databasesConfig[db.handle] = {
        alias: db.suggestedAlias,
        port:  db.assignedPort,
        type:  db.type,
      };
    }

    configEnvironments[env.handle] = {
      alias:     confirmedEnvAlias.trim() || envAlias,
      databases: databasesConfig,
    };
  }

  // 11. Write config
  const config = {
    version: 1,
    credentials: { email },
    defaults: {
      environment: defaultEnvHandle,
      lifetime:    '7d',
    },
    environments: configEnvironments,
    tunnel_defaults: {
      start_port:    55550,
      port_increment: 1,
    },
  };

  save(config);
  savePassword(password);

  console.log('');
  logger.success(`Config written to ${getConfigPath()}`);
  logger.success('Credentials stored in ' + getConfigDir() + '/.credentials (mode 600)');
  console.log('');
  logger.section('Next steps');
  console.log('  aptunnel status         — view all tunnel states');
  console.log('  aptunnel <alias>        — open a tunnel');
  console.log('  aptunnel all            — open all tunnels');
  console.log('  aptunnel --help         — full command reference');
  console.log('');
}

// ─── Alias generation ─────────────────────────────────────────────────────────

/**
 * Suggest a short alias for an environment handle.
 * e.g. "ekare-inc-development-gfpkcova" → "dev"
 */
function suggestEnvAlias(handle) {
  const words = handle.toLowerCase().split(/[-_]/);

  const envWords = { development: 'dev', staging: 'staging', production: 'prod', test: 'test', testing: 'test' };
  for (const word of words) {
    if (envWords[word]) return envWords[word];
  }

  // Use the most informative non-hash word
  const meaningful = words.filter(w => w.length > 2 && !/^[a-z0-9]{6,}$/.test(w) && !['inc', 'com', 'the'].includes(w));
  return meaningful[meaningful.length - 1] ?? words[0];
}

/**
 * Suggest a short alias for a database handle.
 * e.g. "ekaredb-dev" → "dev-db", "my-company-redis" → "redis"
 */
function suggestDbAlias(handle, allDbs) {
  const lower = handle.toLowerCase();

  // Detect DB type from handle
  let type = '';
  if (lower.includes('redis'))    type = 'redis';
  if (lower.includes('postgres') || lower.includes('pg')) type = 'pg';
  if (lower.includes('mysql'))    type = 'mysql';
  if (lower.includes('mongo'))    type = 'mongo';

  // Detect environment part
  let env = '';
  const envWords = { dev: 'dev', development: 'dev', staging: 'stg', prod: 'prod', production: 'prod', test: 'test' };
  for (const [word, alias] of Object.entries(envWords)) {
    if (lower.includes(word)) { env = alias; break; }
  }

  if (type && env)  return `${env}-${type}`;
  if (type)         return type;
  if (env)          return `${env}-db`;

  // Fallback: strip common company prefixes, take last meaningful segment
  const parts = lower.split(/[-_]/).filter(p => p.length > 1 && !/^\d+$/.test(p));
  return parts[parts.length - 1] ?? handle;
}

function deduplicateAlias(alias, allDbs) {
  const used = new Set(allDbs.map(d => d.suggestedAlias));
  if (!used.has(alias)) return alias;
  let i = 2;
  while (used.has(`${alias}${i}`)) i++;
  return `${alias}${i}`;
}

// ─── Readline helpers ─────────────────────────────────────────────────────────

function ask(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function askSecret(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    // Suppress echoing for password input
    process.stdout.write(prompt);
    rl.stdoutMuted = true;

    // Monkey-patch _writeToOutput to suppress echo
    rl._writeToOutput = function(str) {
      if (!this.stdoutMuted) this.output.write(str);
    };

    rl.question('', (answer) => {
      rl.stdoutMuted = false;
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}
