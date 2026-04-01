# Changelog

All notable changes to aptunnel are documented here.

---

## [1.4.3] — 2026-04-01

### Fixed
- **Shell completions rewritten** — `aptunnel <TAB>` now correctly shows db aliases, db handles,
  and built-in commands. Previously the awk patterns were wrong, mixing env aliases into the
  db list and finding nothing for environments. Fixed by using `grep` with exact indentation
  (8-space for db aliases, 6-space for db handles, 4-space for env aliases, awk state-machine
  for env handles).
- **Context-aware flag completions** — `aptunnel status --<TAB>` shows only `--watch`;
  `aptunnel all --<TAB>` shows `--close --force --env=`; tunnel commands show
  `--close --force --port= --env=`; etc.
- **`--env=<value>` completions** — typing `--env=<TAB>` now completes from env aliases and
  handles (bash, zsh, fish all supported).
- **Missing commands added** — `dbs` and `uninstall` were missing from completion lists.
- **`aptunnel init` auto-installs completions** — after writing the config, init now calls
  `installCompletions()` automatically so users don't have to run it manually.

---

## [1.4.2] — 2026-04-01

### Fixed
- **`status --watch` Ctrl+C no longer kills tunnels** — pressing Ctrl+C while watching now
  just exits the watch, leaving all background tunnels running. Previously the global SIGINT
  handler was closing every tunnel on exit regardless of which command was running.
- **`aptunnel all` summary now shows failure reason** — instead of just `FAILED`, the summary
  table now shows why each tunnel failed, e.g. `FAILED  (port 55550 in use (PID 1234) — use --force)`.

---

## [1.4.1] — 2026-04-01

### Changed
- **Status table redesigned (again)** — single unified table with environment separator rows
  (`── dev (my-env-dev) ───────`) spanning the full table width. All databases across all
  environments share the same column widths and a single header row.
- **TYPE column added** — shows the database type in abbreviated form: `pg`, `mysql`, `redis`,
  `mssql`, `mongo`, etc.

---

## [1.4.0] — 2026-03-31

### Added
- **`aptunnel status --watch`** — live-refresh the status table every 2 seconds.
- **Production guard on `aptunnel all`** — when no `--env` flag is given, aptunnel opens
  tunnels across all configured environments and warns before touching any environment whose
  handle or alias contains `prod`, `production`, or `live`. Requires confirmation before
  proceeding.

### Changed
- **Status screen redesigned** — databases are now grouped by environment with a header per
  group. The ALIAS column is removed; when a database alias differs from its handle the alias
  is shown in parentheses next to the handle (e.g. `mydb-dev (dev-db)`). The column header
  "CONNECTION URL" is shortened to "URL".
- **`aptunnel all` no longer requires a default environment** — it targets all environments
  when `--env` is omitted, instead of requiring one to be set as default.
- **`aptunnel init` no longer asks for a default environment** — the default-environment
  prompt has been removed from both Express and Custom installs.
- **Routing fix** — `aptunnel --env=<name>` without a subcommand now shows a clear error
  ("Unknown flag") instead of "Unknown database".

---

## [1.3.0] — 2026-04-01

### Added
- **Express / Custom install** — `aptunnel init` now asks for installation type at the start.
  - **Express**: enter email + password (with 2FA), everything else (environments, databases,
    aliases, ports) is auto-configured with defaults. No prompts.
  - **Custom**: full interactive setup — select environments, customize aliases and ports,
    set default environment (previous behaviour).
  - The chosen type is saved in `config.yaml` as `install_type` and used as the default
    on future `aptunnel init` runs.

### Changed
- **Alias defaults = actual handle** — database and environment aliases now default to the
  real Aptible handle (e.g. `mydb-dev-abc123`) instead of a shortened guess. Users can still
  change them during Custom install. Eliminates alias collision bugs.
- **DB connection password shown in full** — the password printed after opening a tunnel is no
  longer masked. Aptible already shows it; aptunnel should too so you can copy it into your
  DB client.
- **Encrypted credentials file** — `~/.aptunnel/.credentials` is now written with AES-256-GCM
  encryption (key derived from machine hostname + username via PBKDF2). Existing plaintext
  `.credentials` files are read transparently; the file is re-encrypted on the next
  `aptunnel init` or `aptunnel login`.
- **`aptunnel init` no longer hangs on N** — answering N to any prompt now cleanly skips that
  section and continues; readline is properly closed before exiting.

### Fixed
- **Windows: `aptunnel status` showing tunnels as DOWN** — on Windows with `shell: true`,
  `child.pid` is the `cmd.exe` wrapper PID which can exit while the real aptible process keeps
  running. Status now queries the port owner PID (`netstat -ano`) after the tunnel resolves and
  saves that instead.

---

## [1.2.0] — 2026-03-31

### Added
- **`aptunnel uninstall [--force]`** — clean uninstall command: stops running tunnels,
  removes config/credential files, then runs `npm uninstall -g aptunnel`. With `--force`,
  the entire `~/.aptunnel/` directory is removed.
- **`--force` on open** — if the configured port is in use, automatically selects the next
  free port instead of erroring. (Previous behaviour was to kill the process on that port;
  that has been replaced by the safer auto-select strategy.)
- **`--force` on close** — if no PID file exists but the port is still occupied, force-kills
  whatever is holding that port and reports success.

---

## [1.1.3] — 2026-03-31

### Fixed (Windows)
- **New terminal window on tunnel open** — `spawn` now passes `windowsHide: true` so the
  background `aptible db:tunnel` process runs silently in the same session instead of opening
  a new console window.
- **`aptunnel status` showing all tunnels as DOWN** — caused by two related issues:
  1. Without `windowsHide`, the new console captured stdout/stderr; the log file stayed empty
     so the poll never saw "Connect at" and never wrote the PID file.
  2. `process.kill(pid, 0)` throws `EPERM` on Windows for detached cross-process-group
     processes even when the process is alive — this incorrectly aborted the poll before the
     PID could be saved. The check now distinguishes `EPERM` (alive, no permission) from
     `ESRCH` (actually dead).
- **`aptunnel <db> --close` leaving orphan processes** — `taskkill` now uses `/T` to terminate
  the entire process tree (cmd.exe + child aptible process). Without `/T` the aptible subprocess
  stayed alive and held the log file open.

---

## [1.1.2] — 2026-03-27

### Fixed
- Replaced `ora` spinners in `aptunnel init` with plain output to fix stdin corruption that
  caused interactive prompts to break in certain terminal environments.

---

## [1.1.1] — 2026-03-26

### Fixed (security)
- Mask password in terminal output.
- Validate port range (1–65535) on user input.
- Warn instead of silently failing when `icacls` is unavailable on Windows.

---

## [1.1.0] — 2026-03-25

### Added
- `aptunnel dbs` command — list all configured databases with environment, handle, alias, port.
- `aptunnel init` environment selection improvements — clearer prompts, allow skipping with `0`.

---

## [1.0.5] — 2026-03-24

### Fixed
- `aptunnel init` always shows the default environment prompt; `0` skips it.

---

## [1.0.4] and earlier

Initial releases — core tunnel management, `aptunnel all`, `aptunnel status`,
`aptunnel init`, `aptunnel login`, cross-platform support (Linux, macOS, Windows, WSL).
