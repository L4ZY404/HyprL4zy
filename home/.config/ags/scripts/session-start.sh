#!/usr/bin/env bash
set -u
AGS_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/ags"
AGS_STATE="${XDG_STATE_HOME:-$HOME/.local/state}/ags"
mkdir -p "$AGS_STATE"
exec 9>"$AGS_STATE/session-start.lock"
flock -n 9 || exit 0
command -v dbus-update-activation-environment >/dev/null && \
  dbus-update-activation-environment --systemd WAYLAND_DISPLAY XDG_CURRENT_DESKTOP HYPRLAND_INSTANCE_SIGNATURE >/dev/null 2>&1 || true
# Respect an existing notification daemon.
if ! pgrep -u "$(id -u)" -x 'dunst|swaync|mako' >/dev/null; then
  if command -v dunst >/dev/null; then dunst 9>&- >/dev/null 2>&1 & fi
fi
bash "$AGS_DIR/scripts/idle/swayidle.sh" 9>&-
# Clipboard capture has its own lifetime lock; it is optional.
if command -v wl-paste >/dev/null && command -v cliphist >/dev/null; then
  (flock -n 8 || exit 0
   exec wl-paste --watch cliphist store
  ) 8>"$AGS_STATE/clipboard.lock" 9>&- >/dev/null 2>&1 &
fi
# Restore before starting AGS so it compiles the final palette only once.
AGS_NO_RESTART=1 AGS_RESTORE_QUIET=1 bash "$AGS_DIR/scripts/theme/wallpaper_manager.sh" 9>&- >"$AGS_STATE/wallpaper.log" 2>&1 || true
bash "$AGS_DIR/launch.sh" --if-needed 9>&-
