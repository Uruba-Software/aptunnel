import { spawnSync, spawn } from 'child_process';
import { rmSync, existsSync, unlinkSync } from 'fs';
import { logger } from '../lib/logger.js';
import { getConfigDir, getConfigPath, getCredsPath } from '../lib/config-manager.js';
import { getAllRunningTunnels, cleanup } from '../lib/process-manager.js';
import { killProcess } from '../lib/platform.js';

export async function runUninstall(args) {
  const doForce = args.includes('--force');

  // 1. Stop any running tunnels so PID/log files can be cleaned up cleanly.
  const running = getAllRunningTunnels().filter(t => t.running);
  if (running.length > 0) {
    logger.info(`Stopping ${running.length} running tunnel(s)…`);
    for (const t of running) {
      killProcess(t.pid);
      cleanup(t.identifier);
    }
    logger.success('Tunnels stopped.');
    console.log('');
  }

  // 2. Remove config / credential files.
  const configDir  = getConfigDir();
  const configPath = getConfigPath();
  const credsPath  = getCredsPath();

  if (doForce) {
    // --force: wipe the entire ~/.aptunnel directory (config + credentials + any extras).
    if (existsSync(configDir)) {
      rmSync(configDir, { recursive: true, force: true });
      logger.success(`Config directory removed: ${configDir}`);
    } else {
      logger.dim(`No config directory at ${configDir} — skipping.`);
    }
  } else {
    let removed = 0;
    if (existsSync(configPath)) { unlinkSync(configPath); removed++; }
    if (existsSync(credsPath))  { unlinkSync(credsPath);  removed++; }
    if (removed > 0) {
      logger.success(`Config files removed (${configDir}).`);
    } else {
      logger.dim('No config files found.');
    }
  }

  console.log('');

  // 3. Uninstall the npm package.
  // APTUNNEL_SKIP_NPM_UNINSTALL=1 skips this step in tests.
  if (process.env.APTUNNEL_SKIP_NPM_UNINSTALL) return;
  logger.info('Running npm uninstall -g aptunnel…');
  console.log('');

  if (process.platform === 'win32') {
    // On Windows, exit the Node.js process before npm tries to delete the
    // package files — otherwise open file handles can block the deletion.
    const child = spawn('npm', ['uninstall', '-g', 'aptunnel'], {
      stdio: 'inherit',
      shell: true,
    });
    child.on('close',  (code) => process.exit(code ?? 0));
    child.on('error',  (err)  => {
      logger.error(`npm uninstall failed: ${err.message}`);
      logger.info('Run manually: npm uninstall -g aptunnel');
      process.exit(1);
    });
    return; // keep process alive until the child reports back
  }

  // Linux / macOS: blocking call is fine — no file-lock concerns.
  const result = spawnSync('npm', ['uninstall', '-g', 'aptunnel'], {
    stdio: 'inherit',
    shell: true,
  });

  console.log('');
  if (result.status === 0) {
    logger.success('aptunnel has been uninstalled. Goodbye!');
  } else {
    logger.error('npm uninstall exited with an error.');
    logger.info('Run manually: npm uninstall -g aptunnel');
  }
}
