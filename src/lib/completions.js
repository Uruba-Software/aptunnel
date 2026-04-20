import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { logger } from './logger.js';
import { getConfigPath } from './config-manager.js';

const STATIC_CMDS = ['init', 'login', 'status', 'config', 'dbs', 'completions', 'uninstall', 'all', 'help'];

// ─── Bash ─────────────────────────────────────────────────────────────────────

export function bashScript() {
  const cmds = STATIC_CMDS.join(' ');
  return `#!/usr/bin/env bash
# aptunnel bash completion
# Source this file or add to ~/.bashrc:
#   source <(aptunnel completions bash)

_aptunnel_completions() {
  local cur prev
  COMPREPLY=()

  # Remove '=' from word-break chars so --flag=value is treated as a single
  # token. Without this, bash splits --env=staging into ['--env', '=', 'staging']
  # and cur becomes "" when the user types --env=<TAB>.
  local COMP_WORDBREAKS="\${COMP_WORDBREAKS//=/}"

  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  # Fetch all completion data from aptunnel in a single call.
  # aptunnel _complete all outputs "DB <name>" and "ENV <name>" lines.
  local _out all_dbs all_envs
  _out=$(aptunnel _complete all 2>/dev/null)
  all_dbs=$(printf '%s\\n' "$_out" | awk '/^DB /{print $2}' | tr '\\n' ' ')
  all_envs=$(printf '%s\\n' "$_out" | awk '/^ENV /{print $2}' | tr '\\n' ' ')

  # --env=<value>: complete the value portion
  if [[ "\${cur}" == "--env="* ]]; then
    local pfx="\${cur#--env=}"
    COMPREPLY=( $(compgen -W "$all_envs" -- "$pfx") )
    COMPREPLY=( "\${COMPREPLY[@]/#/--env=}" )
    return 0
  fi

  # --alive=<N> or --alive=max
  if [[ "\${cur}" == "--alive="* ]]; then
    local pfx="\${cur#--alive=}"
    COMPREPLY=( $(compgen -W "1 2 4 6 8 12 16 20 24 max" -- "$pfx") )
    COMPREPLY=( "\${COMPREPLY[@]/#/--alive=}" )
    return 0
  fi

  # Free-form value flags — suppress completion
  if [[ "\${cur}" == "--port="* || "\${cur}" == "--email="* || "\${cur}" == "--password="* || "\${cur}" == "--lifetime="* ]]; then
    return 0
  fi

  # --set-default <env> (space-separated form)
  if [[ "$prev" == "--set-default" ]]; then
    COMPREPLY=( $(compgen -W "$all_envs" -- "$cur") )
    return 0
  fi

  # --set-port <db> (space-separated form)
  if [[ "$prev" == "--set-port" ]]; then
    COMPREPLY=( $(compgen -W "$all_dbs" -- "$cur") )
    return 0
  fi

  # Find the subcommand (first non-flag word after 'aptunnel')
  local cmd=""
  local i
  for ((i=1; i<COMP_CWORD; i++)); do
    local w="\${COMP_WORDS[i]}"
    if [[ "\$w" != -* && -n "\$w" ]]; then
      cmd="\$w"
      break
    fi
  done

  # Context-aware flag completions
  if [[ "\${cur}" == -* ]]; then
    local flags
    case "$cmd" in
      all)        flags="--close --force --env= --alive=" ;;
      status)     flags="--watch" ;;
      login)      flags="--email= --password= --lifetime= --status" ;;
      config)     flags="--set-port --set-default --refresh --path --raw" ;;
      dbs)        flags="--env=" ;;
      uninstall)  flags="--force" ;;
      "")         flags="--help --version" ;;
      *)          flags="--close --force --port= --env= --alive=" ;;
    esac
    COMPREPLY=( $(compgen -W "\$flags" -- "$cur") )
    # Don't add a trailing space when the completion ends with '='
    [[ \${#COMPREPLY[@]} -eq 1 && "\${COMPREPLY[0]}" == *= ]] && compopt -o nospace 2>/dev/null
    return 0
  fi

  # No subcommand yet: offer built-in commands + all db aliases/handles
  if [[ -z "$cmd" ]]; then
    COMPREPLY=( $(compgen -W "${cmds} \$all_dbs" -- "$cur") )
    return 0
  fi

  local passthrough_cmds="db:backup db:clone db:dump db:execute db:list db:modify db:restart db:url db:versions backup:list logs"

  # After 'all', offer passthrough subcommands
  if [[ "$cmd" == "all" ]]; then
    COMPREPLY=( $(compgen -W "$passthrough_cmds" -- "$cur") )
    return 0
  fi

  # After a db alias, offer passthrough subcommands (if not already a subcommand context)
  if [[ -n "$cmd" && " \$all_dbs " == *" $cmd "* ]]; then
    COMPREPLY=( $(compgen -W "$passthrough_cmds" -- "$cur") )
    return 0
  fi

  # Subcommand-specific positional completions
  case "$cmd" in
    completions)
      COMPREPLY=( $(compgen -W "bash zsh fish install" -- "$cur") )
      ;;
  esac

  return 0
}

complete -F _aptunnel_completions aptunnel
`;
}

