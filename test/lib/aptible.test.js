import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { injectMockAptible, restorePath, createTestEnv, isWindows } from '../helpers.js';

// All tests in this file use the mock aptible CLI — no real aptible needed.

import {
  isInstalled,
  getVersion,
  listEnvironments,
  listDatabases,
  listApps,
} from '../../src/lib/aptible.js';

describe('aptible (mocked)', () => {
  before(() => injectMockAptible());
  after(() => restorePath());

  // ─── isInstalled / getVersion ────────────────────────────────────────────

  describe('isInstalled()', () => {
    it('returns true when mock aptible is in PATH', () => {
      assert.equal(isInstalled(), true);
    });
  });

  describe('getVersion()', () => {
    it('returns a non-empty version string', () => {
      const ver = getVersion();
      assert.ok(typeof ver === 'string' && ver.length > 0);
      assert.ok(ver.toLowerCase().includes('aptible'), `Expected version to mention aptible, got: ${ver}`);
    });
  });

  // ─── listEnvironments ────────────────────────────────────────────────────

  describe('listEnvironments()', () => {
    it('returns an array of environments', () => {
      const envs = listEnvironments();
      assert.ok(Array.isArray(envs));
      assert.ok(envs.length > 0);
    });

    it('each environment has id and handle', () => {
      const envs = listEnvironments();
      for (const env of envs) {
        assert.ok('id'     in env, 'Missing id');
        assert.ok('handle' in env, 'Missing handle');
        assert.ok(typeof env.handle === 'string' && env.handle.length > 0);
      }
    });

    it('returns the mock environments', () => {
      const envs = listEnvironments();
      const handles = envs.map(e => e.handle);
      assert.ok(handles.includes('my-env-dev-abc123'));
      assert.ok(handles.includes('my-env-staging-def456'));
    });
  });

  // ─── listDatabases ────────────────────────────────────────────────────────

  describe('listDatabases()', () => {
    it('returns an array of databases', () => {
      const dbs = listDatabases('my-env-dev-abc123');
      assert.ok(Array.isArray(dbs));
      assert.ok(dbs.length > 0);
    });

    it('each database has id, handle, type, status', () => {
      const dbs = listDatabases('my-env-dev-abc123');
      for (const db of dbs) {
        assert.ok('id'     in db, 'Missing id');
        assert.ok('handle' in db, 'Missing handle');
        assert.ok('type'   in db, 'Missing type');
        assert.ok('status' in db, 'Missing status');
      }
    });

    it('returns both mock databases', () => {
      const dbs = listDatabases('my-env-dev-abc123');
      const handles = dbs.map(d => d.handle);
      assert.ok(handles.includes('mydb-dev'));
      assert.ok(handles.includes('mydb-dev-redis'));
    });
  });

  // ─── listApps ─────────────────────────────────────────────────────────────

  describe('listApps()', () => {
    it('returns an array of apps', () => {
      const apps = listApps('my-env-dev-abc123');
      assert.ok(Array.isArray(apps));
    });

    it('each app has id, handle, status', () => {
      const apps = listApps('my-env-dev-abc123');
      for (const app of apps) {
        assert.ok('id'     in app, 'Missing id');
        assert.ok('handle' in app, 'Missing handle');
        assert.ok('status' in app, 'Missing status');
      }
    });
  });

  // ─── openTunnel (smoke test) ──────────────────────────────────────────────

  describe('openTunnel()', () => {
    let env;
    let tunnelResult;

    before(async () => {
      env = createTestEnv();
      // Use a short delay so the test finishes quickly
      process.env.MOCK_TUNNEL_DELAY = '10';

      const { openTunnel } = await import('../../src/lib/aptible.js');
      tunnelResult = await openTunnel({
        dbHandle:    'mydb-dev',
        environment: 'my-env-dev-abc123',
        port:        55554,
      });
    });

    after(async () => {
      delete process.env.MOCK_TUNNEL_DELAY;
      // Kill the mock tunnel process (and its children on Windows, which hold the log file open)
      if (tunnelResult?.pid) {
        try {
          if (isWindows) {
            // taskkill /T kills the entire process tree so timeout.exe also exits,
            // releasing the log file lock before we try to delete the temp dir.
            spawnSync('taskkill', ['/F', '/T', '/PID', String(tunnelResult.pid)], { encoding: 'utf8' });
            await new Promise(r => setTimeout(r, 500));
          } else {
            process.kill(tunnelResult.pid, 'SIGKILL');
          }
        } catch { /* already gone */ }
      }
      env?.cleanup();
    });

    it('resolves with a pid', () => {
      assert.ok(tunnelResult.pid > 0, 'Expected a valid PID');
    });

    it('resolves with the correct port', () => {
      assert.equal(tunnelResult.port, 55554);
    });

    it('parses the connection URL from mock output', () => {
      assert.ok(
        tunnelResult.connectionUrl.includes('postgresql://aptible:mockpassword123'),
        `Unexpected URL: ${tunnelResult.connectionUrl}`
      );
    });

    it('parses credentials from mock output', () => {
      assert.equal(tunnelResult.credentials.user,     'aptible');
      assert.equal(tunnelResult.credentials.password, 'mockpassword123');
      assert.equal(tunnelResult.credentials.host,     'localhost.aptible.in');
    });
  });
});
