import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { logger } from './logger.js';
import { getConfigPath } from './config-manager.js';

const STATIC_CMDS = ['init', 'login', 'status', 'config', 'completions', 'help', 'all'];
const STATIC_FLAGS = ['--close', '--force', '--help', '--version', '--port=', '--env='];

/**
 * Generate bash completion script.
 * Reads aliases at runtime from config.yaml using awk (no YAML parser needed in bash).
 */
export function bashScript() {
  const configPath = getConfigPath();
  return `#!/usr/bin/env bash
# aptunnel bash completion
# Source this file or add to ~/.bashrc:
#   source <(aptunnel completions bash)

_aptunnel_completions() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  # Get aliases from config at runtime
  local config="${configPath}"
  local db_aliases=""
  local env_aliases=""
  if [ -f "$config" ]; then
    db_aliases=$(awk '/^  [a-z]/{if(alias) print alias} /alias:/{alias=$2}' "$config" 2>/dev/null | sort -u)
    env_aliases=$(awk '/^[a-z].*:$/{env=substr($0,1,length($0)-1)} /  alias:/{print $2}' "$config" 2>/dev/null | sort -u)
  fi

  local all_cmds="${STATIC_CMDS.join(' ')} $db_aliases"

  case "$prev" in
    --env)
      COMPREPLY=( $(compgen -W "$env_aliases" -- "$cur") )
      return 0
      ;;
    --port)
      # No completion for port numbers
      return 0
      ;;
  esac

  if [[ "$cur" == --* ]]; then
    COMPREPLY=( $(compgen -W "${STATIC_FLAGS.join(' ')}" -- "$cur") )
    return 0
  fi

  COMPREPLY=( $(compgen -W "$all_cmds" -- "$cur") )
  return 0
}

complete -F _aptunnel_completions aptunnel
`;
}

/**
 * Generate zsh completion script.
 */
export function zshScript() {
  const configPath = getConfigPath();
  return `#compdef aptunnel
# aptunnel zsh completion
# Add to ~/.zshrc:
#   source <(aptunnel completions zsh)
# or copy to a directory in your $fpath.

_aptunnel() {
  local config="${configPath}"
  local -a db_aliases env_aliases

  if [[ -f "$config" ]]; then
    db_aliases=( \${(f)"$(awk '/alias:/{print $2}' "$config" 2>/dev/null | sort -u)"} )
    env_aliases=( \${(f)"$(awk '/^  alias:/{print $2}' "$config" 2>/dev/null | sort -u)"} )
  fi

  local -a cmds
  cmds=(
    'init:Setup wizard'
    'login:Login to Aptible or show token status'
    'status:Show all tunnel statuses'
    'config:View or modify configuration'
    'completions:Print shell completion script'
    'all:Open all tunnels for an environment'
    'help:Show help'
  )

  # Add db aliases as commands
  for alias in $db_aliases; do
    cmds+=("$alias:Open tunnel to $alias")
  done

  _arguments -C \\
    '(-h --help)'{-h,--help}'[Show help]' \\
    '(-v --version)'{-v,--version}'[Show version]' \\
    '--close[Close tunnel(s)]' \\
    '--force[Kill existing process on port conflict]' \\
    '--port=[Override port]:port:' \\
    "--env=[Target environment]:env:($env_aliases)" \\
    '1: :->cmd' \\
    '*:: :->args'

  case $state in
    cmd)
      _describe 'command' cmds
      ;;
  esac
}

_aptunnel "$@"
`;
}

/**
 * Generate fish completion script.
 */
export function fishScript() {
  const configPath = getConfigPath();
  return `# aptunnel fish completion
# Copy to ~/.config/fish/completions/aptunnel.fish
# or run: aptunnel completions install

set -l config_path "${configPath}"

# Helper: extract aliases from config
function __aptunnel_db_aliases
  if test -f $config_path
    awk '/alias:/{print $2}' $config_path 2>/dev/null | sort -u
  end
end

function __aptunnel_env_aliases
  if test -f $config_path
    awk '/^  alias:/{print $2}' $config_path 2>/dev/null | sort -u
  end
end

# Main commands
complete -c aptunnel -f -n '__fish_use_subcommand' -a 'init'        -d 'Setup wizard'
complete -c aptunnel -f -n '__fish_use_subcommand' -a 'login'       -d 'Login to Aptible'
complete -c aptunnel -f -n '__fish_use_subcommand' -a 'status'      -d 'Show tunnel statuses'
complete -c aptunnel -f -n '__fish_use_subcommand' -a 'config'      -d 'View/modify configuration'
complete -c aptunnel -f -n '__fish_use_subcommand' -a 'completions' -d 'Print completion script'
complete -c aptunnel -f -n '__fish_use_subcommand' -a 'all'         -d 'Open all tunnels'

# Dynamic db aliases
complete -c aptunnel -f -n '__fish_use_subcommand' -a '(__aptunnel_db_aliases)'

# Flags
complete -c aptunnel -l close   -d 'Close tunnel(s)'
complete -c aptunnel -l force   -d 'Kill existing process on port conflict'
complete -c aptunnel -l port    -d 'Override port' -r
complete -c aptunnel -l env     -d 'Target environment' -r -a '(__aptunnel_env_aliases)'
complete -c aptunnel -s h -l help    -d 'Show help'
complete -c aptunnel -s v -l version -d 'Show version'
`;
}

/**
 * Auto-detect shell and install the completion script.
 */
export function installCompletions() {
  const shell = detectShell();

  if (shell === 'bash') {
    const rcFile = join(homedir(), '.bashrc');
    const line   = '\n# aptunnel completions\nsource <(aptunnel completions bash)\n';
    if (existsSync(rcFile) && readFileSync(rcFile, 'utf8').includes('aptunnel completions')) {
      logger.info('Bash completions already installed in ~/.bashrc.');
      return;
    }
    writeFileSync(rcFile, readFileSync(rcFile, 'utf8') + line);
    logger.success('Bash completions installed. Restart your shell or run: source ~/.bashrc');
    return;
  }

  if (shell === 'zsh') {
    const rcFile = join(homedir(), '.zshrc');
    const line   = '\n# aptunnel completions\nsource <(aptunnel completions zsh)\n';
    if (existsSync(rcFile) && readFileSync(rcFile, 'utf8').includes('aptunnel completions')) {
      logger.info('Zsh completions already installed in ~/.zshrc.');
      return;
    }
    writeFileSync(rcFile, readFileSync(rcFile, 'utf8') + line);
    logger.success('Zsh completions installed. Restart your shell or run: source ~/.zshrc');
    return;
  }

  if (shell === 'fish') {
    const fishDir  = join(homedir(), '.config', 'fish', 'completions');
    const fishFile = join(fishDir, 'aptunnel.fish');
    mkdirSync(fishDir, { recursive: true });
    writeFileSync(fishFile, fishScript());
    logger.success(`Fish completions installed to ${fishFile}. Restart fish to activate.`);
    return;
  }

  logger.warn(`Could not detect shell (SHELL=${process.env.SHELL ?? 'unset'}). Use one of:`);
  logger.plain('  aptunnel completions bash   — bash');
  logger.plain('  aptunnel completions zsh    — zsh');
  logger.plain('  aptunnel completions fish   — fish');
}

function detectShell() {
  const shell = process.env.SHELL ?? '';
  if (shell.includes('zsh'))  return 'zsh';
  if (shell.includes('bash')) return 'bash';
  if (shell.includes('fish')) return 'fish';
  return null;
}
