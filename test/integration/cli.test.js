/**
 * Integration tests — spawn `node bin/aptunnel.js` as a child process
 * and verify exit codes and output.
 */
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createTestEnv, writeSampleConfig, injectMockAptible, restorePath } from '../helpers.js';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const BIN  = path.join(ROOT, 'bin', 'aptunnel.js');

/**
 * Run aptunnel synchronously and return { stdout, stderr, status }.
 */
function run(args = [], extraEnv = {}) {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  };
}

describe('CLI integration', () => {
  // ─── --version ─────────────────────────────────────────────────────────────

  describe('--version', () => {
    it('exits 0', () => {
      const { status } = run(['--version']);
      assert.equal(status, 0);
    });

    it('prints version number', () => {
      const { stdout } = run(['--version']);
      assert.ok(stdout.match(/v\d+\.\d+\.\d+/), `Unexpected output: ${stdout}`);
    });

    it('-v also works', () => {
      const { status, stdout } = run(['-v']);
      assert.equal(status, 0);
      assert.ok(stdout.includes('aptunnel'));
    });
  });

  // ─── --help ────────────────────────────────────────────────────────────────

  describe('--help', () => {
    it('exits 0', () => {
      assert.equal(run(['--help']).status, 0);
    });

    it('contains COMMANDS section', () => {
      const { stdout } = run(['--help']);
      assert.ok(stdout.includes('COMMANDS'), `Missing COMMANDS section. Output:\n${stdout}`);
    });

    it('contains OPTIONS section', () => {
      const { stdout } = run(['--help']);
      assert.ok(stdout.includes('OPTIONS'), 'Missing OPTIONS section');
    });

    it('contains init command', () => {
      const { stdout } = run(['--help']);
      assert.ok(stdout.includes('init'), 'Missing init command');
    });

    it('no args also shows help', () => {
      const { status, stdout } = run([]);
      assert.equal(status, 0);
      assert.ok(stdout.includes('aptunnel'));
    });
  });

  // ─── status (no config) ────────────────────────────────────────────────────

  describe('status without config', () => {
    it('exits non-zero or shows a warning', () => {
      // Without config, status should either exit with error or show a warning.
      // We use a clean temp dir so it never finds a real config.
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aptunnel-int-'));
      const { status, stdout, stderr } = run(['status'], {
        APTUNNEL_CONFIG_HOME: path.join(tmpDir, 'config'),
        APTUNNEL_TEMP_DIR:    path.join(tmpDir, 'tmp'),
      });
      fs.rmSync(tmpDir, { recursive: true, force: true });
      // Should either warn or exit non-zero
      const combined = stdout + stderr;
      assert.ok(
        status !== 0 || combined.toLowerCase().includes('init') || combined.includes('No config'),
        `Expected warning or non-zero exit. Status=${status}\nOutput: ${combined}`
      );
    });
  });

  // ─── config --path ─────────────────────────────────────────────────────────

  describe('config --path', () => {
    it('exits 0 and prints a file path', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aptunnel-int-'));
      const { status, stdout } = run(['config', '--path'], {
        APTUNNEL_CONFIG_HOME: path.join(tmpDir, 'cfg'),
      });
      fs.rmSync(tmpDir, { recursive: true, force: true });
      assert.equal(status, 0);
      assert.ok(stdout.trim().length > 0, 'Should print something');
      assert.ok(
        stdout.includes('config.yaml'),
        `Expected path to contain config.yaml, got: ${stdout}`
      );
    });
  });

  // ─── status with config ────────────────────────────────────────────────────

  describe('status with config', () => {
    let tmpDir;

    before(async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aptunnel-int-'));
      const cfgHome = path.join(tmpDir, 'config');
      const tmpHome = path.join(tmpDir, 'tmp');
      fs.mkdirSync(cfgHome, { recursive: true });
      fs.mkdirSync(tmpHome, { recursive: true });

      // Write a sample config manually (can't use writeSampleConfig since it uses process.env)
      const { default: yaml } = await import('js-yaml');
      const { SAMPLE_CONFIG } = await import('../helpers.js');
      fs.writeFileSync(
        path.join(cfgHome, 'config.yaml'),
        yaml.dump(SAMPLE_CONFIG),
        { mode: 0o600 }
      );
    });

    after(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('exits 0 with a valid config', () => {
      const { status } = run(['status'], {
        APTUNNEL_CONFIG_HOME: path.join(tmpDir, 'config'),
        APTUNNEL_TEMP_DIR:    path.join(tmpDir, 'tmp'),
      });
      assert.equal(status, 0);
    });

    it('shows tunnel table', () => {
      const { stdout } = run(['status'], {
        APTUNNEL_CONFIG_HOME: path.join(tmpDir, 'config'),
        APTUNNEL_TEMP_DIR:    path.join(tmpDir, 'tmp'),
      });
      assert.ok(stdout.includes('TUNNELS'), 'Should show TUNNELS section');
      assert.ok(stdout.includes('dev-db'),  'Should show configured db aliases');
    });
  });

  // ─── unknown command ───────────────────────────────────────────────────────

  describe('unknown command / alias', () => {
    it('exits non-zero for unknown db alias', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aptunnel-int-'));
      const cfgHome = path.join(tmpDir, 'config');
      const { status } = run(['definitely-not-a-real-alias'], {
        APTUNNEL_CONFIG_HOME: cfgHome,
        APTUNNEL_TEMP_DIR:    path.join(tmpDir, 'tmp'),
      });
      fs.rmSync(tmpDir, { recursive: true, force: true });
      assert.notEqual(status, 0, 'Should exit non-zero for unknown alias');
    });
  });
});
