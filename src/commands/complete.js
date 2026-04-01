/**
 * Hidden subcommand used exclusively by shell completion scripts.
 * Outputs completion data parsed by config-manager (no YAML parsing in bash/zsh/fish).
 *
 * Usage:
 *   aptunnel _complete all   → DB <alias/handle> and ENV <alias/handle> lines
 *   aptunnel _complete dbs   → db aliases + handles, one per line
 *   aptunnel _complete envs  → env aliases + handles, one per line
 */
import { getAllDatabases, load, exists } from '../lib/config-manager.js';

export function runComplete(args) {
  const type = args[0] ?? 'all';

  if (!exists()) return;

  try {
    const config = load();
    const includeDbs  = type === 'all' || type === 'dbs';
    const includeEnvs = type === 'all' || type === 'envs';
    const withPrefix  = type === 'all'; // prefix lines with "DB " / "ENV " for easy awk split

    if (includeDbs) {
      const seen = new Set();
      for (const db of getAllDatabases()) {
        if (!seen.has(db.alias)) {
          console.log(withPrefix ? `DB ${db.alias}` : db.alias);
          seen.add(db.alias);
        }
        if (db.alias !== db.handle && !seen.has(db.handle)) {
          console.log(withPrefix ? `DB ${db.handle}` : db.handle);
          seen.add(db.handle);
        }
      }
    }

    if (includeEnvs) {
      const seen = new Set();
      for (const [handle, env] of Object.entries(config.environments ?? {})) {
        const alias = env.alias ?? handle;
        if (!seen.has(alias)) {
          console.log(withPrefix ? `ENV ${alias}` : alias);
          seen.add(alias);
        }
        if (alias !== handle && !seen.has(handle)) {
          console.log(withPrefix ? `ENV ${handle}` : handle);
          seen.add(handle);
        }
      }
    }
  } catch { /* silently ignore — completion must never error */ }
}
