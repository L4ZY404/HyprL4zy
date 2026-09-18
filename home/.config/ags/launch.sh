#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/scripts/runtime.sh"
command -v ags >/dev/null || { echo "AGS is not installed." >&2; exit 1; }
exec 9>"$AGS_STATE/launch-v2.lock"
flock -w 15 9 || { echo "Another AGS launch is in progress." >&2; exit 1; }
prepare_palette
# Reapply only Dunst geometry on every shell start so notification sizing
# stays in sync with the current Bar Scale without regenerating the palette.
if [ -x "$AGS_DIR/scripts/theme/wallpaper_manager.sh" ]; then
  "$AGS_DIR/scripts/theme/wallpaper_manager.sh" --dunst-scale >/dev/null 2>&1 || true
fi
case "${1:-restart}" in
  --if-needed)
    if timeout 2 ags request ping >/dev/null 2>&1; then exit 0; fi
    ;;
  restart|--restart)
    timeout 5 ags quit >/dev/null 2>&1 || true
    # Wait for the old instance to release DBus before starting the new one.
    for ((attempt=0; attempt<30; attempt++)); do
      if ! timeout 1 ags request ping >/dev/null 2>&1; then break; fi
      sleep 0.1
    done
    if timeout 2 ags request ping >/dev/null 2>&1; then
      echo "Previous AGS instance did not stop; no second instance was started." >&2
      exit 1
    fi
    ;;
  *) echo "Usage: $0 [--restart|--if-needed]" >&2; exit 2 ;;
esac
# Clean up only the previous version's dedicated Cava command, after AGS stopped.
pkill -u "$(id -u)" -f '(^|/)cava -p /tmp/ags_music_cava_config$' >/dev/null 2>&1 || true
cd "$AGS_DIR"
nohup ags run >"$AGS_STATE/ags.log" 2>&1 9>&- </dev/null &
for ((attempt=0; attempt<50; attempt++)); do
  if timeout 1 ags request ping >/dev/null 2>&1; then
    echo "AGS started. Log: $AGS_STATE/ags.log"
    exit 0
  fi
  sleep 0.2
done
echo "AGS did not become ready. Inspect $AGS_STATE/ags.log" >&2
exit 1