// ─── Zsh ──────────────────────────────────────────────────────────────────────

export function zshScript() {
  return `#compdef aptunnel
# aptunnel zsh completion
# Add to ~/.zshrc:
#   source <(aptunnel completions zsh)

_aptunnel() {
  local context state state_descr line
  local -A opt_args

  # Fetch completion data from aptunnel (_complete all → "DB name" / "ENV name" lines)
  local _out
  _out=$(aptunnel _complete all 2>/dev/null)
  local -a all_dbs all_envs
  all_dbs=( \${(f)"$(printf '%s\\n' "\$_out" | awk '/^DB /{print \$2}')"} )
  all_envs=( \${(f)"$(printf '%s\\n' "\$_out" | awk '/^ENV /{print \$2}')"} )

  local -a cmds
  cmds=(
    'init:Setup wizard'
    'login:Authenticate with Aptible'
    'status:Show all tunnel statuses'
    'config:View or modify configuration'
    'dbs:List configured databases'
    'completions:Generate shell completion script'
    'uninstall:Uninstall aptunnel'
    'all:Open all tunnels'
    'help:Show help'
  )
  local db
  for db in \$all_dbs; do
    cmds+=("\$db:Open tunnel to \$db")
  done

  _arguments -C \\
    '(-h --help)'{-h,--help}'[Show help]' \\
    '(-v --version)'{-v,--version}'[Show version]' \\
    '1: :->cmd' \\
    '*:: :->args'

  case \$state in
    cmd)
      _describe 'command' cmds
      ;;
    args)
      case \$words[1] in
        all)
          _arguments \\
            '--close[Close all tunnels]' \\
            '--force[Force port selection / skip confirmation]' \\
            "--env=[Target environment]:environment:(\$all_envs)" \\
            '--alive=[Auto-close after N hours (1-24 or max)]:hours:(1 2 4 6 8 12 16 20 24 max)' \\
            '1:aptible command:(db:backup db:clone db:dump db:execute db:list db:modify db:restart db:url db:versions backup:list logs)'
          ;;
        status)
          _arguments '--watch[Live-refresh every 2 seconds]'
          ;;
        login)
          _arguments \\
            '--email=[Aptible account email]: :' \\
            '--password=[Aptible account password]: :' \\
            '--lifetime=[Token lifetime]:lifetime:(1d 2d 3d 7d)' \\
            '--status[Show current token info only]'
          ;;
        config)
          _arguments \\
            "--set-port[Set local port for a database]:database:(\$all_dbs)" \\
            "--set-default[Set default environment]:environment:(\$all_envs)" \\
            '--refresh[Re-discover environments and databases]' \\
            '--path[Print config file path]' \\
            '--raw[Include password in output]'
          ;;
        dbs)
          _arguments "--env=[Filter by environment]:environment:(\$all_envs)"
          ;;
        uninstall)
          _arguments '--force[Remove entire ~/.aptunnel directory]'
          ;;
        completions)
          _arguments '1:shell:(bash zsh fish install)'
          ;;
        *)
          _arguments \\
            '--close[Close this tunnel]' \\
            '--force[Auto-select free port on conflict]' \\
            '--port=[Override local port for this session]: :' \\
            "--env=[Target a different environment]:environment:(\$all_envs)" \\
            '--alive=[Auto-close after N hours (1-24 or max)]:hours:(1 2 4 6 8 12 16 20 24 max)' \\
            '1:aptible command:(db:backup db:clone db:dump db:execute db:list db:modify db:restart db:url db:versions backup:list logs)'
          ;;
      esac
      ;;
  esac
}

_aptunnel "\$@"
`;
}

