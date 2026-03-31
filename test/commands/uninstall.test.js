import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTestEnv, writeSampleConfig } from '../helpers.js';

// Skip the actual npm uninstall step in all tests.
process.env.APTUNNEL_SKIP_NPM_UNINSTALL = '1';

async function captureAsync(fn) {
  const lines = [];
  const origLog  = console.log;
  const origWarn = console.warn;
  const origErr  = console.error;
  console.log   = (...a) => lines.push(a.join(' '));
  console.warn  = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  try { await fn(); }
  finally {
    console.log   = origLog;
    console.warn  = origWarn;
    console.error = origErr;
  }
  return lines.join('\n');
}

describe('uninstall command', () => {
  let env;

  beforeEach(async () => {
    env = createTestEnv();
    await writeSampleConfig();
  });

  afterEach(() => env?.cleanup());

  it('removes config.yaml', async () => {
    const configPath = path.join(process.env.APTUNNEL_CONFIG_HOME, 'config.yaml');
    assert.ok(fs.existsSync(configPath), 'config.yaml should exist before uninstall');

    const { runUninstall } = await import('../../src/commands/uninstall.js');
    await captureAsync(() => runUninstall([]));

    assert.ok(!fs.existsSync(configPath), 'config.yaml should be removed after uninstall');
  });

  it('removes .credentials', async () => {
    const credsPath = path.join(process.env.APTUNNEL_CONFIG_HOME, '.credentials');
    assert.ok(fs.existsSync(credsPath), '.credentials should exist before uninstall');

    const { runUninstall } = await import('../../src/commands/uninstall.js');
    await captureAsync(() => runUninstall([]));

    assert.ok(!fs.existsSync(credsPath), '.credentials should be removed after uninstall');
  });

  it('--force removes the entire config directory', async () => {
    const configDir = process.env.APTUNNEL_CONFIG_HOME;
    assert.ok(fs.existsSync(configDir), 'Config dir should exist before uninstall');

    const { runUninstall } = await import('../../src/commands/uninstall.js');
    await captureAsync(() => runUninstall(['--force']));

    assert.ok(!fs.existsSync(configDir), 'Config dir should be gone after --force uninstall');
  });

  it('is idempotent — does not throw when config files are already missing', async () => {
    // Delete files beforehand
    const configPath = path.join(process.env.APTUNNEL_CONFIG_HOME, 'config.yaml');
    const credsPath  = path.join(process.env.APTUNNEL_CONFIG_HOME, '.credentials');
    fs.rmSync(configPath, { force: true });
    fs.rmSync(credsPath,  { force: true });

    const { runUninstall } = await import('../../src/commands/uninstall.js');
    await assert.doesNotReject(() => runUninstall([]));
  });

  it('--force is idempotent — does not throw when config dir is already missing', async () => {
    const configDir = process.env.APTUNNEL_CONFIG_HOME;
    fs.rmSync(configDir, { recursive: true, force: true });

    const { runUninstall } = await import('../../src/commands/uninstall.js');
    await assert.doesNotReject(() => runUninstall(['--force']));
  });
});
