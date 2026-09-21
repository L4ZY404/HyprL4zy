#!/usr/bin/env bash
set -euo pipefail

STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
ROUTER_DIR="$STATE_HOME/hyprl4zy"
ACTION=""
MODE="send"

usage() {
    cat <<'USAGE'
Usage:
  launcher.sh --module <name>
  launcher.sh --action <name>
  launcher.sh <name>
  launcher.sh --listen

Modules:
  launcher, wallpaper, notifications, power, help, settings,
  audio, connectivity, system, battery

Actions:
  close, toggleBar
USAGE
}

listen() {
    local script_dir
    script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    exec python3 "$script_dir/scripts/command-router.py"
}

send_action() {
    local action="$1"
    local tmp

    mkdir -p "$ROUTER_DIR"
    tmp="$(mktemp "$ROUTER_DIR/.router-write.XXXXXX")"
    chmod 600 "$tmp"
    printf '%s\n' "$action" > "$tmp"

    # Publish a unique completed file so rapid shortcuts cannot overwrite each other.
    mv -f "$tmp" "$tmp.command"
}

while (($#)); do
    case "$1" in
        -m|--module)
            [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; }
            ACTION="$2"
            shift 2
            ;;
        -a|--action)
            [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; }
            ACTION="$2"
            shift 2
            ;;
        --listen)
            MODE="listen"
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        --*)
            echo "Unknown argument: $1" >&2
            usage >&2
            exit 2
            ;;
        *)
            [[ -z "$ACTION" ]] || { echo "Only one module/action may be requested." >&2; exit 2; }
            ACTION="$1"
            shift
            ;;
    esac
done

if [[ "$MODE" == "listen" ]]; then
    listen
    exit 0
fi

[[ -n "$ACTION" ]] || { usage >&2; exit 2; }

case "$ACTION" in
    launcher|wallpaper|notifications|power|help|settings|audio|connectivity|system|battery|close|toggleBar) ;;
    *)
        echo "Unknown hyprl4zy module/action: $ACTION" >&2
        exit 2
        ;;
esac

send_action "$ACTION"
