#!/usr/bin/env bash
# HyprLazy screenshot helper (Grim + Slurp + wl-copy)

set -uo pipefail

APP_NAME="HyprLazy"
REPLACE_ID="699"
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S-%N)"
DIR="$HOME/Pictures/Screenshots"
FILENAME="$DIR/Screenshot_${TIMESTAMP}.png"
DEFAULT_ICON="camera-photo-symbolic"

mkdir -p "$DIR"

notify() {
  local urgency="$1"
  local title="$2"
  local body="${3:-}"
  local timeout="${4:-2500}"
  local icon="${5:-$DEFAULT_ICON}"

  if command -v dunstify >/dev/null 2>&1; then
    dunstify -a "$APP_NAME" --replace="$REPLACE_ID" -u "$urgency" -t "$timeout" -i "$icon" "$title" "$body"
    return
  fi

  if command -v notify-send >/dev/null 2>&1; then
    notify-send -a "$APP_NAME" -u "$urgency" -t "$timeout" -i "$icon" "$title" "$body"
  fi
}

require_dependencies() {
  local missing=()

  for command in grim slurp wl-copy; do
    command -v "$command" >/dev/null 2>&1 || missing+=("$command")
  done

  if (( ${#missing[@]} > 0 )); then
    notify critical "Screenshot Error" "Missing: ${missing[*]}" 4500
    exit 1
  fi
}

countdown() {
  local seconds="$1"

  for sec in $(seq "$seconds" -1 1); do
    notify normal "Capturing in: $sec" "" 1000
    sleep 1
  done
}

take_screenshot() {
  local geometry="${1:-}"
  local message="$2"

  if [[ -z "$geometry" ]]; then
    grim - | tee "$FILENAME" | wl-copy --type image/png
  else
    grim -g "$geometry" - | tee "$FILENAME" | wl-copy --type image/png
  fi

  if [[ -s "$FILENAME" ]]; then
    notify normal "Screenshot Captured" "$message" 3500 "$FILENAME"
    printf '%s\n' "$FILENAME"
    exit 0
  fi

  rm -f "$FILENAME"
  notify critical "Screenshot Error" "Failed to save screenshot." 4500
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
    [[ -n "$selection" ]] || exit 0
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
