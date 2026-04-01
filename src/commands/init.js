import { createInterface } from 'readline';
import { logger } from '../lib/logger.js';
import { isInstalled, login, listEnvironments, listDatabases } from '../lib/aptible.js';
import { installInstructions } from '../lib/platform.js';
import { installCompletions } from '../lib/completions.js';
import {
  exists, save, savePassword, getConfigDir, getConfigPath, nextAvailablePort, getInstallType,
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
    const reinit = await ask('Config already exists. Reinitialize? (y/N) [N]: ');
    if (!reinit.match(/^y(es)?$/i)) {
      closeRL();
      logger.info('Aborted.');
      return;
    }
    console.log('');
  }

  // 3. Installation type
  const priorType    = getInstallType();
  const defaultType  = priorType === 'custom' ? '2' : '1';
  console.log('Installation type:');
  console.log('  [1] Express  — login + auto-configure everything with defaults');
  console.log('  [2] Custom   — full interactive setup (ports, aliases, environments)');
  console.log('');
  const typeInput   = await ask(`Select [${defaultType}]: `);
  const installType = typeInput.trim() === '2' ? 'custom' : 'express';
  console.log('');

  // ── Section A: Login ──────────────────────────────────────────────────────

  const email    = await ask('Aptible email: ');
  const password = await askSecret('Aptible password: ');
  console.log('');

  // Close readline before handing stdin to aptible (2FA prompt reads from fd 0).
  closeRL();
  console.log('Logging in to Aptible… (enter 2FA code if prompted)');
  const ok = await login({ email, password });
  if (!ok) {
    logger.error('Login failed. Please check your credentials.');
    process.exit(1);
  }
  logger.success('Logged in successfully.');
  console.log('');

  // ── Section B: Environment discovery & selection ──────────────────────────

  process.stdout.write('Discovering environments…\n');
  const environments = listEnvironments();
  logger.success(`Found ${environments.length} environment(s).`);

  if (environments.length === 0) {
    logger.warn('No environments found for this account.');
    return;
  }

  let selectedEnvs;

  if (installType === 'custom') {
    console.log('');
    console.log('Available environments:');
    environments.forEach((env, i) => console.log(`  [${i + 1}] ${env.handle}`));
    console.log('');

    const selection = await ask('Select environments (comma-separated numbers or "all") [all]: ');

    if (!selection.trim() || selection.trim().toLowerCase() === 'all') {
      selectedEnvs = environments;
    } else {
      const indices = selection.split(',').map(s => parseInt(s.trim(), 10) - 1);
      selectedEnvs  = indices
        .filter(i => i >= 0 && i < environments.length)
        .map(i => environments[i]);
    }

    if (selectedEnvs.length === 0) {
      logger.warn('No valid selection — using all environments.');
      selectedEnvs = environments;
    }
  } else {
    // Express: auto-select all
    selectedEnvs = environments;
    logger.info(`All ${environments.length} environment(s) will be configured.`);
  }

  // ── Section C: Database configuration ────────────────────────────────────

  const configEnvironments = {};
  let portCounter = 55550;

  for (const env of selectedEnvs) {
    console.log('');
    process.stdout.write(`Fetching databases for ${env.handle}…\n`);
    const databases = listDatabases(env.handle);
    logger.success(`Found ${databases.length} database(s) in ${env.handle}.`);

    if (databases.length === 0) {
      configEnvironments[env.handle] = { alias: env.handle, databases: {} };
      continue;
    }

    // Default alias = the database's own handle (user can change in Custom)
    const assignedDbs = [];
    for (const db of databases) {
      assignedDbs.push({
        ...db,
        assignedPort:   portCounter++,
        suggestedAlias: deduplicateAlias(db.handle, assignedDbs),
      });
    }

    if (installType === 'custom') {
      // Show proposed config
      console.log('');
      console.log(`  Databases in ${env.handle}:`);
      assignedDbs.forEach((db, i) => {
        console.log(`  [${i + 1}] ${db.handle}  →  alias: ${db.suggestedAlias}  port: ${db.assignedPort}  (${db.type})`);
      });

      // Customize ports?
      const customizePorts = await ask('  Customize ports? (y/N) [N]: ');
      if (customizePorts.match(/^y(es)?$/i)) {
        for (const db of assignedDbs) {
          const input = await ask(`    Port for ${db.handle} [${db.assignedPort}]: `);
          if (input.trim()) db.assignedPort = parseInt(input.trim(), 10);
        }
      }

      // Customize aliases?
      const customizeAliases = await ask('  Customize aliases? (y/N) [N]: ');
      if (customizeAliases.match(/^y(es)?$/i)) {
        for (const db of assignedDbs) {
          const input = await ask(`    Alias for ${db.handle} [${db.suggestedAlias}]: `);
          if (input.trim()) db.suggestedAlias = deduplicateAlias(input.trim(), assignedDbs);
        }
      }

      // Environment alias
      const envInput = await ask(`  Alias for this environment [${env.handle}]: `);
      configEnvironments[env.handle] = {
        alias:     envInput.trim() || env.handle,
        databases: buildDatabasesConfig(assignedDbs),
      };
    } else {
      // Express: use handle as alias, no prompts
      configEnvironments[env.handle] = {
        alias:     env.handle,
        databases: buildDatabasesConfig(assignedDbs),
      };
    }
  }

  // ── Write config ──────────────────────────────────────────────────────────

  const config = {
    version:      1,
    install_type: installType,
    credentials:  { email },
    defaults:     { lifetime: '7d' },
    environments:    configEnvironments,
    tunnel_defaults: { start_port: 55550, port_increment: 1 },
  };

  closeRL();
  save(config);
  savePassword(password);

  console.log('');
  logger.success(`Config written to ${getConfigPath()}`);
  logger.success(`Credentials stored in ${getConfigDir()}/.credentials (encrypted)`);
  console.log('');
  logger.section('Shell completions');
  installCompletions(/* quiet= */ false);

  console.log('');
  logger.section('Next steps');
  console.log('  aptunnel status         — view all tunnel states');
  console.log('  aptunnel <alias>        — open a tunnel');
  console.log('  aptunnel all            — open all tunnels');
  console.log('  aptunnel --help         — full command reference');
  console.log('');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDatabasesConfig(assignedDbs) {
  const result = {};
  for (const db of assignedDbs) {
    result[db.handle] = { alias: db.suggestedAlias, port: db.assignedPort, type: db.type };
  }
  return result;
}

function deduplicateAlias(alias, allDbs) {
  const used = new Set(allDbs.map(d => d.suggestedAlias));
  if (!used.has(alias)) return alias;
  let i = 2;
  while (used.has(`${alias}-${i}`)) i++;
  return `${alias}-${i}`;
}

// ─── Readline helpers ─────────────────────────────────────────────────────────
// We use a SINGLE readline interface throughout init and only close it at the
// very end, right before handing stdin back to the aptible child process.

let _rl = null;

function getRL() {
  if (!_rl) {
    _rl = createInterface({ input: process.stdin, output: process.stdout });
    _rl.on('close', () => { _rl = null; });
  }
  return _rl;
}

function closeRL() {
  if (_rl) {
    _rl.close();
    _rl = null;
  }
}

function ask(prompt) {
  return new Promise((resolve) => {
    getRL().question(prompt, (answer) => resolve(answer));
  });
}

function askSecret(prompt) {
  // Close the shared readline so we can take over stdin directly.
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
          process.stdin.pause();
          process.stdout.write('\n');
          resolve(chars.join(''));
          return;
        } else if (char === '\u0003') {
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
