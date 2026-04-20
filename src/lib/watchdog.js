// Invoked as: node watchdog.js <pid> <delayMs> <tempDir> <identifier>
// Runs detached in the background. Kills the tunnel process after delayMs,
// then removes the state files so `aptunnel status` shows a clean slate.
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const [,, pidStr, msStr, tempDir, identifier] = process.argv;
const pid = Number(pidStr);
const ms  = Number(msStr);

setTimeout(() => {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { encoding: 'utf8' });
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ }
    try { process.kill(pid,  'SIGKILL'); } catch { /* already gone */ }
  }

  if (tempDir && identifier) {
    for (const suffix of ['.pid', '.conn.json', '.watch.pid']) {
      const f = join(tempDir, `aptunnel-${identifier}${suffix}`);
      try { if (existsSync(f)) unlinkSync(f); } catch { /* ignore */ }
    }
  }
}, ms);
