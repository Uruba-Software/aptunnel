import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestEnv, writeSampleConfig } from '../helpers.js';

function captureAll(fn, args = []) {
  const lines = [];
  const origLog  = console.log;
  const origWarn = console.warn;
  const origErr  = console.error;
  console.log  = (...a) => lines.push(a.join(' '));
  console.warn = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  try { fn(args); } finally {
    console.log   = origLog;
    console.warn  = origWarn;
    console.error = origErr;
  }
  return lines.join('\n');
}

describe('dbs command', () => {
  let env;

  afterEach(() => env?.cleanup());

  describe('without config', () => {
    beforeEach(() => { env = createTestEnv(); });

    it('shows a warning when no config exists', async () => {
      const { runDbs } = await import('../../src/commands/dbs.js');
      const output = captureAll(runDbs);
      assert.ok(output.includes('init') || output.includes('No config'), 'Should mention init or no config');
    });
  });

  describe('with config', () => {
    beforeEach(async () => {
      env = createTestEnv();
      await writeSampleConfig();
    });

    it('lists all databases across all environments', async () => {
      const { runDbs } = await import('../../src/commands/dbs.js');
      const output = captureAll(runDbs);
      assert.ok(output.includes('dev-db'),    'Should show dev-db alias');
      assert.ok(output.includes('dev-redis'), 'Should show dev-redis alias');
      assert.ok(output.includes('stg-db'),    'Should show stg-db alias');
    });

    it('shows column headers', async () => {
      const { runDbs } = await import('../../src/commands/dbs.js');
      const output = captureAll(runDbs);
      assert.ok(output.includes('ALIAS'),    'Should show ALIAS column');
      assert.ok(output.includes('TYPE'),     'Should show TYPE column');
      assert.ok(output.includes('PORT'),     'Should show PORT column');
      assert.ok(output.includes('ENVIRONMENT'), 'Should show ENVIRONMENT column');
    });

    it('shows correct port numbers', async () => {
      const { runDbs } = await import('../../src/commands/dbs.js');
      const output = captureAll(runDbs);
      assert.ok(output.includes('55550'), 'Should show port 55550');
      assert.ok(output.includes('55551'), 'Should show port 55551');
      assert.ok(output.includes('55552'), 'Should show port 55552');
    });

    it('shows environment aliases', async () => {
      const { runDbs } = await import('../../src/commands/dbs.js');
      const output = captureAll(runDbs);
      assert.ok(output.includes('dev'),     'Should show dev environment alias');
      assert.ok(output.includes('staging'), 'Should show staging environment alias');
    });

    it('filters by environment with --env flag', async () => {
      const { runDbs } = await import('../../src/commands/dbs.js');
      const output = captureAll(runDbs, ['--env=dev']);
      assert.ok(output.includes('dev-db'),        'Should show dev-db');
      assert.ok(output.includes('dev-redis'),      'Should show dev-redis');
      assert.ok(!output.includes('stg-db'),        'Should not show stg-db');
    });

    it('shows warning for unknown environment', async () => {
      const { runDbs } = await import('../../src/commands/dbs.js');
      const output = captureAll(runDbs, ['--env=nonexistent']);
      assert.ok(output.includes('No databases found'), 'Should warn about missing env');
    });
  });
});
