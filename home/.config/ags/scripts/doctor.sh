#!/usr/bin/env bash
set -u
missing=0
printf 'HyprLazy - dependency check\n'
for binary in ags gjs sass bash python3 flock timeout; do
  if command -v "$binary" >/dev/null; then printf 'OK       %s\n' "$binary"
  else printf 'REQUIRED %s\n' "$binary"; missing=1; fi
done
if command -v ags >/dev/null; then
  version="$(ags --version 2>&1)"
  printf 'Runtime: %s\n' "$version"
  if [[ ! "$version" =~ (^|[^0-9])[23]\.[0-9] ]]; then
    printf 'REQUIRED an AGS 2.x/3.x runtime supporting ags/gtk4 imports.\n'
    missing=1
  fi
fi
if command -v gjs >/dev/null; then
  if ! gjs -c 'imports.gi.versions.Gtk="4.0"; imports.gi.versions.Astal="4.0"; const Gtk=imports.gi.Gtk; const Astal=imports.gi.Astal;' 2>/dev/null; then
    printf 'REQUIRED GTK4 / Astal 4.0 introspection libraries\n'; missing=1
  fi
fi
for binary in hyprctl socat pactl playerctl cava brightnessctl bluetoothctl rfkill \
              nmcli nm-connection-editor iwctl iwgtk swayidle swaylock hyprlock dunst swaync mako \
              grim slurp wl-copy wl-paste cliphist xdg-open gtk-launch pavucontrol \
              blueman-manager wdisplays nwg-displays nwg-look qt6ct gnome-disks \
              awww swww wal ffmpeg mpvpaper magick curl jq checkupdates; do
  if command -v "$binary" >/dev/null; then printf 'OK       %s\n' "$binary"
  else printf 'OPTIONAL %s\n' "$binary"; fi
done
printf '\nSession: %s\n' "${XDG_SESSION_TYPE:-unknown}"
if [[ -d /sys/class/backlight ]]; then
  printf 'Backlights: '; find /sys/class/backlight -mindepth 1 -maxdepth 1 -printf '%f '; printf '\n'
fi
if command -v hyprctl >/dev/null && [[ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]]; then
  printf '\nHyprland config errors:\n'; hyprctl configerrors 2>/dev/null || true
fi
printf '\nOptional missing tools disable only their corresponding features.\n'
exit "$missing"
