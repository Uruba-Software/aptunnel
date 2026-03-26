#compdef aptunnel
# aptunnel zsh completion
# Add to ~/.zshrc:
#   source <(aptunnel completions zsh)
# or copy to a directory in your $fpath.

_aptunnel() {
  local config="/home/bayramu/.aptunnel/config.yaml"
  local -a db_aliases env_aliases

  if [[ -f "$config" ]]; then
    db_aliases=( ${(f)"$(awk '/alias:/{print $2}' "$config" 2>/dev/null | sort -u)"} )
    env_aliases=( ${(f)"$(awk '/^  alias:/{print $2}' "$config" 2>/dev/null | sort -u)"} )
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

  _arguments -C \
    '(-h --help)'{-h,--help}'[Show help]' \
    '(-v --version)'{-v,--version}'[Show version]' \
    '--close[Close tunnel(s)]' \
    '--force[Kill existing process on port conflict]' \
    '--port=[Override port]:port:' \
    "--env=[Target environment]:env:($env_aliases)" \
    '1: :->cmd' \
    '*:: :->args'

  case $state in
    cmd)
      _describe 'command' cmds
      ;;
  esac
}

_aptunnel "$@"
