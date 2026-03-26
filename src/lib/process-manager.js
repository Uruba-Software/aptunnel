import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { getProcessInfo, getProcessUptime } from './platform.js';

const TMP = process.platform === 'win32'
  ? (process.env.TEMP ?? 'C:\\Windows\\Temp')
  : '/tmp';

// ─── Path helpers ─────────────────────────────────────────────────────────────

export function pidFilePath(identifier)  { return join(TMP, `aptunnel-${identifier}.pid`); }
export function logFilePath(identifier)  { return join(TMP, `aptunnel-${identifier}.log`); }
export function connFilePath(identifier) { return join(TMP, `aptunnel-${identifier}.conn.json`); }

// ─── PID management ───────────────────────────────────────────────────────────

export function savePid(identifier, pid) {
  writeFileSync(pidFilePath(identifier), String(pid), { mode: 0o600 });
}

export function readPid(identifier) {
  const path = pidFilePath(identifier);
  if (!existsSync(path)) return null;
  const val = parseInt(readFileSync(path, 'utf8').trim(), 10);
  return isNaN(val) ? null : val;
}

export function removePid(identifier) {
  const path = pidFilePath(identifier);
  if (existsSync(path)) unlinkSync(path);
}

/**
 * Check if the process for an identifier is still alive.
 * @param {string} identifier
 * @returns {boolean}
 */
export function isRunning(identifier) {
  const pid = readPid(identifier);
  if (!pid) return false;
  const info = getProcessInfo(pid);
  return info.running;
}

// ─── Connection info ──────────────────────────────────────────────────────────

/**
 * @param {string} identifier
 * @param {{ url: string, host: string, port: number, user: string, password: string, dbName: string }} info
 */
export function saveConnectionInfo(identifier, info) {
  writeFileSync(connFilePath(identifier), JSON.stringify(info, null, 2), { mode: 0o600 });
}

/**
 * @param {string} identifier
 * @returns {object | null}
 */
export function readConnectionInfo(identifier) {
  const path = connFilePath(identifier);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function removeConnectionInfo(identifier) {
  const path = connFilePath(identifier);
  if (existsSync(path)) unlinkSync(path);
}

// ─── Global state ─────────────────────────────────────────────────────────────

/**
 * Scan /tmp for all aptunnel-*.pid files and return status for each.
 * @returns {{ identifier: string, pid: number, running: boolean, uptime: object | null, conn: object | null }[]}
 */
export function getAllRunningTunnels() {
  let files;
  try {
    files = readdirSync(TMP);
  } catch {
    return [];
  }

  return files
    .filter(f => f.startsWith('aptunnel-') && f.endsWith('.pid'))
    .map((f) => {
      const identifier = f.replace(/^aptunnel-/, '').replace(/\.pid$/, '');
      const pid = readPid(identifier);
      if (!pid) return null;

      const info = getProcessInfo(pid);
      const uptime = info.running ? getProcessUptime(pid) : null;
      const conn   = readConnectionInfo(identifier);

      return { identifier, pid, running: info.running, uptime, conn };
    })
    .filter(Boolean);
}

/**
 * Clean up PID + conn files for a given identifier.
 */
export function cleanup(identifier) {
  removePid(identifier);
  removeConnectionInfo(identifier);
}

/**
 * Sanitize a db handle/alias into a safe identifier for filenames.
 */
export function toIdentifier(str) {
  return str.replace(/[^a-zA-Z0-9-_]/g, '-');
}
