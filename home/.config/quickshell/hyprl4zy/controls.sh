#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

case "${1:-help}" in
    launcher|wallpaper|notifications|power|help|settings|audio|connectivity|system|battery)
        exec "$SCRIPT_DIR/launcher.sh" --module "$1"
        ;;
    close|toggleBar)
        exec "$SCRIPT_DIR/launcher.sh" --action "$1"
        ;;
    -h|--help)
        exec "$SCRIPT_DIR/launcher.sh" --help
        ;;
    *)
        echo "Unknown hyprl4zy control: ${1:-}" >&2
        exit 2
        ;;
esac
