/**
 * Shared test helpers for aptunnel test suite.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// ─── Platform detection ───────────────────────────────────────────────────────

export const isWindows = os.platform() === 'win32';
export const isMacOS   = os.platform() === 'darwin';
export const isLinux   = os.platform() === 'linux';

export function skipOnWindows(t, reason = 'Not applicable on Windows') {
  if (isWindows) t.skip(reason);
}

export function skipOnMac(t, reason = 'Not applicable on macOS') {
  if (isMacOS) t.skip(reason);
}

export function skipOnLinux(t, reason = 'Not applicable on Linux') {
  if (isLinux) t.skip(reason);
}

// ─── Mock aptible PATH injection ──────────────────────────────────────────────

export const MOCK_DIR  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'mocks');
const _originalPath    = process.env.PATH;

export function injectMockAptible() {
  process.env.PATH = `${MOCK_DIR}${path.delimiter}${process.env.PATH}`;
}

export function restorePath() {
  process.env.PATH = _originalPath;
}

// ─── Isolated temp directories ────────────────────────────────────────────────

/**
 * Create an isolated temp dir for a test and set both APTUNNEL_CONFIG_HOME
 * and APTUNNEL_TEMP_DIR to subdirectories within it.
 * Returns the base dir and cleanup function.
 */
export function createTestEnv(prefix = 'aptunnel-test-') {
  const base    = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const cfgHome = path.join(base, 'config');
  const tmpHome = path.join(base, 'tmp');
  fs.mkdirSync(cfgHome, { recursive: true });
  fs.mkdirSync(tmpHome, { recursive: true });

  const prev = {
    configHome: process.env.APTUNNEL_CONFIG_HOME,
    tempDir:    process.env.APTUNNEL_TEMP_DIR,
  };

  process.env.APTUNNEL_CONFIG_HOME = cfgHome;
  process.env.APTUNNEL_TEMP_DIR    = tmpHome;

  function cleanup() {
    process.env.APTUNNEL_CONFIG_HOME = prev.configHome ?? '';
    process.env.APTUNNEL_TEMP_DIR    = prev.tempDir    ?? '';
    if (prev.configHome === undefined) delete process.env.APTUNNEL_CONFIG_HOME;
    if (prev.tempDir    === undefined) delete process.env.APTUNNEL_TEMP_DIR;
    fs.rmSync(base, { recursive: true, force: true });
  }

  return { base, cfgHome, tmpHome, cleanup };
}

// ─── Sample config fixture ────────────────────────────────────────────────────

export const SAMPLE_CONFIG = {
  version: 1,
  credentials: { email: 'test@example.com' },
  defaults: { environment: 'my-env-dev-abc123', lifetime: '7d' },
  environments: {
    'my-env-dev-abc123': {
      alias: 'dev',
      databases: {
        'mydb-dev': {
          alias: 'dev-db',
          port:  55550,
          type:  'postgresql',
        },
        'mydb-dev-redis': {
          alias: 'dev-redis',
          port:  55551,
          type:  'redis',
        },
      },
    },
    'my-env-staging-def456': {
      alias: 'staging',
      databases: {
        'mydb-staging': {
          alias: 'stg-db',
          port:  55552,
          type:  'postgresql',
        },
      },
    },
  },
  tunnel_defaults: { start_port: 55550, port_increment: 1 },
};

/**
 * Write SAMPLE_CONFIG to the current APTUNNEL_CONFIG_HOME.
 * Also writes a dummy credentials file.
 * Must be called after createTestEnv().
 */
export async function writeSampleConfig() {
  const { default: yaml } = await import('js-yaml');
  const cfgDir    = process.env.APTUNNEL_CONFIG_HOME;
  const cfgFile   = path.join(cfgDir, 'config.yaml');
  const credsFile = path.join(cfgDir, '.credentials');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(cfgFile,   yaml.dump(SAMPLE_CONFIG), { mode: 0o600 });
  fs.writeFileSync(credsFile, 'APTUNNEL_PASSWORD=testpassword\n', { mode: 0o600 });
}
