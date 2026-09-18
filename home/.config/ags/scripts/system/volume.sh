#!/usr/bin/env bash
set -euo pipefail
# Keep command output stable across desktop locales.
export LC_ALL=C
command -v pactl >/dev/null || exit 0

action="${1:-}"
case "$action" in
  --inc) pactl set-sink-volume @DEFAULT_SINK@ +5% ;;
  --dec) pactl set-sink-volume @DEFAULT_SINK@ -5% ;;
  --toggle) pactl set-sink-mute @DEFAULT_SINK@ toggle ;;
  *) echo "Usage: $0 --inc|--dec|--toggle" >&2; exit 2 ;;
esac

sleep 0.05

if command -v notify-send >/dev/null 2>&1; then
  sink_volume=$(pactl get-sink-volume @DEFAULT_SINK@ 2>/dev/null | head -n1)
  sink_mute=$(pactl get-sink-mute @DEFAULT_SINK@ 2>/dev/null)
  progress=$(printf '%s' "$sink_volume" | grep -o '[0-9]\+%' | head -n1 | tr -d '%')
  progress=${progress:-0}

  if printf '%s' "$sink_mute" | grep -qi yes; then
    icon="audio-volume-muted-symbolic"
    body="Muted"
    progress=0
  elif [ "$progress" -lt 35 ]; then
    icon="audio-volume-low-symbolic"
    body="${progress}%"
  elif [ "$progress" -lt 70 ]; then
    icon="audio-volume-medium-symbolic"
    body="${progress}%"
  else
    icon="audio-volume-high-symbolic"
    body="${progress}%"
  fi

  # The progress bar already communicates volume clearly; keep the OSD compact
  # by omitting the redundant speaker icon.
  notify-send -a HyprLazy -h string:x-canonical-private-synchronous:ags-volume -h int:value:"$progress" "Volume" "$body" 2>/dev/null || true
fi
