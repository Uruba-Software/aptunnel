import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import {
  createTestEnv, writeSampleConfig, injectMockAptible, restorePath,
} from '../helpers.js';
import { isPortInUse } from '../../src/lib/platform.js';

// Inject mock aptible for the whole file so isInstalled() passes on CI.
injectMockAptible();

// ─── Helper ───────────────────────────────────────────────────────────────────

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

function bindPort(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

// ─── --force open: auto-select port ──────────────────────────────────────────

describe('tunnel --force open (port conflict)', () => {
  let env;
  let server;
  const PORT = 55561; // use a port outside SAMPLE_CONFIG range to avoid collision

  before(async () => {
    env = createTestEnv();
    await writeSampleConfig();
    // Point dev-db to PORT so we can force a conflict
    const { setPort } = await import('../../src/lib/config-manager.js');
    setPort('dev-db', PORT);
    server = await bindPort(PORT);
  });

  after(async () => {
    if (server) await new Promise(r => server.close(r));
    env?.cleanup();
  });

  it('logs a port-switching message and does not throw', async () => {
    const { runTunnel } = await import('../../src/commands/tunnel.js');
    let output = '';
    await assert.doesNotReject(async () => {
      output = await captureAsync(() => runTunnel(['dev-db', '--force']));
    });
    // Should mention it is switching ports OR successfully opened on a free port
    assert.ok(
      output.includes('switching') || output.includes('in use') ||
      output.includes('tunnel opened') || output.includes('free port'),
      `Expected port-conflict or success message. Got:\n${output.slice(0, 500)}`
    );
  });
});

// ─── --force close: no PID file, nothing on port ─────────────────────────────

describe('tunnel --force close (no PID file, port free)', () => {
  let env;

  beforeEach(async () => {
    env = createTestEnv();
    await writeSampleConfig();
  });

  afterEach(() => env?.cleanup());

  it('reports nothing to close without throwing', async () => {
    const { runTunnel } = await import('../../src/commands/tunnel.js');
    let output = '';
    await assert.doesNotReject(async () => {
      output = await captureAsync(() => runTunnel(['dev-db', '--close', '--force']));
    });
    assert.ok(
      output.toLowerCase().includes('nothing') || output.toLowerCase().includes('closed'),
      `Unexpected output:\n${output}`
    );
  });
});

// ─── --force close: port held by a child process ─────────────────────────────

describe('tunnel --force close (port held by a foreign process)', () => {
  let env;
  let child;
  const PORT = 55562;

  before(async () => {
    env = createTestEnv();
    await writeSampleConfig();
    const { setPort } = await import('../../src/lib/config-manager.js');
    setPort('dev-db', PORT);

    // Spawn a child that binds PORT and keeps running
    child = spawn(
      process.execPath,
      ['-e', `require('net').createServer().listen(${PORT}, '127.0.0.1', () => {}); setTimeout(() => {}, 60000);`],
      { detached: true, stdio: 'ignore' }
    );
    child.unref();
    // Wait for it to bind
    await new Promise(r => setTimeout(r, 500));
  });

  after(async () => {
    // Kill the child if still alive
    try {
      if (process.platform === 'win32') {
        const { spawnSync } = await import('node:child_process');
        spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { encoding: 'utf8' });
      } else {
        process.kill(-child.pid, 'SIGKILL');
      }
    } catch { /* already gone */ }
    env?.cleanup();
  });

  it('releases the port when no PID file exists', async () => {
    assert.equal(isPortInUse(PORT).inUse, true, 'Port should be in use before --force close');

    const { runTunnel } = await import('../../src/commands/tunnel.js');
    await captureAsync(() => runTunnel(['dev-db', '--close', '--force']));

    // Allow OS to release the port
    await new Promise(r => setTimeout(r, 500));
    assert.equal(isPortInUse(PORT).inUse, false, 'Port should be free after --force close');
  });
});

// ─── --close without --force: warns when no PID file ─────────────────────────

describe('tunnel --close (no PID file, no --force)', () => {
  let env;

  beforeEach(async () => {
    env = createTestEnv();
    await writeSampleConfig();
  });

  afterEach(() => env?.cleanup());

  it('warns "No tunnel found" instead of crashing', async () => {
    const { runTunnel } = await import('../../src/commands/tunnel.js');
    let output = '';
    await assert.doesNotReject(async () => {
      output = await captureAsync(() => runTunnel(['dev-db', '--close']));
    });
    assert.ok(
      output.toLowerCase().includes('no tunnel') || output.toLowerCase().includes('not found'),
      `Expected "No tunnel" warning. Got:\n${output}`
    );
  });
});
