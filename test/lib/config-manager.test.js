import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isWindows, createTestEnv, writeSampleConfig, SAMPLE_CONFIG } from '../helpers.js';

// Import AFTER setting env vars in each test so getConfigHome() picks them up
async function loadModule() {
  // Force re-import each time by using a cache-busting parameter is not possible in ESM;
  // instead we rely on the module reading process.env at call-time (which it does via getConfigHome()).
  return import('../../src/lib/config-manager.js');
}

describe('config-manager', () => {
  let env;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    env.cleanup();
  });

  // ─── exists / load / save ──────────────────────────────────────────────────

  describe('exists()', () => {
    it('returns false when config does not exist', async () => {
      const { exists } = await loadModule();
      assert.equal(exists(), false);
    });

    it('returns true after saving config', async () => {
      const { exists, save } = await loadModule();
      save({ version: 1 });
      assert.equal(exists(), true);
    });
  });

  describe('save() / load()', () => {
    it('round-trips a config object', async () => {
      const { save, load } = await loadModule();
      save(SAMPLE_CONFIG);
      const loaded = load();
      assert.deepEqual(loaded.credentials, SAMPLE_CONFIG.credentials);
      assert.deepEqual(loaded.defaults, SAMPLE_CONFIG.defaults);
      assert.ok(loaded.environments['my-env-dev-abc123']);
    });

    it('throws on missing config', async () => {
      const { load } = await loadModule();
      assert.throws(() => load(), /Run `aptunnel init`/);
    });

    it('throws on corrupted YAML', async () => {
      const { load, getConfigPath } = await loadModule();
      fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
      fs.writeFileSync(getConfigPath(), 'not: valid: yaml: {{{', 'utf8');
      assert.throws(() => load(), /corrupted|invalid/i);
    });
  });

  // ─── getConfigPath / getConfigDir ─────────────────────────────────────────

  describe('getConfigPath()', () => {
    it('reflects APTUNNEL_CONFIG_HOME env var', async () => {
      const { getConfigPath } = await loadModule();
      assert.ok(getConfigPath().startsWith(env.cfgHome));
    });
  });

  // ─── getEnvironment ────────────────────────────────────────────────────────

  describe('getEnvironment()', () => {
    beforeEach(async () => { await writeSampleConfig(); });

    it('resolves alias "dev" → full handle', async () => {
      const { getEnvironment } = await loadModule();
      assert.equal(getEnvironment('dev'), 'my-env-dev-abc123');
    });

    it('returns the handle itself when passed directly', async () => {
      const { getEnvironment } = await loadModule();
      assert.equal(getEnvironment('my-env-dev-abc123'), 'my-env-dev-abc123');
    });

    it('returns null for unknown alias', async () => {
      const { getEnvironment } = await loadModule();
      assert.equal(getEnvironment('nonexistent'), null);
    });
  });

  // ─── getDatabase ───────────────────────────────────────────────────────────

  describe('getDatabase()', () => {
    beforeEach(async () => { await writeSampleConfig(); });

    it('resolves alias "dev-db" → correct db object', async () => {
      const { getDatabase } = await loadModule();
      const db = getDatabase('dev-db');
      assert.ok(db, 'Should find dev-db');
      assert.equal(db.handle, 'mydb-dev');
      assert.equal(db.port, 55550);
      assert.equal(db.type, 'postgresql');
      assert.equal(db.environment, 'my-env-dev-abc123');
    });

    it('resolves by handle "mydb-dev"', async () => {
      const { getDatabase } = await loadModule();
      const db = getDatabase('mydb-dev');
      assert.ok(db);
      assert.equal(db.alias, 'dev-db');
    });

    it('returns null for unknown database', async () => {
      const { getDatabase } = await loadModule();
      assert.equal(getDatabase('nonexistent'), null);
    });
  });

  // ─── getDefaultEnv ─────────────────────────────────────────────────────────

  describe('getDefaultEnv()', () => {
    beforeEach(async () => { await writeSampleConfig(); });

    it('returns the default environment handle', async () => {
      const { getDefaultEnv } = await loadModule();
      assert.equal(getDefaultEnv(), 'my-env-dev-abc123');
    });
  });

  // ─── setPort ───────────────────────────────────────────────────────────────

  describe('setPort()', () => {
    beforeEach(async () => { await writeSampleConfig(); });

    it('updates port and persists it', async () => {
      const { setPort, getDatabase } = await loadModule();
      setPort('dev-db', 9999);
      const db = getDatabase('dev-db');
      assert.equal(db.port, 9999);
    });

    it('throws for unknown alias', async () => {
      const { setPort } = await loadModule();
      assert.throws(() => setPort('ghost', 9999), /not found/i);
    });
  });

  // ─── getAllTunnelTargets ───────────────────────────────────────────────────

  describe('getAllTunnelTargets()', () => {
    beforeEach(async () => { await writeSampleConfig(); });

    it('returns all databases for the dev environment', async () => {
      const { getAllTunnelTargets } = await loadModule();
      const targets = getAllTunnelTargets('dev');
      assert.equal(targets.length, 2);
      const handles = targets.map(t => t.handle);
      assert.ok(handles.includes('mydb-dev'));
      assert.ok(handles.includes('mydb-dev-redis'));
    });

    it('returns empty array for unknown environment', async () => {
      const { getAllTunnelTargets } = await loadModule();
      assert.deepEqual(getAllTunnelTargets('ghost'), []);
    });
  });

  // ─── nextAvailablePort ────────────────────────────────────────────────────

  describe('nextAvailablePort()', () => {
    beforeEach(async () => { await writeSampleConfig(); });

    it('returns a port not already in use by config', async () => {
      const { nextAvailablePort } = await loadModule();
      const usedPorts = [55550, 55551, 55552];
      const port = nextAvailablePort();
      assert.ok(!usedPorts.includes(port), `Port ${port} should not be in use`);
      assert.ok(port >= 55550);
    });
  });

  // ─── Credentials ─────────────────────────────────────────────────────────

  describe('savePassword / readPassword', () => {
    it('stores and retrieves a password', async () => {
      const { savePassword, readPassword } = await loadModule();
      savePassword('mysecret123');
      assert.equal(readPassword(), 'mysecret123');
    });

    it('file has restricted permissions (Unix only)', async () => {
      if (isWindows) return;
      const { savePassword, getCredsPath } = await loadModule();
      savePassword('mysecret123');
      const stat = fs.statSync(getCredsPath());
      // mode & 0o777 should be 0o600 (owner rw only)
      assert.equal(stat.mode & 0o777, 0o600);
    });

    it('returns null when credentials file is missing', async () => {
      const { readPassword } = await loadModule();
      assert.equal(readPassword(), null);
    });
  });
});
