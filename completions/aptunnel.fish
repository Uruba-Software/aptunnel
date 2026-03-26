# aptunnel fish completion
# Copy to ~/.config/fish/completions/aptunnel.fish
# or run: aptunnel completions install

set -l config_path "/home/bayramu/.aptunnel/config.yaml"

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
