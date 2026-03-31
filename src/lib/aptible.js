import { spawnSync, spawn } from 'child_process';
import { readFileSync, existsSync, writeFileSync, openSync, closeSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';

// On Windows, .cmd wrappers require a shell to be resolved by CreateProcess.
const SHELL_OPT = process.platform === 'win32' ? { shell: true } : {};

function getTempDir() {
  return process.env.APTUNNEL_TEMP_DIR ?? tmpdir();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function run(args, opts = {}) {
  // Destructure to avoid `...opts` overwriting the merged env object below
  const { env: envOverrides = {}, ...spawnOpts } = opts;
  const env = { ...process.env, ...envOverrides };
  return spawnSync('aptible', args, { encoding: 'utf8', env, ...SHELL_OPT, ...spawnOpts });
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
  const result = spawnSync('aptible', ['version'], { encoding: 'utf8', ...SHELL_OPT });
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

    // stdio: 'inherit' — aptible reads from fd 0 directly at OS level,
    // independent of Node.js stream state. Do NOT call process.stdin.resume()
    // here: flowing mode with no listener would consume the user's 2FA keystrokes
    // before aptible gets them.
    const child = spawn('aptible', args, { stdio: 'inherit', ...SHELL_OPT });

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
    const logFile    = join(getTempDir(), `aptunnel-${identifier}.log`);

    // Open the log file synchronously so we have a real fd to hand to spawn.
    // createWriteStream has fd=null until 'open' fires; spawn rejects that.
    const logFd = openSync(logFile, 'w');

    const args = ['db:tunnel', dbHandle, '--environment', environment, '--port', String(port)];
    const child = spawn('aptible', args, {
      // Windows: do NOT use detached:true. With DETACHED_PROCESS set, cmd.exe has
      // no console and calls AllocConsole() — which resets the process's standard
      // handles, overriding our STARTF_USESTDHANDLES file descriptors. aptible then
      // writes to the new hidden console instead of our log file, the poll never
      // sees "Connect at", and times out after 60 s.
      // Without detached, cmd.exe inherits the parent console and respects our
      // explicit file handles. child.unref() is sufficient on Windows: child
      // processes are not killed when the parent exits (unlike Unix).
      //
      // Linux/macOS: detached:true puts the process in its own process group so it
      // is not reached by SIGHUP when the user closes their terminal.
      detached:    process.platform !== 'win32',
      stdio:       ['ignore', logFd, logFd],
      windowsHide: true,
      ...SHELL_OPT,
    });

    // Parent no longer needs the fd — the child has its own dup'd copy
    closeSync(logFd);

    child.unref();

    // Poll the log file until aptible prints "Connect at" or an error, or we time out.
    // A fixed 5s wait was too short for slow SSH connections.
    const POLL_INTERVAL_MS = 500;
    const TIMEOUT_MS       = 60_000; // 60 seconds max
    let   elapsed          = 0;

    const poll = setInterval(() => {
      elapsed += POLL_INTERVAL_MS;

      let logContent = '';
      try { logContent = readFileSync(logFile, 'utf8'); } catch { /* file not yet created */ }

      const lower = logContent.toLowerCase();

      // Fatal errors — fail immediately
      if (lower.includes('unauthorized') || lower.includes('token has expired') || lower.includes('not authenticated')) {
        clearInterval(poll);
        reject(new Error('AUTH_EXPIRED'));
        return;
      }
      if (lower.includes('already in use') || lower.includes('address already in use')) {
        clearInterval(poll);
        reject(new Error('PORT_IN_USE'));
        return;
      }

      // Success: aptible printed the connection URL.
      // Check this BEFORE the liveness check so a fast-exiting process (or test mock)
      // that printed "Connect at" before dying is still treated as success.
      if (lower.includes('connect at') || lower.includes('connected.')) {
        clearInterval(poll);
        const conn = parseConnectionInfo(logContent, port);
        resolve({ pid: child.pid, port, ...conn });
        return;
      }

      // Process died unexpectedly (without printing a success line).
      // EPERM = process exists but we can't signal it (Windows cross-process-group) → treat as alive.
      // ESRCH = no such process → actually dead.
      try { process.kill(child.pid, 0); } catch (e) {
        if (e.code !== 'EPERM') {
          clearInterval(poll);
          reject(new Error(`Tunnel process died. Log:\n${logContent.slice(-500)}`));
          return;
        }
      }

      // Timed out
      if (elapsed >= TIMEOUT_MS) {
        clearInterval(poll);
        reject(new Error(`Tunnel timed out after ${TIMEOUT_MS / 1000}s. Log:\n${logContent.slice(-500)}`));
      }
    }, POLL_INTERVAL_MS);

    child.on('error', (err) => {
      clearInterval(poll);
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
      { stdio: 'inherit', ...SHELL_OPT }
    );
    child.on('close', resolve);
    child.on('error', reject);
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9-_]/g, '-');
}

