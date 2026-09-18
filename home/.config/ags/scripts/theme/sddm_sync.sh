#!/usr/bin/env bash

# Synchronize Dynamic Bubble with the current HyprLazy Pywal palette.

set -euo pipefail

THEME_NAME="Dynamic_bubble"
THEME_DIR="/usr/share/sddm/themes/$THEME_NAME"
CACHE_DIR="/var/cache/sddm-theme"
THEME_CONFIG="$CACHE_DIR/theme.conf"
WAL_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/wal"

if [[ ! -f "$THEME_DIR/Main.qml" ]]; then
  exit 0
fi

if [[ ! -d "$CACHE_DIR" || ! -w "$CACHE_DIR" ]]; then
  printf 'SDDM sync skipped: %s is not writable.\n' "$CACHE_DIR" >&2
  printf 'Re-run the HyprLazy installer with the optional SDDM integration enabled.\n' >&2
  exit 0
fi

if [[ ! -f "$WAL_CACHE/colors" || ! -f "$WAL_CACHE/wal" ]]; then
  exit 0
fi

wallpaper_path="$(<"$WAL_CACHE/wal")"
[[ -f "$wallpaper_path" ]] || exit 0

cp -f -- "$wallpaper_path" "$CACHE_DIR/current_wallpaper.jpg"
chmod 0644 "$CACHE_DIR/current_wallpaper.jpg"

background_color="#$(sed -n '1p' "$WAL_CACHE/colors" | tr -d '#')"
accent_color="#$(sed -n '12p' "$WAL_CACHE/colors" | tr -d '#')"

temporary="$(mktemp "$CACHE_DIR/.theme.conf.XXXXXX")"
trap 'rm -f "$temporary"' EXIT
cat > "$temporary" <<EOF_CONFIG
[General]
mode=pro
background=$CACHE_DIR/current_wallpaper.jpg
background_color=$background_color
color11=$accent_color
username=
EOF_CONFIG
chmod 0644 "$temporary"
mv -f -- "$temporary" "$THEME_CONFIG"
trap - EXIT

printf 'Dynamic Bubble synchronized with the current Pywal palette.\n'
