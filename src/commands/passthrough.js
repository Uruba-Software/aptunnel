import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { getDatabase, getAllDatabases, getEnvironment } from '../lib/config-manager.js';
import { logger } from '../lib/logger.js';

// db handle is first positional arg: aptible <cmd> <handle> --environment=<env>
const HANDLE_POSITIONAL = new Set([
  'db:backup', 'db:dump', 'db:modify', 'db:restart', 'db:url',
  'db:reload', 'db:deprovision', 'db:rename', 'db:replicate', 'db:versions',
  'db:execute', 'db:clone', 'backup:list',
]);

// db handle goes as --database=<handle> flag (not positional)
const HANDLE_FLAG = new Set(['logs']);

// only --environment injected, no handle (db:list lists all dbs in an env)
const ENV_ONLY = new Set(['db:list']);

// read-only: no confirmation prompt when used with 'all'
const READ_ONLY = new Set(['db:list', 'db:url', 'db:versions', 'backup:list', 'logs']);

// exported so completions and help can reference the same list
export const PASSTHROUGH_SUBCMDS = [
  'db:backup', 'db:clone', 'db:dump', 'db:execute', 'db:list',
  'db:modify', 'db:restart', 'db:url', 'db:versions',
  'backup:list', 'logs',
];

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function runPassthrough({ target, args, doForce = false }) {
  const subcmdIdx = args.findIndex(isAptibleSubcmd);
  const subcmd    = subcmdIdx >= 0 ? args[subcmdIdx] : null;

  // Strip aptunnel-specific flags before forwarding to aptible
  const forwarded = args.filter((a, i) => i !== subcmdIdx && a !== '--force');

  // Extract --env= for 'all' filtering; don't forward it (aptible gets the real env handle)
  const envArg     = extractFlag(forwarded, '--env');
  const cleanArgs  = forwarded.filter(a => !a.startsWith('--env='));

  if (target === 'all') {
    let dbs = getAllDatabases();
    if (envArg) {
      const envHandle = getEnvironment(envArg) ?? envArg;
      dbs = dbs.filter(db => db.environment === envHandle);
      if (dbs.length === 0) {
        logger.warn(`No databases configured for environment: ${envArg}`);
        return;
      }
    }
    await handleAll(subcmd, cleanArgs, doForce, dbs);
  } else {
    await handleOne(target, subcmd, cleanArgs, envArg);
  }
}

// ─── Single alias ─────────────────────────────────────────────────────────────

async function handleOne(alias, subcmd, extraArgs, envOverride) {
  const db = getDatabase(alias);
  if (!db) {
    // Not a known alias — verbatim passthrough to aptible
    const verbatim = subcmd ? [alias, subcmd, ...extraArgs] : [alias, ...extraArgs];
    process.exitCode = await spawnAptible(verbatim);
    return;
  }

  const environment = envOverride
    ? (getEnvironment(envOverride) ?? envOverride)
    : db.environment;

  process.exitCode = await spawnAptible(buildArgs(db.handle, environment, subcmd, extraArgs));
}

// ─── All databases ─────────────────────────────────────────────────────────────

async function handleAll(subcmd, extraArgs, doForce, dbs) {
  const needsConfirm = subcmd && !READ_ONLY.has(subcmd);

  if (needsConfirm && !doForce) {
    const ok = await confirm(
      `About to run "${subcmd}" on ${dbs.length} database(s). Continue? (y/N) `
    );
    if (!ok) {
      logger.info('Aborted.');
      return;
    }
  }

  let anyFailed = false;
  for (const db of dbs) {
    logger.info(`${db.alias} (${db.handle})…`);
    const code = await spawnAptible(buildArgs(db.handle, db.environment, subcmd, extraArgs));
    if (code !== 0) {
      logger.warn(`  exited with code ${code}`);
      anyFailed = true;
    }
  }
  if (anyFailed) process.exitCode = 1;
}

// ─── Arg builder ──────────────────────────────────────────────────────────────

function buildArgs(handle, environment, subcmd, extraArgs) {
  const env = `--environment=${environment}`;
  if (HANDLE_POSITIONAL.has(subcmd)) return [subcmd, handle, env, ...extraArgs];
  if (HANDLE_FLAG.has(subcmd))       return [subcmd, `--database=${handle}`, env, ...extraArgs];
  if (ENV_ONLY.has(subcmd))          return [subcmd, env, ...extraArgs];
  // Unknown subcommand — best-effort positional injection
  return subcmd ? [subcmd, handle, env, ...extraArgs] : [handle, env, ...extraArgs];
}

// ─── Verbatim passthrough (user typed full aptible syntax) ────────────────────

export async function spawnVerbatim(args) {
  process.exitCode = await spawnAptible(args);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function spawnAptible(args) {
  return new Promise(resolve => {
    const child = spawn('aptible', args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('close', code => resolve(code ?? 0));
  });
}

export function isAptibleSubcmd(arg) {
  return !arg.startsWith('--') && (arg.includes(':') || arg === 'logs');
}

function extractFlag(args, flag) {
  const entry = args.find(a => a.startsWith(`${flag}=`));
  return entry ? entry.slice(flag.length + 1) : null;
}

function confirm(prompt) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, answer => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}
