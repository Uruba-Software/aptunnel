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
  // Do NOT show a spinner here: aptible may prompt for a 2FA OTP code and the
  // spinner output would hide that prompt. Print a plain line instead.
  closeRL();
  console.log('Logging in to Aptible… (enter 2FA code if prompted)');
  const ok = await login({ email, password });
  if (!ok) {
    logger.error('Login failed. Please check your credentials.');
    process.exit(1);
  }
  logger.success('Logged in successfully.');
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
    `Select environments (comma-separated numbers, "all", or press Enter for all): `
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
  console.log('');
  console.log('Set a default environment (used when no --env flag is given):');
  selectedEnvs.forEach((env, i) => console.log(`  [${i + 1}] ${env.handle}`));
  console.log('  [0] None (no default)');
  const defChoice = await ask(`Default environment (0 to skip) [1]: `);
  const defTrimmed = defChoice.trim();
  let defaultEnvHandle = null;
  if (defTrimmed === '0') {
    defaultEnvHandle = null;
  } else {
    const defIdx = parseInt(defTrimmed || '1', 10) - 1;
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
      ...(defaultEnvHandle ? { environment: defaultEnvHandle } : {}),
      lifetime: '7d',
    },
    environments: configEnvironments,
    tunnel_defaults: {
      start_port:    55550,
      port_increment: 1,
    },
  };

  // All prompts done — close readline before exiting
  closeRL();

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
// We use a SINGLE readline interface throughout init and only close it at the
// very end, right before handing stdin back to the aptible child process.
// Opening/closing multiple readline interfaces causes process.stdin to be
// paused between calls, which makes subsequent prompts appear to hang.

let _rl = null;

function getRL() {
  if (!_rl) {
    _rl = createInterface({ input: process.stdin, output: process.stdout });
    // Prevent readline from keeping the event loop alive indefinitely
    _rl.on('close', () => { _rl = null; });
  }
  return _rl;
}

function closeRL() {
  if (_rl) {
    _rl.close();
    _rl = null;
  }
  // Do NOT call process.stdin.resume() here. Flowing mode with no listener
  // discards keystrokes. Child processes (aptible) read from fd 0 directly
  // at OS level regardless of Node.js stream state.
}

function ask(prompt) {
  return new Promise((resolve) => {
    getRL().question(prompt, (answer) => resolve(answer));
  });
}

function askSecret(prompt) {
  // Close the shared readline so we can take over stdin directly.
  // Monkey-patching rl._writeToOutput (private API) is unreliable across
  // Node.js versions — reading raw characters is the portable alternative.
  if (_rl) { _rl.close(); _rl = null; }

  return new Promise((resolve) => {
    process.stdout.write(prompt);

    const chars = [];
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const isTTY = !!process.stdin.isTTY;
    if (isTTY) process.stdin.setRawMode(true);

    function onData(data) {
      for (const char of data) {
        if (char === '\r' || char === '\n') {
          process.stdin.removeListener('data', onData);
          if (isTTY) process.stdin.setRawMode(false);
          // Pause so Node.js stops consuming keystrokes that belong to child
          // processes (e.g. aptible login waiting for a 2FA OTP).
          process.stdin.pause();
          process.stdout.write('\n');
          resolve(chars.join(''));
          return;
        } else if (char === '\u0003') {
          // Ctrl+C
          process.stdout.write('\n');
          process.exit(0);
        } else if (char === '\u007f' || char === '\b') {
          if (chars.length > 0) chars.pop();
        } else if (char >= ' ') {
          chars.push(char);
        }
      }
    }

    process.stdin.on('data', onData);
  });
}
