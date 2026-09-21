#!/usr/bin/env bash
set -euo pipefail

state_root="${XDG_STATE_HOME:-$HOME/.local/state}/hyprl4zy"
config_root="${XDG_CONFIG_HOME:-$HOME/.config}"
mkdir -p "$state_root"

command -v swayidle >/dev/null 2>&1 || exit 0
pgrep -u "$(id -u)" -x swayidle >/dev/null 2>&1 && exit 0

lock_script="$config_root/hypr/scripts/lock.sh"
[[ -x "$lock_script" ]] || exit 0

nohup swayidle -w \
  timeout 1800 "$lock_script" \
  timeout 1830 'hyprctl dispatch dpms off' \
  resume 'hyprctl dispatch dpms on' \
  before-sleep "$lock_script" \
  >"$state_root/idle.log" 2>&1 </dev/null &
