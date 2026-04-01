# Contributing to aptunnel

## Local dev setup

```bash
git clone https://github.com/Uruba-Software/aptunnel.git
cd aptunnel
npm install
npm link          # makes `aptunnel` available globally from this working copy
```

Run tests:

```bash
npm test          # unit tests (fast, no real Aptible connection)
npm run test:integration  # integration tests (spawn the actual CLI binary)
npm run test:all  # both
```

Tests use Node's built-in `node:test` runner — no external test framework. The mock `aptible` binary lives at `test/mocks/aptible` (and `aptible.cmd` for Windows). Set `APTUNNEL_CONFIG_HOME` and `APTUNNEL_TEMP_DIR` to isolated paths in tests to avoid touching real user config.

---

## Project layout

```
bin/
  aptunnel.js           Entry point — sets up ESM + Windows path compat, imports src/index.js
src/
  index.js              CLI router — arg parsing, signal handling, command dispatch
  commands/
    init.js             Setup wizard (Express / Custom installs)
    login.js            Aptible authentication + token management
    tunnel.js           Open/close tunnels (single DB or `all`)
    status.js           Status table, --watch mode
    dbs.js              List configured databases
    config.js           View/modify config (--set-port, --set-default, --refresh, etc.)
    completions.js      Print bash/zsh/fish completion scripts
    complete.js         Hidden `_complete` subcommand used by completion scripts
    uninstall.js        Clean uninstall
    help.js             Help output
  lib/
    config-manager.js   Load/save config.yaml, all config query helpers
    process-manager.js  Spawn tunnels, track PIDs, cleanup
    platform.js         OS-specific process/port utilities (lsof, netstat, tasklist, etc.)
    aptible.js          Wrappers around `aptible` CLI calls
    completions.js      bash/zsh/fish script generators + auto-install
    logger.js           Chalk-based logger (success, warn, error, info, plain, section)
test/
  lib/                  Unit tests for lib modules
  commands/             Unit tests for command handlers
  integration/          End-to-end CLI tests
  mocks/aptible         Fake `aptible` binary used in tests
```

---

## Key technical decisions

- **`shell: true` on Windows** — required for all `spawn`/`spawnSync('aptible', ...)` calls because `.cmd` files need a shell to execute.
- **`pathToFileURL()` in bin/aptunnel.js** — Windows drive paths like `D:\...` are invalid ESM import specifiers; `pathToFileURL` normalises them.
- **No `wmic`** — removed in modern Windows. Use `tasklist` for process info and PowerShell for uptime queries.
- **`fileURLToPath(import.meta.url)` not `import.meta.dirname`** — `import.meta.dirname` is Node 22+ only; the former works on Node 18+.
- **Explicit file list in test scripts** — `node --test` in Node 22 cannot resolve directory paths; each test file is listed explicitly in `package.json`.
- **`process.__aptunnelNoCleanup` flag** — read-only commands (`status --watch`) set this before entering their loop so the global SIGINT handler skips tunnel cleanup on Ctrl+C.
- **`aptunnel _complete [all|dbs|envs]`** — hidden subcommand used by shell completion scripts instead of shell-side YAML parsing (grep/awk against config.yaml is fragile). Outputs `DB <name>` / `ENV <name>` prefixed lines.
- **Tunnel cleanup on Windows** — `taskkill /F /T /PID` to kill the entire process tree; without `/T`, the aptible subprocess keeps running and holds the log file open, blocking temp dir cleanup.

---

## Making changes

1. Fork the repo and create a feature branch.
2. Make your changes. Add or update tests under `test/`.
3. Run `npm test` — all tests must pass.
4. Open a pull request against `main`.

CI runs on every PR: 3 OS (Linux, macOS, Windows) × 3 Node versions (18, 20, 22) = 9 combinations.

---

## Release process (maintainers)

See [CLAUDE.md](CLAUDE.md) for the full release checklist (version bump rules, CHANGELOG format, tagging, and npm publish via CI).

Short version:
1. Bump version in `package.json` + add `CHANGELOG.md` section in the same commit.
2. Push to `main`.
3. `git tag v<version> && git push origin v<version>`
4. `gh release create v<version> --title "v<version>" --notes-file <(awk ...)`

CI publishes to npm automatically when a `v*` tag is pushed and all tests pass.
