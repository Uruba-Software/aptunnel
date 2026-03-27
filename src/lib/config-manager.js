import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'fs';
import { homedir, platform } from 'os';
import { join, dirname } from 'path';
import { spawnSync } from 'child_process';
import yaml from 'js-yaml';

// Allow tests to redirect config to a temp directory via APTUNNEL_CONFIG_HOME
function getConfigHome() {
  return process.env.APTUNNEL_CONFIG_HOME ?? join(homedir(), '.aptunnel');
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

export function getConfigDir()   { return getConfigHome(); }
export function getConfigPath()  { return join(getConfigHome(), 'config.yaml'); }
export function getCredsPath()   { return join(getConfigHome(), '.credentials'); }

export function exists() {
  return existsSync(getConfigPath());
}

// ─── Load / Save ──────────────────────────────────────────────────────────────

/**
 * Load and parse ~/.aptunnel/config.yaml
 * @returns {object} parsed config
 * @throws if file is missing or unparseable
 */
export function load() {
  if (!existsSync(getConfigPath())) {
    throw new Error(`Config not found. Run \`aptunnel init\` to set up.`);
  }
  try {
    const raw = readFileSync(getConfigPath(), 'utf8');
    const config = yaml.load(raw);
    if (!config || typeof config !== 'object') {
      throw new Error('Config file is empty or invalid.');
    }
    return config;
  } catch (e) {
    if (e.message.startsWith('Config')) throw e;
    throw new Error(`Config file is corrupted: ${e.message}. Run \`aptunnel init\` to reinitialize.`);
  }
}

/**
 * Write config object back to ~/.aptunnel/config.yaml
 * @param {object} config
 */
export function save(config) {
  ensureConfigDir();
  const raw = yaml.dump(config, { lineWidth: 120, noRefs: true });
  writeFileSync(getConfigPath(), raw, { mode: 0o600 });
}

// ─── Credentials ─────────────────────────────────────────────────────────────

/**
 * Read password from ~/.aptunnel/.credentials
 * @returns {string | null}
 */
export function readPassword() {
  if (!existsSync(getCredsPath())) return null;
  try {
    const content = readFileSync(getCredsPath(), 'utf8');
    const match = content.match(/^APTUNNEL_PASSWORD=(.+)$/m);
    return match?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Save password to ~/.aptunnel/.credentials with restricted permissions.
 * @param {string} password
 */
export function savePassword(password) {
  ensureConfigDir();
  const credsPath = getCredsPath();
  writeFileSync(credsPath, `APTUNNEL_PASSWORD=${password}\n`, { mode: 0o600 });

  if (platform() === 'win32') {
    // On Windows chmod doesn't restrict access — use icacls
    const username = process.env.USERNAME ?? process.env.USER ?? '';
    if (username) {
      const r = spawnSync('icacls', [credsPath, '/inheritance:r', '/grant:r', `${username}:(R,W)`], { encoding: 'utf8' });
      if (r.status !== 0) {
        process.stderr.write(`[aptunnel] Warning: could not restrict permissions on credentials file: ${credsPath}\n`);
      }
    } else {
      process.stderr.write(`[aptunnel] Warning: could not determine current user — credentials file may not be permission-restricted.\n`);
    }
  }
}

// ─── Environment helpers ───────────────────────────────────────────────────────

/**
 * Resolve an environment alias or handle to its full handle.
 * @param {string} aliasOrHandle
 * @returns {string | null}
 */
export function getEnvironment(aliasOrHandle) {
  const config = load();
  const envs = config.environments ?? {};

  // Direct match by handle
  if (envs[aliasOrHandle]) return aliasOrHandle;

  // Match by alias
  for (const [handle, env] of Object.entries(envs)) {
    if (env.alias === aliasOrHandle) return handle;
  }

  return null;
}

/**
 * Resolve a database alias or handle across all environments.
 * @param {string} aliasOrHandle
 * @returns {{ handle: string, environment: string, port: number, type: string, alias: string } | null}
 */
export function getDatabase(aliasOrHandle) {
  const config = load();

  for (const [envHandle, env] of Object.entries(config.environments ?? {})) {
    const dbs = env.databases ?? {};

    for (const [dbHandle, db] of Object.entries(dbs)) {
      if (dbHandle === aliasOrHandle || db.alias === aliasOrHandle) {
        return {
          handle:      dbHandle,
          environment: envHandle,
          port:        db.port,
          type:        db.type ?? 'unknown',
          alias:       db.alias ?? dbHandle,
        };
      }
    }
  }

  return null;
}

/**
 * Return the default environment handle.
 * @returns {string | null}
 */
export function getDefaultEnv() {
  const config = load();
  return config.defaults?.environment ?? null;
}

/**
 * Update the port for a database.
 * @param {string} aliasOrHandle
 * @param {number} port
 */
export function setPort(aliasOrHandle, port) {
  const config = load();

  for (const [, env] of Object.entries(config.environments ?? {})) {
    const dbs = env.databases ?? {};
    for (const [dbHandle, db] of Object.entries(dbs)) {
      if (dbHandle === aliasOrHandle || db.alias === aliasOrHandle) {
        db.port = port;
        save(config);
        return;
      }
    }
  }

  throw new Error(`Database not found: ${aliasOrHandle}`);
}

/**
 * Return all databases for an environment (resolved by alias or handle).
 * @param {string} envAliasOrHandle
 * @returns {{ handle: string, alias: string, port: number, type: string }[]}
 */
export function getAllTunnelTargets(envAliasOrHandle) {
  const config = load();
  const envHandle = getEnvironment(envAliasOrHandle) ?? envAliasOrHandle;
  const env = config.environments?.[envHandle];

  if (!env) return [];

  return Object.entries(env.databases ?? {}).map(([handle, db]) => ({
    handle,
    alias: db.alias ?? handle,
    port:  db.port,
    type:  db.type ?? 'unknown',
    environment: envHandle,
  }));
}

/**
 * Return every database across all environments.
 * @returns {{ handle: string, alias: string, port: number, type: string, environment: string, envAlias: string }[]}
 */
export function getAllDatabases() {
  const config = load();
  const result = [];

  for (const [envHandle, env] of Object.entries(config.environments ?? {})) {
    for (const [dbHandle, db] of Object.entries(env.databases ?? {})) {
      result.push({
        handle:      dbHandle,
        alias:       db.alias ?? dbHandle,
        port:        db.port,
        type:        db.type ?? 'unknown',
        environment: envHandle,
        envAlias:    env.alias ?? envHandle,
      });
    }
  }

  return result;
}

/**
 * Find the next free port starting from tunnel_defaults.start_port.
 * @returns {number}
 */
export function nextAvailablePort() {
  const config = load();
  const start = config.tunnel_defaults?.start_port ?? 55550;

  const usedPorts = new Set();
  for (const env of Object.values(config.environments ?? {})) {
    for (const db of Object.values(env.databases ?? {})) {
      if (db.port) usedPorts.add(db.port);
    }
  }

  let port = start;
  while (usedPorts.has(port)) port++;
  return port;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function ensureConfigDir() {
  const dir = getConfigHome();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}
