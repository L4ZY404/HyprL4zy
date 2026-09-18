#!/usr/bin/env bash
set -euo pipefail
config_root="${XDG_CONFIG_HOME:-$HOME/.config}"
state_root="${XDG_STATE_HOME:-$HOME/.local/state}/ags"
mkdir -p "$state_root"
exec 9>"$state_root/idle-start.lock"
flock -w 3 9 || exit 0
command -v swayidle >/dev/null || exit 0
pgrep -u "$(id -u)" -x swayidle >/dev/null && exit 0
if ! command -v hyprlock >/dev/null && ! command -v swaylock >/dev/null; then
  echo "Idle locking disabled: install hyprlock or swaylock." >&2
  exit 0
fi
lock_seconds="${AGS_LOCK_SECONDS:-}"
screen_off_seconds="${AGS_SCREEN_OFF_SECONDS:-}"
if [[ -z "$lock_seconds" || -z "$screen_off_seconds" ]]; then
  mapfile -t idle_values < <(python3 - "$config_root/ags/local.json" <<'PY'
import json
import sys
from pathlib import Path

lock_default = 1800
screen_default = 1830
try:
    data = json.loads(Path(sys.argv[1]).read_text())
except Exception:
    data = {}
session = data.get("session") if isinstance(data, dict) else {}
if not isinstance(session, dict):
    session = {}

def number(value, fallback):
    try:
        value = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(60, min(86400, value))

lock_seconds = number(session.get("lockSeconds"), lock_default)
screen_seconds = max(lock_seconds + 5, number(session.get("screenOffSeconds"), screen_default))
print(lock_seconds)
print(screen_seconds)
PY
  )
  lock_seconds="${lock_seconds:-${idle_values[0]:-1800}}"
  screen_off_seconds="${screen_off_seconds:-${idle_values[1]:-1830}}"
fi
printf -v lock_cmd '%q ' bash "$config_root/ags/scripts/lock.sh"
nohup swayidle -w \
  timeout "$lock_seconds" "$lock_cmd" \
  timeout "$screen_off_seconds" 'hyprctl dispatch dpms off' \
  resume 'hyprctl dispatch dpms on' \
  before-sleep "$lock_cmd" >"$state_root/idle.log" 2>&1 9>&- </dev/null &
