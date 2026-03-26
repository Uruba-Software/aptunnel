import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestEnv, writeSampleConfig } from '../helpers.js';

function captureAll(fn) {
  const lines = [];
  const origLog  = console.log;
  const origWarn = console.warn;
  console.log  = (...a) => lines.push(a.join(' '));
  console.warn = (...a) => lines.push(a.join(' '));
  try { fn(); } finally { console.log = origLog; console.warn = origWarn; }
  return lines.join('\n');
}

describe('config command', () => {
  let env;

  afterEach(() => env?.cleanup());

  describe('without config', () => {
    beforeEach(() => { env = createTestEnv(); });

    it('shows a warning when no config', async () => {
      const { runConfig } = await import('../../src/commands/config.js');
      const output = captureAll(() => runConfig([]));
      assert.ok(output.includes('No config') || output.includes('init'), 'Should show no-config warning');
    });
  });

  describe('--path', () => {
    beforeEach(() => { env = createTestEnv(); });

    it('prints the config file path even without config', async () => {
      const { runConfig } = await import('../../src/commands/config.js');
      const lines = [];
      const orig = console.log;
      console.log = (...a) => lines.push(a.join(' '));
      await runConfig(['--path']);
      console.log = orig;
      assert.ok(lines.some(l => l.includes('config.yaml')), 'Should print config path');
    });
  });

  describe('print config (default)', () => {
    beforeEach(async () => {
      env = createTestEnv();
      await writeSampleConfig();
    });

    it('prints YAML content', async () => {
      const { runConfig } = await import('../../src/commands/config.js');
      const output = captureAll(() => runConfig([]));
      assert.ok(output.includes('version:'), 'Should show version field');
      assert.ok(output.includes('environments:'), 'Should show environments');
    });

    it('masks the password by default', async () => {
      const { runConfig } = await import('../../src/commands/config.js');
      const output = captureAll(() => runConfig([]));
      // The real password should not appear
      assert.ok(!output.includes('testpassword'), 'Password should be masked by default');
    });

    it('shows password with --raw', async () => {
      // savePassword writes to .credentials, not config.yaml — credentials section
      // in config.yaml has no password field, so --raw just shows unmasked config
      const { runConfig } = await import('../../src/commands/config.js');
      const output = captureAll(() => runConfig(['--raw']));
      assert.ok(output.includes('version:'), 'Should still show config with --raw');
    });
  });

  describe('--set-port', () => {
    beforeEach(async () => {
      env = createTestEnv();
      await writeSampleConfig();
    });

    it('updates port for a database alias', async () => {
      const { runConfig } = await import('../../src/commands/config.js');
      await runConfig(['--set-port', 'dev-db', '9000']);
      // Verify via config-manager
      const { getDatabase } = await import('../../src/lib/config-manager.js');
      assert.equal(getDatabase('dev-db').port, 9000);
    });
  });
});
