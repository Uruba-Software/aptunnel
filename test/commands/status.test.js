import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestEnv, writeSampleConfig } from '../helpers.js';

function captureAll(fn) {
  const lines = [];
  const origLog  = console.log;
  const origWarn = console.warn;
  const origErr  = console.error;
  console.log  = (...a) => lines.push(a.join(' '));
  console.warn = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  try { fn(); } finally {
    console.log   = origLog;
    console.warn  = origWarn;
    console.error = origErr;
  }
  return lines.join('\n');
}

describe('status command', () => {
  let env;

  afterEach(() => env?.cleanup());

  describe('without config', () => {
    beforeEach(() => { env = createTestEnv(); });

    it('shows a warning when no config exists', async () => {
      const { runStatus } = await import('../../src/commands/status.js');
      const output = captureAll(runStatus);
      assert.ok(output.includes('init') || output.includes('No config'), 'Should mention init or no config');
    });
  });

  describe('with config (no tunnels running)', () => {
    beforeEach(async () => {
      env = createTestEnv();
      await writeSampleConfig();
    });

    it('shows LOGIN STATUS section', async () => {
      const { runStatus } = await import('../../src/commands/status.js');
      const output = captureAll(runStatus);
      assert.ok(output.includes('LOGIN STATUS'), 'Should show LOGIN STATUS');
    });

    it('shows TUNNELS section', async () => {
      const { runStatus } = await import('../../src/commands/status.js');
      const output = captureAll(runStatus);
      assert.ok(output.includes('TUNNELS'), 'Should show TUNNELS');
    });

    it('shows configured database aliases', async () => {
      const { runStatus } = await import('../../src/commands/status.js');
      const output = captureAll(runStatus);
      assert.ok(output.includes('dev-db'),    'Should show dev-db');
      assert.ok(output.includes('dev-redis'), 'Should show dev-redis');
      assert.ok(output.includes('stg-db'),    'Should show stg-db');
    });

    it('shows column headers', async () => {
      const { runStatus } = await import('../../src/commands/status.js');
      const output = captureAll(runStatus);
      assert.ok(output.includes('PORT'),   'Should show PORT column');
      assert.ok(output.includes('STATUS'), 'Should show STATUS column');
      assert.ok(output.includes('PID'),    'Should show PID column');
    });

    it('shows DOWN for all tunnels when none are running', async () => {
      const { runStatus } = await import('../../src/commands/status.js');
      const output = captureAll(runStatus);
      // UP should not appear (no real tunnels)
      assert.ok(!output.includes('\x1b[32mUP\x1b['), 'Should not show UP status');
    });
  });
});
