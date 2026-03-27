<p align="center">
  <h1 align="center">aptunnel</h1>
  <p align="center">Cross-platform Aptible tunnel manager — open, close and monitor multiple database tunnels with short aliases.</p>
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
```

---

## Requirements

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

The setup wizard will:

1. Verify the Aptible CLI is installed
2. Log you in — supports **2FA** (OTP prompt appears directly in your terminal)
3. Discover all your environments and databases
4. Auto-assign local ports starting at `55550`
5. Let you customize short aliases (e.g. `dev-db`, `dev-redis`) and ports
6. Ask which environment to use as the **default** (or skip with `0` for no default)
7. Write `~/.aptunnel/config.yaml`

**Environment selection during init:**

```
Available environments:
  [1] my-company-production-abc123
  [2] my-company-staging-def456
  [3] my-company-development-ghi789

Select environments (comma-separated numbers, "all", or press Enter for all): 1,3

Set a default environment (used when no --env flag is given):
  [1] my-company-production-abc123
  [2] my-company-development-ghi789
  [0] None (no default)
Default environment (0 to skip) [1]:
```

---

## Commands

### Open a tunnel

```bash
aptunnel dev-db                    # open by alias
aptunnel dev-db --port=5432        # override port for this session
aptunnel dev-db --env=staging      # target a different environment
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
```

### Open all tunnels for an environment

```bash
aptunnel all                       # uses default environment
aptunnel all --env=staging
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
```

```
LOGIN STATUS
  User:   you@company.com
  Token:  valid (expires in 6d 12h)

TUNNELS

ENVIRONMENT  DATABASE          ALIAS      PORT   STATUS  UPTIME       PID    CONNECTION URL
──────────────────────────────────────────────────────────────────────────────────────────────
dev          ekaredb-dev       dev-db     55554  UP      02h15m30s    12345  postgresql://aptible:xxx@localhost.aptible.in:55554/db
dev          ekaredb-redis     dev-redis  55555  DOWN    -            -      -
```

### Login

```bash
aptunnel login                     # uses saved credentials, supports 2FA
aptunnel login --email=x@y.com --password=secret
aptunnel login --lifetime=14d      # custom token lifetime (default: 7d)
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

---

## Configuration

Config lives at `~/.aptunnel/config.yaml`. Password is stored separately in `~/.aptunnel/.credentials` (mode 600).

```yaml
version: 1

credentials:
  email: you@company.com

defaults:
  environment: my-env-development   # omitted if you chose "no default" during init
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

## How Tunnels Work

`aptible db:tunnel` is a blocking foreground process. aptunnel spawns it **detached** with `stdio` redirected to a log file (`/tmp/aptunnel-<alias>.log`), then saves the PID to `/tmp/aptunnel-<alias>.pid`.

The tunnel is considered open once aptible prints `Connect at` in the log (polled every 500ms, timeout 60s).

On `aptunnel status`, each PID file is checked to determine if the process is still alive.

When you close a tunnel (`aptunnel dev-db --close`), aptunnel kills the process and cleans up PID/log files.

Pressing **Ctrl+C** while aptunnel is running closes all open tunnels before exiting.

---

## Troubleshooting

**"Aptible CLI not found"** — Install the [Aptible CLI](https://www.aptible.com/docs/cli) and make sure it's in your PATH. Run `aptible version` to verify.

**"Token expired"** — Run `aptunnel login`. aptunnel will attempt auto-relogin on tunnel failures, but a fresh login is the cleanest fix.

**"Port already in use"** — Another process is on that port. Use `--port=<N>` to use a different port or update it with `aptunnel config --set-port dev-db <N>`.

**"Config file is corrupted"** — Delete `~/.aptunnel/config.yaml` and re-run `aptunnel init`.

**Tunnel fails silently** — Check the log file: `cat /tmp/aptunnel-<alias>.log`.

**`aptunnel init` hangs after email/password** — This can happen if the terminal is not a TTY. Make sure you're running aptunnel directly in a terminal, not piped.

---

## Contributing

1. Fork the repo
2. Create a branch: `git checkout -b my-feature`
3. Make your changes and add tests
4. Open a pull request against `main`

---

## License

MIT — see [LICENSE](LICENSE).
