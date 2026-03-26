import { spawnSync, spawn } from 'child_process';
import { readFileSync, existsSync, writeFileSync, createWriteStream } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function run(args, opts = {}) {
  const env = { ...process.env, ...opts.env };
  return spawnSync('aptible', args, { encoding: 'utf8', env, ...opts });
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Check if the `aptible` binary is present in PATH.
 * @returns {boolean}
 */
export function isInstalled() {
  const result = spawnSync('aptible', ['version'], { encoding: 'utf8' });
  return result.status === 0 && !result.error;
}

/**
 * @returns {string} version string, e.g. "aptible-toolbelt v0.20.0"
 */
export function getVersion() {
  const result = run(['version']);
  return result.stdout?.trim() ?? 'unknown';
}

/**
 * Log in to Aptible. Uses stdio: 'inherit' so 2FA prompts reach the terminal.
 * @param {{ email: string, password: string, lifetime?: string, otp?: string }} opts
 * @returns {Promise<boolean>}
 */
export function login({ email, password, lifetime = '7d', otp } = {}) {
  return new Promise((resolve) => {
    const args = ['login', `--lifetime=${lifetime}`];
    if (email)    args.push(`--email=${email}`);
    if (password) args.push(`--password=${password}`);
    if (otp)      args.push(`--otp=${otp}`);

    // stdio: 'inherit' is critical — aptible prompts for 2FA interactively
    const child = spawn('aptible', args, { stdio: 'inherit' });

    child.on('close', (code) => resolve(code === 0));
    child.on('error', ()     => resolve(false));
  });
}

/**
 * Read and decode the current Aptible token from ~/.aptible/tokens.json
 * @returns {{ email: string, issuedAt: Date, expiresAt: Date, remainingHours: number, isExpired: boolean } | null}
 */
export function getTokenInfo() {
  const tokensPath = join(homedir(), '.aptible', 'tokens.json');
  if (!existsSync(tokensPath)) return null;

  let tokens;
  try {
    tokens = JSON.parse(readFileSync(tokensPath, 'utf8'));
  } catch {
    return null;
  }

  // tokens.json is an object keyed by URL; pick the first entry
  const entries = Object.values(tokens);
  if (!entries.length) return null;

  const token = entries[0];

  // Decode JWT payload (middle segment, base64url encoded)
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // base64url → base64
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded  = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));

    const issuedAt  = decoded.iat ? new Date(decoded.iat * 1000) : null;
    const expiresAt = new Date(decoded.exp * 1000);
    const now       = new Date();

    const remainingMs    = expiresAt - now;
    const remainingHours = Math.max(0, Math.floor(remainingMs / 3_600_000));
    const isExpired      = remainingMs <= 0;

    return {
      email: decoded.email ?? decoded.sub ?? 'unknown',
      issuedAt,
      expiresAt,
      remainingHours,
      isExpired,
    };
  } catch {
    return null;
  }
}

/**
 * List all Aptible environments the current user has access to.
 * @returns {{ id: string, handle: string }[]}
 */
export function listEnvironments() {
  const result = run(['environment:list'], {
    env: { APTIBLE_OUTPUT_FORMAT: 'json' },
  });

  if (result.status !== 0) return [];

  const data = parseJson(result.stdout);
  if (!Array.isArray(data)) return [];

  return data.map((e) => ({ id: String(e.id ?? e.ID ?? ''), handle: e.handle ?? e.Handle ?? '' }));
}

/**
 * List databases for a given environment.
 * @param {string} environmentHandle
 * @returns {{ id: string, handle: string, type: string, status: string }[]}
 */
export function listDatabases(environmentHandle) {
  const result = run(['db:list', '--environment', environmentHandle], {
    env: { APTIBLE_OUTPUT_FORMAT: 'json' },
  });

  if (result.status !== 0) return [];

  const data = parseJson(result.stdout);
  if (!Array.isArray(data)) return [];

  return data.map((db) => ({
    id:     String(db.id ?? db.ID ?? ''),
    handle: db.handle ?? db.Handle ?? '',
    type:   db.type   ?? db.Type   ?? 'unknown',
    status: db.status ?? db.Status ?? 'unknown',
  }));
}

/**
 * Open a tunnel to a database in the background.
 *
 * Spawns `aptible db:tunnel` detached, writes stdout to a log file,
 * saves PID to a PID file, waits a few seconds, then parses connection info.
 *
 * @param {{ dbHandle: string, environment: string, port: number }} opts
 * @returns {Promise<{ pid: number, port: number, connectionUrl: string, credentials: object }>}
 */
