import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { isWindows, createTestEnv } from '../helpers.js';

import {
  savePid, readPid, removePid, isRunning,
  saveConnectionInfo, readConnectionInfo, removeConnectionInfo,
  getAllRunningTunnels, cleanup, toIdentifier,
  pidFilePath, connFilePath,
} from '../../src/lib/process-manager.js';

describe('process-manager', () => {
  let env;

  beforeEach(() => { env = createTestEnv(); });
  afterEach(() => { env.cleanup(); });

  // ─── PID files ──────────────────────────────────────────────────────────

  describe('savePid / readPid / removePid', () => {
    it('saves and reads back a PID', () => {
      savePid('test-db', 12345);
      assert.equal(readPid('test-db'), 12345);
    });

    it('returns null when PID file does not exist', () => {
      assert.equal(readPid('ghost'), null);
    });

    it('removes the PID file', () => {
      savePid('test-db', 12345);
      removePid('test-db');
      assert.equal(readPid('test-db'), null);
    });

    it('ignores removePid on non-existent file', () => {
      assert.doesNotThrow(() => removePid('ghost'));
    });
  });

  // ─── isRunning ──────────────────────────────────────────────────────────

  describe('isRunning()', () => {
    it('returns false when no PID file exists', () => {
      assert.equal(isRunning('ghost'), false);
    });

    it('returns true for our own process PID', () => {
      savePid('self', process.pid);
      assert.equal(isRunning('self'), true);
    });

    it('returns false for a dead process PID', async () => {
      const child = spawn(
        isWindows ? 'timeout' : 'sleep',
        isWindows ? ['3600', '/nobreak'] : ['3600'],
        { detached: true, stdio: 'ignore' }
      );
      child.unref();
      const pid = child.pid;
      savePid('dying', pid);

      // Kill it
      try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
      await new Promise(r => setTimeout(r, 300));

      assert.equal(isRunning('dying'), false);
    });
  });

  // ─── Connection info ─────────────────────────────────────────────────────

  describe('saveConnectionInfo / readConnectionInfo / removeConnectionInfo', () => {
    const conn = {
      url:      'postgresql://aptible:pass@localhost.aptible.in:55550/db',
      host:     'localhost.aptible.in',
      port:     55550,
      user:     'aptible',
      password: 'pass',
      dbName:   'db',
    };

    it('saves and reads connection info', () => {
      saveConnectionInfo('test-db', conn);
      const loaded = readConnectionInfo('test-db');
      assert.deepEqual(loaded, conn);
    });

    it('returns null when file does not exist', () => {
      assert.equal(readConnectionInfo('ghost'), null);
    });

    it('removes connection info file', () => {
      saveConnectionInfo('test-db', conn);
      removeConnectionInfo('test-db');
      assert.equal(readConnectionInfo('test-db'), null);
    });
  });

  // ─── getAllRunningTunnels ─────────────────────────────────────────────────

  describe('getAllRunningTunnels()', () => {
    it('returns empty array when no PID files exist', () => {
      assert.deepEqual(getAllRunningTunnels(), []);
    });

    it('finds live PID files', () => {
      savePid('live-one', process.pid);
      savePid('live-two', process.pid);
      const tunnels = getAllRunningTunnels();
      const identifiers = tunnels.map(t => t.identifier);
      assert.ok(identifiers.includes('live-one'));
      assert.ok(identifiers.includes('live-two'));
    });

    it('marks dead PIDs as not running', async () => {
      const child = spawn(
        isWindows ? 'timeout' : 'sleep',
        isWindows ? ['3600', '/nobreak'] : ['3600'],
        { detached: true, stdio: 'ignore' }
      );
      child.unref();
      const pid = child.pid;
      savePid('dead-tunnel', pid);

      try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
      await new Promise(r => setTimeout(r, 300));

      const tunnels = getAllRunningTunnels();
      const t = tunnels.find(x => x.identifier === 'dead-tunnel');
      assert.ok(t, 'Should find the dead tunnel entry');
      assert.equal(t.running, false);
    });
  });

  // ─── cleanup ─────────────────────────────────────────────────────────────

  describe('cleanup()', () => {
    it('removes both PID and connection files', () => {
      savePid('toclean', 12345);
      saveConnectionInfo('toclean', { url: 'x' });
      cleanup('toclean');
      assert.equal(readPid('toclean'), null);
      assert.equal(readConnectionInfo('toclean'), null);
    });
  });

  // ─── toIdentifier ────────────────────────────────────────────────────────

  describe('toIdentifier()', () => {
    it('replaces unsafe chars with dashes', () => {
      assert.equal(toIdentifier('my db/name'), 'my-db-name');
    });

    it('leaves safe chars unchanged', () => {
      assert.equal(toIdentifier('dev-pg_01'), 'dev-pg_01');
    });
  });
});
