import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestEnv, writeSampleConfig } from '../helpers.js';

describe('completions', () => {
  let env;

  beforeEach(async () => {
    env = createTestEnv();
    await writeSampleConfig();
  });

  afterEach(() => env.cleanup());

  // Re-import after env is set so getConfigPath() points to test dir
  async function load() {
    return import('../../src/lib/completions.js');
  }

  describe('bashScript()', () => {
    it('contains the shebang line', async () => {
      const { bashScript } = await load();
      assert.ok(bashScript().startsWith('#!/usr/bin/env bash'));
    });

    it('contains aptunnel completion function', async () => {
      const { bashScript } = await load();
      assert.ok(bashScript().includes('_aptunnel_completions'));
    });

    it('registers the completion with `complete`', async () => {
      const { bashScript } = await load();
      assert.ok(bashScript().includes('complete -F _aptunnel_completions aptunnel'));
    });

    it('includes static commands', async () => {
      const { bashScript } = await load();
      const script = bashScript();
      for (const cmd of ['init', 'login', 'status', 'config', 'all']) {
        assert.ok(script.includes(cmd), `Missing command: ${cmd}`);
      }
    });
  });

  describe('zshScript()', () => {
    it('starts with #compdef aptunnel', async () => {
      const { zshScript } = await load();
      assert.ok(zshScript().startsWith('#compdef aptunnel'));
    });

    it('contains _aptunnel function', async () => {
      const { zshScript } = await load();
      assert.ok(zshScript().includes('_aptunnel()'));
    });

    it('includes flag completions', async () => {
      const { zshScript } = await load();
      const script = zshScript();
      assert.ok(script.includes('--close'));
      assert.ok(script.includes('--force'));
      assert.ok(script.includes('--port='));
    });
  });

  describe('fishScript()', () => {
    it('contains completion commands', async () => {
      const { fishScript } = await load();
      assert.ok(fishScript().includes('complete -c aptunnel'));
    });

    it('includes static subcommands', async () => {
      const { fishScript } = await load();
      const script = fishScript();
      for (const cmd of ['init', 'login', 'status', 'config', 'all']) {
        assert.ok(script.includes(`'${cmd}'`), `Missing command: ${cmd}`);
      }
    });
  });
});
