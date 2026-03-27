import { createInterface } from 'readline';
import chalk from 'chalk';
import { logger } from '../lib/logger.js';
import { isInstalled, login, getTokenInfo } from '../lib/aptible.js';
import { exists, load, savePassword } from '../lib/config-manager.js';
import { installInstructions } from '../lib/platform.js';

export async function runLogin(args) {
  if (!isInstalled()) {
    logger.error('Aptible CLI not found.');
    console.log(installInstructions('aptible'));
    process.exit(1);
  }

  // --status only
  if (args.includes('--status')) {
    printTokenStatus();
    return;
  }

  // Collect credentials
  let email    = parseFlag(args, '--email');
  let password = parseFlag(args, '--password');
  const lifetime = parseFlag(args, '--lifetime') ?? '7d';

  // Fall back to saved config
  if (!email || !password) {
    if (exists()) {
      const config = load();
      if (!email)    email    = config.credentials?.email ?? null;
      if (!password) password = (await import('../lib/config-manager.js')).readPassword();
    }
  }

  // Interactive prompts for missing values
  if (!email)    email    = await ask('Aptible email: ');
  if (!password) password = await askSecret('Aptible password: ');

  // Close readline before handing stdin to aptible (2FA prompt needs raw terminal)
  closeRL();

  const ok = await login({ email, password, lifetime });

  if (!ok) {
    logger.error('Login failed.');
    process.exit(1);
  }

  // Persist updated password if it changed
  if (password) savePassword(password);

  logger.success('Logged in successfully.');
  printTokenStatus();
}

// ─── Token status display ─────────────────────────────────────────────────────

function printTokenStatus() {
  const token = getTokenInfo();
  if (!token) {
    logger.warn('No token found. Run `aptunnel login` to authenticate.');
    return;
  }

  console.log('');
  logger.detail('User:', chalk.cyan(token.email));
  if (token.issuedAt) logger.detail('Issued:', token.issuedAt.toLocaleString());
  logger.detail('Expires:', token.expiresAt.toLocaleString());

  if (token.isExpired) {
    logger.detail('Status:', chalk.red('EXPIRED'));
  } else {
    const d = Math.floor(token.remainingHours / 24);
    const h = token.remainingHours % 24;
    const remaining = d > 0 ? `${d}d ${h}h` : `${h}h`;
    logger.detail('Status:', chalk.green(`valid (expires in ${remaining})`));
  }
  console.log('');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseFlag(args, flag) {
  const entry = args.find(a => a.startsWith(`${flag}=`));
  return entry ? entry.slice(flag.length + 1) : null;
}

// Single shared readline — avoids stdin pause issues between consecutive prompts
let _rl = null;
function getRL() {
  if (!_rl) _rl = createInterface({ input: process.stdin, output: process.stdout });
  return _rl;
}
function closeRL() {
  if (_rl) { _rl.close(); _rl = null; }
}

function ask(prompt) {
  return new Promise((resolve) => {
    getRL().question(prompt, (answer) => resolve(answer));
  });
}

function askSecret(prompt) {
  if (_rl) { _rl.close(); _rl = null; }

  return new Promise((resolve) => {
    process.stdout.write(prompt);

    const chars = [];
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const isTTY = !!process.stdin.isTTY;
    if (isTTY) process.stdin.setRawMode(true);

    function onData(data) {
      for (const char of data) {
        if (char === '\r' || char === '\n') {
          process.stdin.removeListener('data', onData);
          if (isTTY) process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          resolve(chars.join(''));
          return;
        } else if (char === '\u0003') {
          process.stdout.write('\n');
          process.exit(0);
        } else if (char === '\u007f' || char === '\b') {
          if (chars.length > 0) chars.pop();
        } else if (char >= ' ') {
          chars.push(char);
        }
      }
    }

    process.stdin.on('data', onData);
  });
}
