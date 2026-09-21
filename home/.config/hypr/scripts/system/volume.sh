#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

action="${1:-}"

if command -v wpctl >/dev/null 2>&1; then
  case "$action" in
    --inc) wpctl set-volume -l 1.0 @DEFAULT_AUDIO_SINK@ 5%+ ;;
    --dec) wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%- ;;
    --toggle) wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle ;;
    *) echo "Usage: $0 --inc|--dec|--toggle" >&2; exit 2 ;;
  esac

  sleep 0.05
  if command -v notify-send >/dev/null 2>&1; then
    status="$(wpctl get-volume @DEFAULT_AUDIO_SINK@ 2>/dev/null || true)"
    if grep -q '\[MUTED\]' <<<"$status"; then
      progress=0
      body="Muted"
    else
      value="$(awk '{print $2}' <<<"$status")"
      progress="$(awk -v value="${value:-0}" 'BEGIN { printf "%d", value * 100 + 0.5 }')"
      body="${progress}%"
    fi
    notify-send -a System -t 1350 \
      -h string:x-canonical-private-synchronous:hyprl4zy-volume \
      -h int:value:"$progress" "Volume" "$body" 2>/dev/null || true
  fi
  exit 0
fi

# Compatibility fallback for systems intentionally using PulseAudio.
if command -v pactl >/dev/null 2>&1; then
  case "$action" in
    --inc) pactl set-sink-volume @DEFAULT_SINK@ +5% ;;
    --dec) pactl set-sink-volume @DEFAULT_SINK@ -5% ;;
    --toggle) pactl set-sink-mute @DEFAULT_SINK@ toggle ;;
    *) echo "Usage: $0 --inc|--dec|--toggle" >&2; exit 2 ;;
  esac
  exit 0
fi

exit 0
