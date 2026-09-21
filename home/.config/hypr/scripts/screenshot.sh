#!/usr/bin/env bash

# ==============================================================================
# WAYLAND SCREENSHOT SCRIPT (Grim + Slurp + wl-copy)
# ==============================================================================

set -uo pipefail

APP_NAME="hyprl4zy Screenshot"
REPLACE_ID="699"
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S-%N)"
DIR="$HOME/Pictures/Screenshots"
FILENAME="$DIR/Screenshot_${TIMESTAMP}.png"
ICON_PATH=""

mkdir -p "$DIR"

notify() {
  local urgency="$1"
  local image="$2"
  local title="$3"
  local body="${4:-}"
  local timeout="${5:-5000}"

  # Prefer the Freedesktop client directly. When a screenshot is available,
  # advertise it as notification image data instead of abusing app_icon. This
  # lets the native Quickshell daemon render a real preview card.
  if command -v notify-send >/dev/null 2>&1; then
    if [ -n "$image" ] && [ -f "$image" ]; then
      notify-send \
        -a "$APP_NAME" \
        -u "$urgency" \
        -t "$timeout" \
        -i camera-photo \
        -h "string:image-path:file://$image" \
        -h "string:x-hyprl4zy-preview:true" \
        "$title" "$body"
    else
      notify-send -a "$APP_NAME" -u "$urgency" -t "$timeout" -i camera-photo "$title" "$body"
    fi
    return
  fi

  # Compatibility fallback for a session where the native QS daemon is not
  # available yet. The normal hyprl4zy session does not start Dunst.
  if command -v dunstify >/dev/null 2>&1; then
    if [ -n "$image" ] && [ -f "$image" ]; then
      dunstify -a "$APP_NAME" --replace="$REPLACE_ID" -u "$urgency" -t "$timeout" -i "$image" "$title" "$body"
    else
      dunstify -a "$APP_NAME" --replace="$REPLACE_ID" -u "$urgency" -t "$timeout" "$title" "$body"
    fi
  fi
}

require_dependencies() {
  local missing=()

  for command in grim slurp wl-copy; do
    if ! command -v "$command" >/dev/null 2>&1; then
      missing+=("$command")
    fi
  done

  if [ "${#missing[@]}" -gt 0 ]; then
    notify critical "$ICON_PATH" "Screenshot Error" "Missing: ${missing[*]}" 4500
    exit 1
  fi
}

countdown() {
  local seconds="$1"

  for sec in $(seq "$seconds" -1 1); do
    notify normal "$ICON_PATH" "Capturing in: $sec" "" 1000
    sleep 1
  done
}

take_screenshot() {
  local geometry="${1:-}"
  local message="$2"

  if [ -z "$geometry" ]; then
    grim - | tee "$FILENAME" | wl-copy --type image/png
  else
    grim -g "$geometry" - | tee "$FILENAME" | wl-copy --type image/png
  fi

  if [ -s "$FILENAME" ]; then
    notify normal "$FILENAME" "Screenshot Captured" "$message" 3500
    printf '%s\n' "$FILENAME"
    exit 0
  fi

  rm -f "$FILENAME"
  notify critical "$ICON_PATH" "Screenshot Error" "Failed to save screenshot." 4500
  exit 1
}

select_area() {
  slurp 2>/dev/null || true
}

require_dependencies

case "${1:---now}" in
  --now|--screen|--full)
    take_screenshot "" "Full screen saved and copied."
    ;;
  --sel|--area|--selection)
    selection="$(select_area)"

    if [ -z "$selection" ]; then
      exit 0
    fi

    take_screenshot "$selection" "Area selection saved and copied."
    ;;
  --in5)
    countdown 5
    take_screenshot "" "Delayed screenshot saved and copied."
    ;;
  --in10)
    countdown 10
    take_screenshot "" "Delayed screenshot saved and copied."
    ;;
  --dir|--open-dir)
    xdg-open "$DIR" >/dev/null 2>&1 &
    ;;
  *)
    take_screenshot "" "Full screen saved and copied."
    ;;
esac
