import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { logger } from './logger.js';
import { getConfigPath } from './config-manager.js';

const STATIC_CMDS = ['init', 'login', 'status', 'config', 'dbs', 'completions', 'uninstall', 'all', 'help'];

// ─── Bash ─────────────────────────────────────────────────────────────────────

/**
 * Generate bash completion script.
 *
 * Config YAML indentation (js-yaml, 2-space):
 *   environments:          (0)
 *     <env-handle>:        (2)  ← env handle
 *       alias: <val>       (4)  ← env alias
 *       databases:         (4)
 *         <db-handle>:     (6)  ← db handle
 *           alias: <val>   (8)  ← db alias
 */
export function bashScript() {
  const configPath = getConfigPath();
  const cmds = STATIC_CMDS.join(' ');
  return `#!/usr/bin/env bash
# aptunnel bash completion
# Source this file or add to ~/.bashrc:
#   source <(aptunnel completions bash)

_aptunnel_completions() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  local config="${configPath}"
  local db_aliases db_handles env_aliases env_handles all_dbs all_envs
  db_aliases="" db_handles="" env_aliases="" env_handles=""

  if [[ -f "$config" ]]; then
    # DB aliases: 8-space indent (under each database entry)
    db_aliases=$(grep -E '^        alias: ' "$config" 2>/dev/null | awk '{print $2}')
    # DB handles: 6-space indent keys
    db_handles=$(grep -E '^      [a-zA-Z0-9]' "$config" 2>/dev/null | sed 's/^ *//;s/:.*//')
    # Env aliases: 4-space indent (under each environment entry)
    env_aliases=$(grep -E '^    alias: ' "$config" 2>/dev/null | awk '{print $2}')
    # Env handles: 2-space indent keys inside the environments: block only
    env_handles=$(awk '/^environments:/{f=1;next} /^[a-zA-Z]/{f=0} f && /^  [a-zA-Z0-9]/{h=$0; sub(/^  /,"",h); sub(/:.*$/,"",h); print h}' "$config" 2>/dev/null)
  fi

  # Deduplicated space-separated lists
  all_dbs=$(printf '%s\\n' $db_aliases $db_handles | grep -v '^$' | sort -u | tr '\\n' ' ')
  all_envs=$(printf '%s\\n' $env_aliases $env_handles | grep -v '^$' | sort -u | tr '\\n' ' ')

  # --env=<value>: complete just the value part
  if [[ "\${cur}" == "--env="* ]]; then
    local pfx="\${cur#--env=}"
    local matches
    matches=$(compgen -W "$all_envs" -- "$pfx")
    COMPREPLY=( $(printf '%s\\n' $matches | sed 's|^|--env=|') )
    return 0
  fi

  # Other value flags: no completion
  if [[ "\${cur}" == "--port="* || "\${cur}" == "--email="* || "\${cur}" == "--password="* || "\${cur}" == "--lifetime="* ]]; then
    return 0
  fi

  # --set-default <env>  (space-separated form)
  if [[ "$prev" == "--set-default" ]]; then
    COMPREPLY=( $(compgen -W "$all_envs" -- "$cur") )
    return 0
  fi

  # --set-port <db>  (space-separated form)
  if [[ "$prev" == "--set-port" ]]; then
    COMPREPLY=( $(compgen -W "$all_dbs" -- "$cur") )
    return 0
  fi

  # Determine the subcommand (first non-flag word after 'aptunnel')
  local cmd=""
  local i
  for ((i=1; i<COMP_CWORD; i++)); do
    local w="\${COMP_WORDS[i]}"
    if [[ "$w" != -* && -n "$w" ]]; then
      cmd="$w"
      break
    fi
  done

  # Context-aware flag completions
  if [[ "\${cur}" == -* ]]; then
    local flags
    case "$cmd" in
      all)         flags="--close --force --env=" ;;
      status)      flags="--watch" ;;
      login)       flags="--email= --password= --lifetime= --status" ;;
      config)      flags="--set-port --set-default --refresh --path --raw" ;;
      dbs)         flags="--env=" ;;
      uninstall)   flags="--force" ;;
      "")          flags="--help --version" ;;
      *)           flags="--close --force --port= --env=" ;;
    esac
    COMPREPLY=( $(compgen -W "$flags" -- "$cur") )
    return 0
  fi

  # No subcommand yet: show commands + db aliases/handles
  if [[ -z "$cmd" ]]; then
    COMPREPLY=( $(compgen -W "${cmds} $all_dbs" -- "$cur") )
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
  const configPath = getConfigPath();
  return `#compdef aptunnel
# aptunnel zsh completion
# Add to ~/.zshrc:
#   source <(aptunnel completions zsh)

_aptunnel() {
  local context state state_descr line
  local -A opt_args
  local config="${configPath}"
  local -a db_aliases db_handles env_aliases env_handles all_dbs all_envs

  if [[ -f "\$config" ]]; then
    db_aliases=( \${(f)"$(grep -E '^        alias: ' "\$config" 2>/dev/null | awk '{print \$2}')"} )
    db_handles=( \${(f)"$(grep -E '^      [a-zA-Z0-9]' "\$config" 2>/dev/null | sed 's/^ *//;s/:.*//')"} )
    env_aliases=( \${(f)"$(grep -E '^    alias: ' "\$config" 2>/dev/null | awk '{print \$2}')"} )
    env_handles=( \${(f)"$(awk '/^environments:/{f=1;next} /^[a-zA-Z]/{f=0} f && /^  [a-zA-Z0-9]/{h=\$0; sub(/^  /,"",h); sub(/:.*\$/,"",h); print h}' "\$config" 2>/dev/null)"} )
  fi

  all_dbs=( \${(u)(\${db_aliases[@]} \${db_handles[@]})} )
  all_envs=( \${(u)(\${env_aliases[@]} \${env_handles[@]})} )

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
            '--force[Force port selection on conflict]' \\
            "--env=[Target environment]:environment:(\$all_envs)"
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
            "--env=[Target a different environment]:environment:(\$all_envs)"
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
  const configPath = getConfigPath();
  return `# aptunnel fish completion
# Copy to ~/.config/fish/completions/aptunnel.fish
# or run: aptunnel completions install

set -l config_path "${configPath}"

# Extract DB aliases (8-space indent)
function __aptunnel_db_aliases
  if test -f $config_path
    grep -E '^        alias: ' $config_path 2>/dev/null | awk '{print $2}'
  end
end

# Extract DB handles (6-space indent)
function __aptunnel_db_handles
  if test -f $config_path
    grep -E '^      [a-zA-Z0-9]' $config_path 2>/dev/null | sed 's/^ *//;s/:.*//'
  end
end

# All DB identifiers (aliases + handles, deduplicated)
function __aptunnel_dbs
  begin
    __aptunnel_db_aliases
    __aptunnel_db_handles
  end | sort -u
end

# Extract env aliases (4-space indent)
function __aptunnel_env_aliases
  if test -f $config_path
    grep -E '^    alias: ' $config_path 2>/dev/null | awk '{print $2}'
  end
end

# Extract env handles (inside environments: block, 2-space indent)
function __aptunnel_env_handles
  if test -f $config_path
    awk '/^environments:/{f=1;next} /^[a-zA-Z]/{f=0} f && /^  [a-zA-Z0-9]/{h=$0; sub(/^  /,"",h); sub(/:.*$/,"",h); print h}' $config_path 2>/dev/null
  end
end

# All env identifiers
function __aptunnel_envs
  begin
    __aptunnel_env_aliases
    __aptunnel_env_handles
  end | sort -u
end

function __aptunnel_no_subcommand
  not __fish_seen_subcommand_from init login status config dbs completions uninstall all help (__aptunnel_dbs)
end

# Static commands
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

# Global flags (tunnel commands)
complete -c aptunnel -l close   -d 'Close tunnel(s)'
complete -c aptunnel -l force   -d 'Force port selection / release'
complete -c aptunnel -l port    -d 'Override local port' -r
complete -c aptunnel -l env     -d 'Target environment' -r -a '(__aptunnel_envs)'

# status flag
complete -c aptunnel -n '__fish_seen_subcommand_from status' -l watch -d 'Live-refresh every 2 seconds'

# login flags
complete -c aptunnel -n '__fish_seen_subcommand_from login' -l email    -d 'Aptible email' -r
complete -c aptunnel -n '__fish_seen_subcommand_from login' -l password -d 'Aptible password' -r
complete -c aptunnel -n '__fish_seen_subcommand_from login' -l lifetime -d 'Token lifetime' -r -a '1d 2d 3d 7d'
complete -c aptunnel -n '__fish_seen_subcommand_from login' -l status   -d 'Show token info only'

# config flags
complete -c aptunnel -n '__fish_seen_subcommand_from config' -l set-port    -d 'Set port for a database' -r -a '(__aptunnel_dbs)'
complete -c aptunnel -n '__fish_seen_subcommand_from config' -l set-default -d 'Set default environment' -r -a '(__aptunnel_envs)'
complete -c aptunnel -n '__fish_seen_subcommand_from config' -l refresh     -d 'Re-discover databases'
complete -c aptunnel -n '__fish_seen_subcommand_from config' -l path        -d 'Print config file path'
complete -c aptunnel -n '__fish_seen_subcommand_from config' -l raw         -d 'Include password in output'

# Global flags
complete -c aptunnel -s h -l help    -d 'Show help'
complete -c aptunnel -s v -l version -d 'Show version'
`;
}

// ─── Install ──────────────────────────────────────────────────────────────────

/**
 * Auto-detect shell and install the completion script.
 * @param {boolean} quiet  Suppress "no shell detected" warning (used by init)
 */
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
