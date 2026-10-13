import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { createTestEnv, writeSampleConfig, SAMPLE_CONFIG } from '../helpers.js';

function writeConfigWithHooks(hooks) {
  const cfgFile = path.join(process.env.APTUNNEL_CONFIG_HOME, 'config.yaml');
  fs.writeFileSync(cfgFile, yaml.dump({ ...SAMPLE_CONFIG, hooks }), { mode: 0o600 });
}

function nodeCmd(script) {
  return `"${process.execPath}" -e ${JSON.stringify(script)}`;
}

function silenced(fn) {
  const orig = { log: console.log, warn: console.warn };
  const lines = [];
  console.log  = (...a) => lines.push(a.join(' '));
  console.warn = (...a) => lines.push(a.join(' '));
  try { return { result: fn(), output: lines.join('\n') }; }
  finally { console.log = orig.log; console.warn = orig.warn; }
}

describe('hooks', () => {
  let env;

  beforeEach(() => { env = createTestEnv(); });
  afterEach(() => env?.cleanup());

  it('readHooks returns null without config', async () => {
    const { readHooks } = await import('../../src/lib/hooks.js');
    assert.equal(readHooks(), null);
  });

  it('runPostLoginHook is a no-op when no hook is configured', async () => {
    await writeSampleConfig();
    const { runPostLoginHook } = await import('../../src/lib/hooks.js');
    const { result } = silenced(() => runPostLoginHook());
    assert.equal(result, true);
  });

  it('runs the hook with APTUNNEL_TOKEN_FILE set', async () => {
    const marker = path.join(env.base, 'hook-ran.txt');
    writeConfigWithHooks({
      post_login: nodeCmd(`require('fs').writeFileSync(${JSON.stringify(marker)}, process.env.APTUNNEL_TOKEN_FILE)`),
    });
    const { runPostLoginHook } = await import('../../src/lib/hooks.js');
    const { result } = silenced(() => runPostLoginHook());
    assert.equal(result, true);
    const tokenFile = fs.readFileSync(marker, 'utf8');
    assert.ok(tokenFile.endsWith(path.join('.aptible', 'tokens.json')), `unexpected token file: ${tokenFile}`);
  });

  it('returns false and warns when the hook fails', async () => {
    writeConfigWithHooks({ post_login: nodeCmd('process.exit(3)') });
    const { runPostLoginHook } = await import('../../src/lib/hooks.js');
    const { result, output } = silenced(() => runPostLoginHook());
    assert.equal(result, false);
    assert.ok(output.includes('post_login hook failed'), 'should warn about the failed hook');
  });

  it('config --set-hook and --clear-hook update the config', async () => {
    await writeSampleConfig();
    const { runConfig } = await import('../../src/commands/config.js');
    const { readHooks } = await import('../../src/lib/hooks.js');

    await silenced(() => runConfig(['--set-hook', 'post_login', 'echo hi'])).result;
    assert.deepEqual(readHooks(), { post_login: 'echo hi' });

    await silenced(() => runConfig(['--clear-hook', 'post_login'])).result;
    assert.equal(readHooks(), null);
  });
});
