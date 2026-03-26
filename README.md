# aptunnel

Cross-platform Aptible tunnel manager. Open, close, and monitor multiple database tunnels with short aliases instead of long Aptible handles.

```
aptunnel dev-db          # open tunnel to dev database
aptunnel all             # open all configured tunnels
aptunnel status          # see what's running
```

---

## Requirements

- **Node.js** 18+
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

The wizard will:
1. Verify aptible CLI is installed
2. Log you in (supports 2FA)
3. Discover all your environments and databases
4. Auto-assign ports starting at `55550`
5. Let you set short aliases (e.g. `dev-db`, `dev-redis`)
6. Write `~/.aptunnel/config.yaml`

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
──────────── ─────────────── ─────────── ────── ─────── ──────────── ────── ──────────────────────────────────────────
dev          ekaredb-dev      dev-db     55554  UP      02h15m30s    12345  postgresql://aptible:xxx@localhost.aptible.in:55554/db
dev          ekaredb-redis    dev-redis  55555  DOWN    -            -      -
```

### Login

```bash
aptunnel login                     # uses saved credentials, supports 2FA
aptunnel login --email=x@y.com --password=secret
aptunnel login --lifetime=14d      # custom token lifetime
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
  environment: ekare-inc-development-gfpkcova
  lifetime: 7d

environments:
  ekare-inc-development-gfpkcova:
    alias: dev
    databases:
      ekaredb-dev:
        alias: dev-db
        port: 55554
        type: postgresql
      ekaredb-dev-redis:
        alias: dev-redis
        port: 55555
        type: redis

tunnel_defaults:
  start_port: 55550
  port_increment: 1
```

---

## Shell Completions

### Auto-install (detects your shell)

```bash
aptunnel completions install
```

### Manual

**Bash** — add to `~/.bashrc`:
```bash
source <(aptunnel completions bash)
```

**Zsh** — add to `~/.zshrc`:
```bash
source <(aptunnel completions zsh)
```

**Fish** — copy to completions directory:
```bash
aptunnel completions fish > ~/.config/fish/completions/aptunnel.fish
```

Completions are dynamic — they read your config at runtime so your actual database aliases appear in tab-completion.

---

## Platform Notes

### macOS
Full support. Install Aptible CLI via Homebrew:
```bash
brew install aptible/aptible/aptible
```

### Linux
Full support. Install Aptible CLI:
```bash
curl -s https://toolbelt.aptible.com/install.sh | bash
```

### Windows
Supported with some limitations:
- Process management uses `taskkill` and `wmic` instead of Unix signals
- Port detection uses `netstat` instead of `lsof`
- File permissions use `icacls` for the credentials file
- Requires Node.js 18+ for Windows

### WSL (Windows Subsystem for Linux)
Treated as Linux. Browser opening uses `wslview` if available, otherwise falls back to `cmd.exe /c start`.

---

## How Tunnels Work

`aptible db:tunnel` is a blocking foreground process. aptunnel spawns it **detached** with `stdio` redirected to a log file (`/tmp/aptunnel-<alias>.log`), then saves the PID to `/tmp/aptunnel-<alias>.pid`.

On `aptunnel status`, each PID file is checked to determine if the process is still alive.

When you close a tunnel (`aptunnel dev-db --close`), aptunnel kills the process and cleans up the PID file.

Pressing **Ctrl+C** while aptunnel is running closes all open tunnels before exiting.

---

## Troubleshooting

**"Aptible CLI not found"** — Install aptible and make sure it's in your PATH. Run `aptible version` to verify.

**"Token expired"** — Run `aptunnel login`. aptunnel will attempt auto-relogin on tunnel failures, but a fresh login is the cleanest fix.

**"Port already in use"** — Another process is on that port. Use `--force` to kill it or `--port=<N>` to use a different port.

**"Config file is corrupted"** — Delete `~/.aptunnel/config.yaml` and re-run `aptunnel init`.

**Tunnel fails silently** — Check the log file: `cat /tmp/aptunnel-<alias>.log`. Set `DEBUG=1` for verbose output from aptunnel.

---

## Contributing

1. Fork the repo
2. Create a branch: `git checkout -b my-feature`
3. Make your changes
4. Open a pull request against `main`

Please keep PRs focused. One feature or fix per PR.

---

## License

MIT — see [LICENSE](LICENSE).
