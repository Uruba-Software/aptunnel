import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestEnv, writeSampleConfig } from '../helpers.js';

function captureOutput(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try { fn(); } finally { console.log = orig; }
  return lines.join('\n');
}

describe('help command', () => {
  let env;

  afterEach(() => env?.cleanup());

  describe('without config', () => {
    beforeEach(() => { env = createTestEnv(); });

    it('shows version', async () => {
      const { runHelp } = await import('../../src/commands/help.js');
      const output = captureOutput(runHelp);
      assert.ok(output.includes('aptunnel'), 'Should include aptunnel name');
      assert.ok(output.match(/v\d+\.\d+/), 'Should include version number');
    });

    it('shows COMMANDS section', async () => {
      const { runHelp } = await import('../../src/commands/help.js');
      const output = captureOutput(runHelp);
      assert.ok(output.includes('COMMANDS'), 'Should include COMMANDS section');
    });

    it('shows generic hint when no config', async () => {
      const { runHelp } = await import('../../src/commands/help.js');
      const output = captureOutput(runHelp);
      assert.ok(
        output.includes('aptunnel init'),
        'Should suggest running aptunnel init'
      );
    });

    it('shows OPTIONS section', async () => {
      const { runHelp } = await import('../../src/commands/help.js');
      const output = captureOutput(runHelp);
      assert.ok(output.includes('OPTIONS'), 'Should include OPTIONS section');
      assert.ok(output.includes('--help'), 'Should show --help flag');
      assert.ok(output.includes('--version'), 'Should show --version flag');
    });
  });

  describe('with config', () => {
    beforeEach(async () => {
      env = createTestEnv();
      await writeSampleConfig();
    });

    it('shows YOUR DATABASES section', async () => {
      const { runHelp } = await import('../../src/commands/help.js');
      const output = captureOutput(runHelp);
      assert.ok(output.includes('YOUR DATABASES'), 'Should show YOUR DATABASES when config exists');
    });

    it('shows configured database aliases', async () => {
      const { runHelp } = await import('../../src/commands/help.js');
      const output = captureOutput(runHelp);
      assert.ok(output.includes('dev-db'),    'Should show dev-db alias');
      assert.ok(output.includes('dev-redis'), 'Should show dev-redis alias');
    });

    it('shows default environment alias', async () => {
      const { runHelp } = await import('../../src/commands/help.js');
      const output = captureOutput(runHelp);
      assert.ok(output.includes('dev'), 'Should show default env alias');
    });
  });
});
