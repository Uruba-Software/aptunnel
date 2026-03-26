#!/usr/bin/env bash
# aptunnel bash completion
# Source this file or add to ~/.bashrc:
#   source <(aptunnel completions bash)

_aptunnel_completions() {
  local cur prev
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"

  # Get aliases from config at runtime
  local config="/home/bayramu/.aptunnel/config.yaml"
  local db_aliases=""
  local env_aliases=""
  if [ -f "$config" ]; then
    db_aliases=$(awk '/^  [a-z]/{if(alias) print alias} /alias:/{alias=$2}' "$config" 2>/dev/null | sort -u)
    env_aliases=$(awk '/^[a-z].*:$/{env=substr($0,1,length($0)-1)} /  alias:/{print $2}' "$config" 2>/dev/null | sort -u)
  fi

  local all_cmds="init login status config completions help all $db_aliases"

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
    COMPREPLY=( $(compgen -W "--close --force --help --version --port= --env=" -- "$cur") )
    return 0
  fi

  COMPREPLY=( $(compgen -W "$all_cmds" -- "$cur") )
  return 0
}

complete -F _aptunnel_completions aptunnel
