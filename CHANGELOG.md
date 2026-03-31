# Changelog

All notable changes to aptunnel are documented here.

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
