import { spawnSync, spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

/**
 * Detect the current operating system.
 * @returns {'linux' | 'macos' | 'windows' | 'wsl'}
 */
export function detectOS() {
  if (process.platform === 'win32') return 'windows';

  if (process.platform === 'linux') {
    // WSL detection: /proc/version contains "microsoft" or "WSL"
    try {
      const version = readFileSync('/proc/version', 'utf8').toLowerCase();
      if (version.includes('microsoft') || version.includes('wsl')) {
        return 'wsl';
      }
    } catch {
      // /proc/version not readable — treat as regular Linux
    }
    return 'linux';
  }

  if (process.platform === 'darwin') return 'macos';

  return 'linux'; // fallback
}

/**
 * Check if a port is currently in use.
 * @param {number} port
 * @returns {{ inUse: boolean, pid: number | null }}
 */
export function isPortInUse(port) {
  const os = detectOS();

  if (os === 'windows') {
    const result = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
    if (result.status !== 0 || !result.stdout) return { inUse: false, pid: null };

    const lines = result.stdout.split('\n');
    for (const line of lines) {
      if (line.includes(`:${port}`) && (line.includes('LISTENING') || line.includes('ESTABLISHED'))) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1], 10);
        return { inUse: true, pid: isNaN(pid) ? null : pid };
      }
    }
    return { inUse: false, pid: null };
  }

  // Linux / macOS / WSL
  const result = spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout.trim()) {
    return { inUse: false, pid: null };
  }

  const pid = parseInt(result.stdout.trim().split('\n')[0], 10);
  return { inUse: true, pid: isNaN(pid) ? null : pid };
}

/**
 * Get info about a running process by PID.
 * @param {number} pid
 * @returns {{ running: boolean, command: string | null }}
 */
export function getProcessInfo(pid) {
  const os = detectOS();

  if (os === 'windows') {
    // tasklist is available on all Windows versions; wmic is deprecated/removed in modern Windows.
    const result = spawnSync(
      'tasklist',
      ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV'],
      { encoding: 'utf8' }
    );
    if (result.status !== 0 || !result.stdout.trim()) return { running: false, command: null };
    // tasklist outputs "INFO: No tasks..." when PID not found; CSV lines otherwise.
    const lines = result.stdout.trim().split('\n')
      .filter(l => l.trim() && !l.toLowerCase().startsWith('info'));
    if (lines.length === 0) return { running: false, command: null };
    return { running: true, command: lines[0].trim() };
  }

  // Linux / macOS / WSL
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout.trim()) {
    return { running: false, command: null };
  }
  return { running: true, command: result.stdout.trim() };
}

/**
 * Kill a process by PID.
 * @param {number} pid
 */
export function killProcess(pid) {
  const os = detectOS();

  if (os === 'windows') {
    // /T kills the entire process tree (cmd.exe + child aptible process).
    // Without /T, the aptible subprocess stays alive and holds the log file open.
    spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { encoding: 'utf8' });
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Process may already be gone — ignore
  }
}

/**
 * Get how long a process has been running.
 * @param {number} pid
 * @returns {{ hours: number, minutes: number, seconds: number } | null}
 */
export function getProcessUptime(pid) {
  const os = detectOS();

  if (os === 'windows') {
    // Use PowerShell to get process start time (wmic is deprecated/removed in modern Windows).
    const result = spawnSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command',
       `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { $p.StartTime.ToUniversalTime().ToString('o') }`],
      { encoding: 'utf8' }
    );
    if (result.status !== 0 || !result.stdout.trim()) return null;
    const startDate = new Date(result.stdout.trim());
    if (isNaN(startDate.getTime())) return null;
    return computeUptime(startDate);
  }

  // Linux / macOS — both use `ps -o lstart=`
  // NOTE: Never use `date -d` (GNU only). We use `new Date()` to parse.
  const result = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout.trim()) return null;

  const startDate = new Date(result.stdout.trim());
  if (isNaN(startDate.getTime())) return null;

  return computeUptime(startDate);
}

function computeUptime(startDate) {
  const diffMs = Date.now() - startDate.getTime();
  if (diffMs < 0) return null;

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { hours, minutes, seconds };
}

/**
 * Format uptime as "HHhMMmSSs" string.
 * @param {{ hours: number, minutes: number, seconds: number } | null} uptime
 * @returns {string}
 */
export function formatUptime(uptime) {
  if (!uptime) return '-';
  const h = String(uptime.hours).padStart(2, '0');
  const m = String(uptime.minutes).padStart(2, '0');
  const s = String(uptime.seconds).padStart(2, '0');
  return `${h}h${m}m${s}s`;
}

/**
 * Open a URL in the system browser.
 * @param {string} url
 */
export function openUrl(url) {
  const os = detectOS();

  if (os === 'macos') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  if (os === 'windows') {
    spawn('cmd', ['/c', 'start', url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  if (os === 'wsl') {
    // Try wslview first, fall back to cmd.exe
    const which = spawnSync('which', ['wslview'], { encoding: 'utf8' });
    if (which.status === 0) {
      spawn('wslview', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('cmd.exe', ['/c', 'start', url], { detached: true, stdio: 'ignore' }).unref();
    }
    return;
  }

  // Linux
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

/**
 * Install instructions per OS for a missing tool.
 * @param {'aptible'} tool
 * @returns {string}
 */
export function installInstructions(tool) {
  const os = detectOS();

  if (tool === 'aptible') {
    if (os === 'macos') {
      return 'Install Aptible CLI:\n  brew install aptible/aptible/aptible\n  or: https://www.aptible.com/docs/cli';
    }
    if (os === 'windows' || os === 'wsl') {
      return 'Install Aptible CLI:\n  Download from: https://www.aptible.com/docs/cli\n  or use WSL with the Linux install method';
    }
    // Linux
    return 'Install Aptible CLI:\n  curl -s https://toolbelt.aptible.com/install.sh | bash\n  or: https://www.aptible.com/docs/cli';
  }

  return `Please install ${tool} and try again.`;
}
