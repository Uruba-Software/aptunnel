import { spawnSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { logger } from './logger.js';
import { exists, load } from './config-manager.js';

export const HOOK_NAMES = ['post_login'];

const HOOK_TIMEOUT_MS = 120_000;

/**
 * @returns {object | null} the `hooks` section of the config, or null when unset/unreadable
 */
export function readHooks() {
  if (!exists()) return null;
  try {
    return load().hooks ?? null;
  } catch {
    return null;
  }
}

/**
 * Run the user-configured `hooks.post_login` command after a successful login.
 * The command runs through the shell with APTUNNEL_TOKEN_FILE set to the
 * Aptible token file. A failing hook only warns; it never fails the login.
 * @returns {boolean} true when no hook is set or the hook exited 0
 */
export function runPostLoginHook() {
  const command = readHooks()?.post_login;
  if (!command || typeof command !== 'string' || !command.trim()) return true;

  logger.dim(`Running post_login hook: ${command}`);
  const result = spawnSync(command, {
    shell:   true,
    stdio:   'inherit',
    timeout: HOOK_TIMEOUT_MS,
    env:     { ...process.env, APTUNNEL_TOKEN_FILE: join(homedir(), '.aptible', 'tokens.json') },
  });

  if (result.error || result.status !== 0) {
    const reason = result.error?.message ?? `exit code ${result.status}`;
    logger.warn(`post_login hook failed (${reason}). Login itself succeeded.`);
    return false;
  }
  return true;
}