// ─── Fish ─────────────────────────────────────────────────────────────────────

export function fishScript() {
  return `# aptunnel fish completion
# Copy to ~/.config/fish/completions/aptunnel.fish
# or run: aptunnel completions install

# DB aliases + handles from config
function __aptunnel_dbs
  aptunnel _complete dbs 2>/dev/null
end

# Env aliases + handles from config
function __aptunnel_envs
  aptunnel _complete envs 2>/dev/null
end

function __aptunnel_no_subcommand
  not __fish_seen_subcommand_from init login status config dbs completions uninstall all help (__aptunnel_dbs)
end

# Built-in commands
complete -c aptunnel -f -n '__aptunnel_no_subcommand' -a 'init'        -d 'Setup wizard'
complete -c aptunnel -f -n '__aptunnel_no_subcommand' -a 'login'       -d 'Authenticate with Aptible'
complete -c aptunnel -f -n '__aptunnel_no_subcommand' -a 'status'      -d 'Show all tunnel statuses'
complete -c aptunnel -f -n '__aptunnel_no_subcommand' -a 'config'      -d 'View or modify configuration'
complete -c aptunnel -f -n '__aptunnel_no_subcommand' -a 'dbs'         -d 'List configured databases'
complete -c aptunnel -f -n '__aptunnel_no_subcommand' -a 'completions' -d 'Generate shell completion script'
complete -c aptunnel -f -n '__aptunnel_no_subcommand' -a 'uninstall'   -d 'Uninstall aptunnel'
complete -c aptunnel -f -n '__aptunnel_no_subcommand' -a 'all'         -d 'Open all tunnels'

# Dynamic DB completions
complete -c aptunnel -f -n '__aptunnel_no_subcommand' -a '(__aptunnel_dbs)' -d 'Open tunnel'

# completions subcommand
complete -c aptunnel -f -n '__fish_seen_subcommand_from completions' -a 'bash'    -d 'Bash completion script'
complete -c aptunnel -f -n '__fish_seen_subcommand_from completions' -a 'zsh'     -d 'Zsh completion script'
complete -c aptunnel -f -n '__fish_seen_subcommand_from completions' -a 'fish'    -d 'Fish completion script'
complete -c aptunnel -f -n '__fish_seen_subcommand_from completions' -a 'install' -d 'Auto-install for current shell'

# Passthrough subcommands (after a db alias or 'all')
set -l _passthrough_cmds 'db:backup db:clone db:dump db:execute db:list db:modify db:restart db:url db:versions backup:list logs'
for _subcmd in $_passthrough_cmds
  complete -c aptunnel -f -n '__fish_seen_subcommand_from all (__aptunnel_dbs)' -a $_subcmd -d 'Aptible command'
end

# Global tunnel flags
complete -c aptunnel -l close -d 'Close tunnel(s)'
complete -c aptunnel -l force -d 'Force port selection / skip confirmation'
complete -c aptunnel -l port  -d 'Override local port' -r
complete -c aptunnel -l env   -d 'Target environment' -r -a '(__aptunnel_envs)'
complete -c aptunnel -l alive -d 'Auto-close after N hours' -r -a '1 2 4 6 8 12 16 20 24 max'

# status
complete -c aptunnel -n '__fish_seen_subcommand_from status' -l watch -d 'Live-refresh every 2 seconds'

# login
complete -c aptunnel -n '__fish_seen_subcommand_from login' -l email    -d 'Aptible email' -r
complete -c aptunnel -n '__fish_seen_subcommand_from login' -l password -d 'Aptible password' -r
complete -c aptunnel -n '__fish_seen_subcommand_from login' -l lifetime -d 'Token lifetime' -r -a '1d 2d 3d 7d'
complete -c aptunnel -n '__fish_seen_subcommand_from login' -l status   -d 'Show token info only'

# config
complete -c aptunnel -n '__fish_seen_subcommand_from config' -l set-port    -d 'Set port for a database' -r -a '(__aptunnel_dbs)'
complete -c aptunnel -n '__fish_seen_subcommand_from config' -l set-default -d 'Set default environment' -r -a '(__aptunnel_envs)'
complete -c aptunnel -n '__fish_seen_subcommand_from config' -l refresh     -d 'Re-discover databases'
complete -c aptunnel -n '__fish_seen_subcommand_from config' -l path        -d 'Print config file path'
complete -c aptunnel -n '__fish_seen_subcommand_from config' -l raw         -d 'Include password in output'

# Global
complete -c aptunnel -s h -l help    -d 'Show help'
complete -c aptunnel -s v -l version -d 'Show version'
`;
}

