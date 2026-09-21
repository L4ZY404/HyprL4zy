#!/usr/bin/env bash
set -euo pipefail
# Keep command output stable across desktop locales.
export LC_ALL=C
command -v brightnessctl >/dev/null || exit 0
case "${1:-}" in
 up) brightnessctl --class=backlight set 5%+ -q ;;
 down) brightnessctl --class=backlight --min-value=1 set 5%- -q ;;
 *) exit 2 ;;
esac
IFS=, read -r device kind current percent maximum < <(brightnessctl --class=backlight -m)
command -v notify-send >/dev/null && notify-send -a System -t 1350 -h string:x-canonical-private-synchronous:hyprl4zy-brightness -h "int:value:${percent%\%}" 'Brightness' "$percent" || true
