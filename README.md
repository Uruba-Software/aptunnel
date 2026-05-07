<p align="center">
  <h1 align="center">aptunnel</h1>
  <p align="center">Full-featured Aptible CLI wrapper — manage database tunnels with short aliases, plus alias-resolved passthrough for every Aptible command.</p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/aptunnel"><img src="https://img.shields.io/npm/v/aptunnel?color=cb3837&label=npm&logo=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/aptunnel"><img src="https://img.shields.io/npm/dm/aptunnel?color=cb3837&logo=npm&label=downloads" alt="npm downloads"></a>
  <a href="https://github.com/Uruba-Software/aptunnel/actions/workflows/test.yml"><img src="https://github.com/Uruba-Software/aptunnel/actions/workflows/test.yml/badge.svg" alt="CI"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/aptunnel?color=339933&logo=node.js&logoColor=white" alt="Node.js version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/aptunnel?color=blue" alt="License"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Linux-supported-FCC624?logo=linux&logoColor=black" alt="Linux">
  <img src="https://img.shields.io/badge/macOS-supported-000000?logo=apple&logoColor=white" alt="macOS">
  <img src="https://img.shields.io/badge/Windows-supported-0078D4?logo=windows&logoColor=white" alt="Windows">
  <img src="https://img.shields.io/badge/WSL-supported-4EAA25?logo=gnubash&logoColor=white" alt="WSL">
</p>

---

```
aptunnel dev-db          # open tunnel to dev database
aptunnel all             # open all configured tunnels
aptunnel dbs             # list all configured databases
aptunnel status          # see what's running
aptunnel uninstall       # clean uninstall (stops tunnels, removes config, runs npm uninstall)
```

---

## Requirements

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)


[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)