// ─── Install ──────────────────────────────────────────────────────────────────

export function installCompletions(quiet = false) {
  const shell = detectShell();

  if (shell === 'bash') {
    const rcFile = join(homedir(), '.bashrc');
    const line   = '\n# aptunnel completions\nsource <(aptunnel completions bash)\n';
    if (existsSync(rcFile) && readFileSync(rcFile, 'utf8').includes('aptunnel completions')) {
      logger.info('Shell completions already installed.');
      return;
    }
    const existing = existsSync(rcFile) ? readFileSync(rcFile, 'utf8') : '';
    writeFileSync(rcFile, existing + line);
    logger.success('Bash completions installed in ~/.bashrc — run: source ~/.bashrc');
    return;
  }

  if (shell === 'zsh') {
    const rcFile = join(homedir(), '.zshrc');
    const line   = '\n# aptunnel completions\nsource <(aptunnel completions zsh)\n';
    if (existsSync(rcFile) && readFileSync(rcFile, 'utf8').includes('aptunnel completions')) {
      logger.info('Shell completions already installed.');
      return;
    }
    const existing = existsSync(rcFile) ? readFileSync(rcFile, 'utf8') : '';
    writeFileSync(rcFile, existing + line);
    logger.success('Zsh completions installed in ~/.zshrc — run: source ~/.zshrc');
    return;
  }

  if (shell === 'fish') {
    const fishDir  = join(homedir(), '.config', 'fish', 'completions');
    const fishFile = join(fishDir, 'aptunnel.fish');
    mkdirSync(fishDir, { recursive: true });
    writeFileSync(fishFile, fishScript());
    logger.success(`Fish completions installed to ${fishFile}`);
    return;
  }

  if (!quiet) {
    logger.warn(`Could not detect shell (SHELL=${process.env.SHELL ?? 'unset'}). Run manually:`);
    logger.plain('  aptunnel completions bash   → paste output into ~/.bashrc');
    logger.plain('  aptunnel completions zsh    → paste output into ~/.zshrc');
    logger.plain('  aptunnel completions fish   → aptunnel completions install');
  }
}

function detectShell() {
  const shell = process.env.SHELL ?? '';
  if (shell.includes('zsh'))  return 'zsh';
  if (shell.includes('bash')) return 'bash';
  if (shell.includes('fish')) return 'fish';
  return null;
}