export function openTunnel({ dbHandle, environment, port }) {
  return new Promise((resolve, reject) => {
    const identifier = sanitize(dbHandle);
    const logFile    = `/tmp/aptunnel-${identifier}.log`;
    const pidFile    = `/tmp/aptunnel-${identifier}.pid`;

    const logStream = createWriteStream(logFile, { flags: 'w' });

    const args = ['db:tunnel', dbHandle, '--environment', environment, '--port', String(port)];
    const child = spawn('aptible', args, {
      detached: true,
      stdio:    ['ignore', logStream, logStream],
    });

    child.unref();

    // Save PID immediately
    try {
      writeFileSync(pidFile, String(child.pid), { mode: 0o600 });
    } catch (e) {
      reject(new Error(`Failed to write PID file: ${e.message}`));
      return;
    }

    // Wait ~5 seconds for aptible to establish the tunnel and print connection info
    setTimeout(async () => {
      logStream.end();

      let logContent = '';
      try { logContent = readFileSync(logFile, 'utf8'); } catch { /* ignore */ }

      // Check for auth / error conditions
      const lower = logContent.toLowerCase();
      if (lower.includes('unauthorized') || lower.includes('token has expired') || lower.includes('not authenticated')) {
        reject(new Error('AUTH_EXPIRED'));
        return;
      }
      if (lower.includes('already in use') || lower.includes('address already in use')) {
        reject(new Error('PORT_IN_USE'));
        return;
      }

      // Verify process is still alive
      try {
        process.kill(child.pid, 0);
      } catch {
        reject(new Error(`Tunnel process died. Log:\n${logContent.slice(-500)}`));
        return;
      }

      // Parse connection info from log
      const conn = parseConnectionInfo(logContent, port);
      resolve({ pid: child.pid, port, ...conn });
    }, 5000);

    child.on('error', (err) => {
      logStream.end();
      reject(new Error(`Failed to spawn aptible: ${err.message}`));
    });
  });
}

/**
 * Parse aptible db:tunnel output for connection info.
 * Aptible prints something like:
 *   Connect at postgresql://aptible:PASSWORD@localhost.aptible.in:PORT/db
 * @param {string} log
 * @param {number} port
 * @returns {{ connectionUrl: string, credentials: { host, port, user, password, dbName } }}
 */
function parseConnectionInfo(log, port) {
  // Try to find a connection URL in the log
  const urlMatch = log.match(/Connect at (\S+:\/\/\S+)/i)
    ?? log.match(/(postgresql|mysql|redis|mongodb):\/\/[^\s]+/i);

  const connectionUrl = urlMatch?.[1] ?? '';

  let credentials = { host: 'localhost.aptible.in', port, user: 'aptible', password: null, dbName: null };

  if (connectionUrl) {
    try {
      const parsed = new URL(connectionUrl);
      credentials = {
        host:     parsed.hostname,
        port:     parsed.port ? Number(parsed.port) : port,
        user:     parsed.username ?? 'aptible',
        password: parsed.password ?? null,
        dbName:   parsed.pathname?.replace(/^\//, '') ?? null,
      };
    } catch { /* keep defaults */ }
  } else {
    // Fallback: extract individual fields from log lines
    const hostMatch = log.match(/host[:\s]+([a-z0-9.-]+\.aptible\.in)/i);
    const passMatch = log.match(/password[:\s]+([^\s]+)/i);
    const userMatch = log.match(/user(?:name)?[:\s]+([^\s]+)/i);
    if (hostMatch) credentials.host     = hostMatch[1];
    if (passMatch) credentials.password = passMatch[1];
    if (userMatch) credentials.user     = userMatch[1];
  }

  return { connectionUrl, credentials };
}

/**
 * List apps for an environment.
 * @param {string} environmentHandle
 * @returns {{ id: string, handle: string, status: string }[]}
 */
export function listApps(environmentHandle) {
  const result = run(['apps', '--environment', environmentHandle], {
    env: { APTIBLE_OUTPUT_FORMAT: 'json' },
  });

  if (result.status !== 0) return [];

  const data = parseJson(result.stdout);
  if (!Array.isArray(data)) return [];

  return data.map((app) => ({
    id:     String(app.id ?? app.ID ?? ''),
    handle: app.handle ?? app.Handle ?? '',
    status: app.status ?? app.Status ?? 'unknown',
  }));
}

/**
 * Stream logs for an app to the terminal (blocking).
 * @param {{ appHandle: string, environment: string }} opts
 * @returns {Promise<void>}
 */
export function getLogs({ appHandle, environment }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'aptible',
      ['logs', '--app', appHandle, '--environment', environment],
      { stdio: 'inherit' }
    );
    child.on('close', resolve);
    child.on('error', reject);
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9-_]/g, '-');
}