- **[Node.js](https://nodejs.org)** 18+
- **[Aptible CLI](https://www.aptible.com/docs/cli)** installed and in your PATH

---

## Install

```bash
npm install -g aptunnel
```

---

## Quick Start

```bash
aptunnel init
```

The setup wizard first asks for an installation type:

```
Installation type:
  [1] Express  — login + auto-configure everything with defaults
  [2] Custom   — full interactive setup (ports, aliases, environments)

Select [1]:
```

### Express install (recommended)

Enter your Aptible email + password (2FA prompt appears if enabled). aptunnel then:

1. Logs you in
2. Discovers all your environments and databases automatically
3. Assigns local ports starting at `55550`
4. Uses each database's actual Aptible handle as its alias
5. Writes `~/.aptunnel/config.yaml`

No further prompts. Run `aptunnel config --set-port` or `aptunnel config --set-default` afterwards to customise.

### Custom install

Same login step, then full interactive setup:

1. Select which environments to include
2. Optionally customise port numbers and aliases for each database
3. Writes `~/.aptunnel/config.yaml`

**Example Custom session:**

```
Available environments:
  [1] my-company-production-abc123
  [2] my-company-staging-def456
  [3] my-company-development-ghi789

Select environments (comma-separated numbers or "all") [all]: 1,3

  Databases in my-company-production-abc123:
  [1] mydb-prod  →  alias: mydb-prod  port: 55550  (postgresql)

  Customize aliases? (y/N) [N]: y
    Alias for mydb-prod [mydb-prod]: prod-db
```

The chosen install type is saved in `config.yaml` and used as the default on future `aptunnel init` runs.

---

## Commands

### Open a tunnel

```bash
aptunnel dev-db                    # open by alias
aptunnel dev-db --port=5432        # override port for this session
aptunnel dev-db --env=staging      # target a different environment
aptunnel dev-db --force            # auto-select a free port if configured port is busy
```

Output:
```
✔ dev-db tunnel opened
  Port:      55554
  Host:      localhost.aptible.in
  User:      aptible
  Password:  xxxxxxxxxx
  URL:       postgresql://aptible:xxxxxxxxxx@localhost.aptible.in:55554/db
  PID:       12345
```

### Close a tunnel

```bash
aptunnel dev-db --close
aptunnel all --close               # close all
aptunnel all --close --env=staging # close all in staging
aptunnel dev-db --close --force    # force-release port even if no PID file
```

### Open all tunnels for an environment

```bash
aptunnel all                       # open all environments (warns on production)
aptunnel all --env=staging         # open all tunnels in a specific environment
```

### List databases

```bash
aptunnel dbs                       # all configured databases
aptunnel dbs --env=staging         # filter by environment
```

Output:
```
ALIAS      DATABASE             TYPE        PORT    ENVIRONMENT
─────────────────────────────────────────────────────────────────────
dev-db     mydb-dev             postgresql  55550   dev
dev-redis  mydb-dev-redis       redis       55551   dev
stg-db     mydb-staging         postgresql  55552   staging
```

### Status

```bash
aptunnel status
aptunnel status --watch            # live-refresh every 2 seconds
```

```
LOGIN STATUS
  User:   you@company.com
  Token:  valid (expires in 6d 12h)

TUNNELS

DATABASE                   PORT    TYPE   STATUS  UPTIME       PID    URL
────────────────────────────────────────────────────────────────────────────────────────────────────
── dev (my-env-development) ────────────────────────────────────────────────────────────────────────
db-dev (dev-db)       55554   pg     UP      02h15m30s    12345  postgresql://aptible:xxx@...
db-redis (dev-redis)  55555   redis  DOWN    -            -      -
── staging (my-env-staging) ────────────────────────────────────────────────────────────────────────
db-staging (stg-db)   55552   pg     DOWN    -            -      -
```

### Login

```bash
aptunnel login                     # uses saved credentials, supports 2FA
aptunnel login --email=x@y.com --password=secret
aptunnel login --lifetime=7d       # custom token lifetime (max: 7d)
aptunnel login --status            # show token info only
```

### Config

```bash
aptunnel config                    # print config (password masked)
aptunnel config --raw              # include password
aptunnel config --set-port dev-db 5433
aptunnel config --set-default staging
aptunnel config --refresh          # re-discover environments/databases
aptunnel config --path             # print config file path
```

### Uninstall

```bash
aptunnel uninstall                 # stop tunnels, remove config files, run npm uninstall
aptunnel uninstall --force         # also removes the entire ~/.aptunnel directory
```

`aptunnel uninstall` does the following in order:

1. Stops all running tunnels
2. Removes `~/.aptunnel/config.yaml` and `~/.aptunnel/.credentials`
3. Runs `npm uninstall -g aptunnel`

With `--force`, step 2 removes the entire `~/.aptunnel/` directory instead of individual files.

---

## Configuration

Config lives at `~/.aptunnel/config.yaml`. Your Aptible account password is stored separately in `~/.aptunnel/.credentials` — AES-256-GCM encrypted with a key derived from your machine hostname and username (PBKDF2), and with file permissions restricted to your user (mode 600 on Unix, `icacls` on Windows). Existing plaintext credential files from earlier versions are read transparently and re-encrypted on next login.

```yaml
version: 1

credentials:
  email: you@company.com

defaults:
  lifetime: 7d

environments:
  my-env-development:
    alias: dev
    databases:
      mydb-dev:
        alias: dev-db
        port: 55554
        type: postgresql
      mydb-redis:
        alias: dev-redis
        port: 55555
        type: redis

tunnel_defaults:
  start_port: 55550
  port_increment: 1
```

### Overridable environment variables

| Variable | Default | Purpose |
|---|---|---|
| `APTUNNEL_CONFIG_HOME` | `~/.aptunnel` | Config directory location |
| `APTUNNEL_TEMP_DIR` | system tmpdir | PID/log file directory |

---

## Shell Completions

```bash
aptunnel completions install       # auto-detects your shell
```

Or manually:

```bash
# Bash — add to ~/.bashrc
source <(aptunnel completions bash)

# Zsh — add to ~/.zshrc
source <(aptunnel completions zsh)

# Fish
aptunnel completions fish > ~/.config/fish/completions/aptunnel.fish
```

Completions are dynamic — your actual database aliases appear in tab-completion.

---

## Platform Support

| Platform | Status | Notes |
|---|---|---|
| **Linux** | ✅ Full | `lsof`, `ps`, Unix signals |
| **macOS** | ✅ Full | Same as Linux |
| **Windows** | ✅ Full | `netstat`, `tasklist`, `taskkill` |
| **WSL** | ✅ Full | Treated as Linux |

**Install Aptible CLI:**

```bash
# macOS
brew install aptible/aptible/aptible

# Linux / WSL
curl -s https://toolbelt.aptible.com/install.sh | bash

# Windows
# Download from https://www.aptible.com/docs/cli
```

---

## Aptible CLI Passthrough

aptunnel is a full wrapper around the Aptible CLI. Any Aptible command can be run through aptunnel — if aptunnel doesn't handle it natively, it is forwarded to `aptible` automatically.

### Alias-resolved commands

For common database operations, aptunnel resolves your alias to the real Aptible handle and environment, so you never have to type them manually:

```bash
# Without aptunnel:
aptible db:backup mydb-production-abc123 --environment my-company-prod-env

# With aptunnel (alias configured in init):
aptunnel mydb-prod db:backup
```

| aptunnel command | Equivalent aptible command |
|---|---|
| `aptunnel <alias> db:backup` | `aptible db:backup <handle> --environment <env>` |
| `aptunnel <alias> db:dump` | `aptible db:dump <handle> --environment <env>` |
| `aptunnel <alias> db:url` | `aptible db:url <handle> --environment <env>` |
| `aptunnel <alias> db:restart` | `aptible db:restart <handle> --environment <env>` |
| `aptunnel <alias> db:modify` | `aptible db:modify <handle> --environment <env>` |
| `aptunnel <alias> db:list` | `aptible db:list --environment <env>` |
| `aptunnel <alias> db:versions` | `aptible db:versions <handle> --environment <env>` |
| `aptunnel <alias> backup:list` | `aptible backup:list <handle> --environment <env>` |
| `aptunnel <alias> logs` | `aptible logs --database <handle> --environment <env>` |

Extra flags are passed through as-is:

```bash
aptunnel mydb-prod db:restart --container-size 1024
```

### Bulk operations with `all`

Run any command on every configured database at once. Read-only commands run immediately; write operations ask for confirmation first:

```bash
aptunnel all db:backup              # backs up all databases (confirmation prompt)
aptunnel all db:backup --force      # skip confirmation
aptunnel all db:list                # list databases in all environments (no prompt)
aptunnel all db:backup --env=prod   # only databases in the prod environment
```

### Verbatim passthrough

Any command aptunnel doesn't recognise is forwarded to the Aptible CLI verbatim — no alias resolution, no modifications:

```bash
aptunnel db:list --environment my-env       # forwarded as-is to aptible
aptunnel environment:list                   # forwarded as-is to aptible
aptunnel operation:follow 12345             # forwarded as-is to aptible
```

Tab completion is available for alias-resolved commands. For verbatim passthrough, use the Aptible CLI syntax directly.

---

## How Tunnels Work

`aptible db:tunnel` is a blocking foreground process. aptunnel spawns it as a background process with `stdio` redirected to a log file (`/tmp/aptunnel-<alias>.log`), then saves the PID to `/tmp/aptunnel-<alias>.pid`.

The tunnel is considered open once aptible prints `Connect at` in the log (polled every 500 ms, 60 s timeout).

On `aptunnel status`, each PID file is checked to determine if the process is still alive.

When you close a tunnel (`aptunnel dev-db --close`), aptunnel kills the process and cleans up PID/log files.

Pressing **Ctrl+C** while a tunnel command is running closes any tunnels opened in that session before exiting. In `status --watch` mode, Ctrl+C exits the watch loop without affecting background tunnels.

**Windows note:** On Windows the tunnel process is not fully detached from the terminal session. If you close the terminal window while tunnels are running, they will be terminated. Re-open them with `aptunnel <alias>` or `aptunnel all`.

---

## Troubleshooting

**"Aptible CLI not found"** — Install the [Aptible CLI](https://www.aptible.com/docs/cli) and make sure it's in your PATH. Run `aptible version` to verify.

**"Token expired"** — Run `aptunnel login`. aptunnel will attempt auto-relogin on tunnel failures, but a fresh login is the cleanest fix.

**"Port already in use"** — Another process is on that port. Use `--force` to let aptunnel auto-select the next free port, `--port=<N>` to pick one manually, or update the default with `aptunnel config --set-port dev-db <N>`.

**"Config file is corrupted"** — Delete `~/.aptunnel/config.yaml` and re-run `aptunnel init`.

**Tunnel fails silently** — Check the log file: `cat /tmp/aptunnel-<alias>.log`.

**`aptunnel init` hangs after email/password** — This can happen if the terminal is not a TTY. Make sure you're running aptunnel directly in a terminal, not piped.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local dev setup, architecture overview, and the release process.

---

## License

MIT — see [LICENSE](LICENSE).
