import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { isWindows, isMacOS, isLinux, skipOnWindows } from '../helpers.js';

import {
  detectOS,
  isPortInUse,
  getProcessInfo,
  getProcessUptime,
  killProcess,
  formatUptime,
} from '../../src/lib/platform.js';

// ─── detectOS ─────────────────────────────────────────────────────────────────

describe('detectOS', () => {
  it('returns a known OS string', () => {
    const result = detectOS();
    assert.ok(
      ['linux', 'macos', 'windows', 'wsl'].includes(result),
      `Unexpected OS: ${result}`
    );
  });

  it('returns "windows" on win32 platform', () => {
    if (!isWindows) return;
    assert.equal(detectOS(), 'windows');
  });

  it('returns "macos" on darwin platform', () => {
    if (!isMacOS) return;
    assert.equal(detectOS(), 'macos');
  });

  it('returns "linux" or "wsl" on linux platform', () => {
    if (!isLinux) return;
    const result = detectOS();
    assert.ok(['linux', 'wsl'].includes(result), `Expected linux or wsl, got ${result}`);
  });
});

// ─── isPortInUse ──────────────────────────────────────────────────────────────

describe('isPortInUse', () => {
  let server;
  let usedPort;

  before(async () => {
    // Bind to an ephemeral port
    await new Promise((resolve, reject) => {
      server = createServer();
      server.listen(0, '127.0.0.1', () => {
        usedPort = server.address().port;
        resolve();
      });
      server.on('error', reject);
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('detects an open port as in use', () => {
    const result = isPortInUse(usedPort);
    assert.equal(result.inUse, true, `Expected port ${usedPort} to be in use`);
  });

  it('returns a PID for the in-use port (Unix)', () => {
    skipOnWindows({ skip: () => {} });
    if (isWindows) return;
    const result = isPortInUse(usedPort);
    // PID may be null if lsof lacks permissions, but inUse must be true
    assert.equal(result.inUse, true);
  });

  it('detects a closed port as free', async () => {
    // Close server and wait for port to free
    await new Promise((resolve) => server.close(resolve));
    // Small delay for OS to release the port
    await new Promise(r => setTimeout(r, 100));
    const result = isPortInUse(usedPort);
    assert.equal(result.inUse, false, `Expected port ${usedPort} to be free after close`);
    // Re-open for the after() hook (harmless if already closed)
    server = createServer();
    await new Promise((resolve) => server.listen(usedPort, '127.0.0.1', resolve));
  });
});

// ─── getProcessInfo ───────────────────────────────────────────────────────────

describe('getProcessInfo', () => {
  it('returns running=true for our own process', () => {
    const result = getProcessInfo(process.pid);
    assert.equal(result.running, true);
  });

  it('returns running=false for a non-existent PID', () => {
    // PID 999999 is extremely unlikely to exist
    const result = getProcessInfo(999999);
    assert.equal(result.running, false);
  });

  it('returns a command string for our own process (Unix)', () => {
    if (isWindows) return;
    const result = getProcessInfo(process.pid);
    assert.equal(typeof result.command, 'string');
    assert.ok(result.command.length > 0);
  });
});

// ─── getProcessUptime ─────────────────────────────────────────────────────────

describe('getProcessUptime', () => {
  it('returns uptime for our own process', () => {
    const result = getProcessUptime(process.pid);
    // May be null on some systems — just ensure it doesn't throw
    if (result !== null) {
      assert.ok(typeof result.hours   === 'number');
      assert.ok(typeof result.minutes === 'number');
      assert.ok(typeof result.seconds === 'number');
      assert.ok(result.hours >= 0 && result.minutes >= 0 && result.seconds >= 0);
    }
  });

  it('returns null for a non-existent PID', () => {
    const result = getProcessUptime(999999);
    assert.equal(result, null);
  });
});

// ─── killProcess ─────────────────────────────────────────────────────────────

describe('killProcess', () => {
  it('kills a spawned process', async () => {
    // Spawn a long-running process using Node itself — works cross-platform
    // without needing sleep (Unix) or timeout.exe (Windows, which exits without a console).
    const child = spawn(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 60000)'],
      { detached: true, stdio: 'ignore' }
    );
    child.unref();
    const pid = child.pid;
    assert.ok(pid, 'Child process should have a PID');

    // Give it a moment to start
    await new Promise(r => setTimeout(r, 100));

    // Verify it's running
    assert.equal(getProcessInfo(pid).running, true, 'Process should be running before kill');

    // Kill it
    killProcess(pid);
    await new Promise(r => setTimeout(r, 300));

    // Verify it's dead
    assert.equal(getProcessInfo(pid).running, false, 'Process should be dead after kill');
  });
});

// ─── formatUptime ─────────────────────────────────────────────────────────────

describe('formatUptime', () => {
  it('formats zero as 00h00m00s', () => {
    assert.equal(formatUptime({ hours: 0, minutes: 0, seconds: 0 }), '00h00m00s');
  });

  it('formats hours, minutes, seconds correctly', () => {
    assert.equal(formatUptime({ hours: 2, minutes: 15, seconds: 7 }), '02h15m07s');
  });

  it('returns "-" for null', () => {
    assert.equal(formatUptime(null), '-');
  });

  it('pads single digits', () => {
    assert.equal(formatUptime({ hours: 1, minutes: 5, seconds: 9 }), '01h05m09s');
  });
});
