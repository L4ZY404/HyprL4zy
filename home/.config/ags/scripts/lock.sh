#!/usr/bin/env bash
set -euo pipefail

config_root="${XDG_CONFIG_HOME:-$HOME/.config}"
cache_root="${XDG_CACHE_HOME:-$HOME/.cache}"
swaylock_config="$config_root/swaylock/config"
wallpaper_cache="$cache_root/current_wallpaper.jpg"
lock_cache_dir="$cache_root/hyprlazy"
lock_wallpaper="$lock_cache_dir/lock-wallpaper.jpg"
wal_colors="$cache_root/wal/colors"
lock_dim_percent="${HYPRLAZY_LOCK_DIM_PERCENT:-42}"
lock_fade_seconds="${HYPRLAZY_LOCK_FADE_SECONDS:-0.85}"
lock_blur_strength="${HYPRLAZY_LOCK_BLUR_STRENGTH:-3x2}"
lock_vignette="${HYPRLAZY_LOCK_VIGNETTE:-0.12:0.52}"

normalize_color() {
  local value="${1:-}"
  value="${value#\#}"

  if [[ "$value" =~ ^[0-9A-Fa-f]{6}$ ]]; then
    printf '%s' "${value,,}"
    return 0
  fi

  return 1
}

clamp() {
  local value="$1"
  local minimum="$2"
  local maximum="$3"

  if (( value < minimum )); then
    printf '%s' "$minimum"
  elif (( value > maximum )); then
    printf '%s' "$maximum"
  else
    printf '%s' "$value"
  fi
}

color_distance() {
  local first="$1"
  local second="$2"
  local r1=$((16#${first:0:2}))
  local g1=$((16#${first:2:2}))
  local b1=$((16#${first:4:2}))
  local r2=$((16#${second:0:2}))
  local g2=$((16#${second:2:2}))
  local b2=$((16#${second:4:2}))
  local dr=$((r1 - r2))
  local dg=$((g1 - g2))
  local db=$((b1 - b2))

  printf '%s' $((dr * dr + dg * dg + db * db))
}

pick_accent_neighbors() {
  local accent="$1"
  shift

  local first=""
  local second=""
  local first_distance=999999999
  local second_distance=999999999
  local candidate distance

  for candidate in "$@"; do
    candidate="$(normalize_color "$candidate" || true)"
    [[ -n "$candidate" && "$candidate" != "$accent" ]] || continue

    distance="$(color_distance "$accent" "$candidate")"

    if (( distance < first_distance )); then
      second="$first"
      second_distance="$first_distance"
      first="$candidate"
      first_distance="$distance"
    elif [[ "$candidate" != "$first" ]] && (( distance < second_distance )); then
      second="$candidate"
      second_distance="$distance"
    fi
  done

  printf '%s %s\n' "${first:-$accent}" "${second:-${first:-$accent}}"
}

get_indicator_metrics() {
  local radius=190
  local thickness=22
  local font_size=40
  local logical_height=""

  # Scale from the smallest active monitor so mixed-monitor setups remain balanced.
  if command -v hyprctl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    logical_height="$(
      hyprctl monitors -j 2>/dev/null \
        | jq -r '[.[] | select((.disabled // false) == false) | (.height / (.scale // 1))] | if length > 0 then min | floor else empty end' \
        2>/dev/null \
        || true
    )"
  fi

  if [[ "$logical_height" =~ ^[0-9]+$ ]] && (( logical_height > 0 )); then
    radius="$(clamp $((logical_height * 19 / 100)) 170 225)"
    thickness="$(clamp $((radius / 8)) 20 28)"
    font_size="$(clamp $((radius / 5)) 34 46)"
  fi

  printf '%s %s %s\n' "$radius" "$thickness" "$font_size"
}

swaylock_supports_effects() {
  swaylock --help 2>&1 | grep -q -- '--fade-in'
}

prepare_lock_wallpaper() {
  [[ -s "$wallpaper_cache" ]] || return 1

  mkdir -p "$lock_cache_dir"

  if [[ ! -s "$lock_wallpaper" || "$wallpaper_cache" -nt "$lock_wallpaper" ]]; then
    rm -f "$lock_wallpaper"

    # Generate a cached darkened copy because upstream swaylock has no image dim overlay.
    if command -v magick >/dev/null 2>&1; then
      if ! magick "$wallpaper_cache" \
        -auto-orient \
        -fill black \
        -colorize "${lock_dim_percent}%" \
        -quality 90 \
        "$lock_wallpaper" >/dev/null 2>&1; then
        rm -f "$lock_wallpaper"
      fi
    elif command -v convert >/dev/null 2>&1; then
      if ! convert "$wallpaper_cache" \
        -auto-orient \
        -fill black \
        -colorize "${lock_dim_percent}%" \
        -quality 90 \
        "$lock_wallpaper" >/dev/null 2>&1; then
        rm -f "$lock_wallpaper"
      fi
    fi

    if [[ ! -s "$lock_wallpaper" ]]; then
      cp -f "$wallpaper_cache" "$lock_wallpaper"
    fi
  fi

  [[ -s "$lock_wallpaper" ]]
}

if command -v swaylock >/dev/null 2>&1; then
  read -r indicator_radius indicator_thickness indicator_font_size < <(get_indicator_metrics)

  args=(
    --indicator-radius "$indicator_radius"
    --indicator-thickness "$indicator_thickness"
    --font-size "$indicator_font_size"
    --show-keyboard-layout
  )

  # swaylock-effects can keep useful content visible in the center of the indicator.
  # Upstream swaylock only shows status text during transient authentication states.
  if swaylock_supports_effects; then
    args+=(
      --indicator
      --clock
      --timestr "%H:%M"
      --datestr "LOCKED"
      --text-ver "VERIFYING"
      --text-wrong "TRY AGAIN"
      --text-clear "CLEARED"
      --text-caps-lock "CAPS LOCK"
      # Animate the already-secure lock surface instead of delaying the lock command.
      --fade-in "$lock_fade_seconds"
      --effect-blur "$lock_blur_strength"
      --effect-vignette "$lock_vignette"
    )
  fi

  if [[ -f "$swaylock_config" ]]; then
    args+=(--config "$swaylock_config")
  fi

  if prepare_lock_wallpaper; then
    args+=(--image "$lock_wallpaper" --scaling fill)
  fi

  if [[ -r "$wal_colors" ]]; then
    mapfile -t colors < "$wal_colors"

    background="$(normalize_color "${colors[0]:-}" || true)"
    wrong="$(normalize_color "${colors[9]:-${colors[1]:-}}" || true)"
    foreground="$(normalize_color "${colors[15]:-${colors[7]:-}}" || true)"
    accent="$(normalize_color "${colors[11]:-}" || true)"

    if [[ -n "$background" && -n "$foreground" && -n "$accent" ]]; then
      # Select the two closest distinct bright Pywal colors to color11. These are
      # used for typing and verification so feedback stays inside the active palette.
      read -r typing_accent verify_accent < <(
        pick_accent_neighbors "$accent" \
          "${colors[8]:-}" "${colors[10]:-}" "${colors[12]:-}" \
          "${colors[13]:-}" "${colors[14]:-}" "${colors[15]:-}"
      )

      args+=(
        --color "$background"
        --inside-color "${background}e8"
        --inside-clear-color "${background}e8"
        --inside-ver-color "${background}e8"
        --inside-wrong-color "${background}e8"
        --inside-caps-lock-color "${background}e8"

        # Keep the idle ring readable but dim enough for typing segments to pop.
        --ring-color "${accent}77"
        --ring-clear-color "${typing_accent}ff"
        --ring-ver-color "${verify_accent}ff"
        --ring-caps-lock-color "${typing_accent}ff"

        # Swaylock draws one highlight segment for each key press.
        --key-hl-color "${typing_accent}ff"
        --bs-hl-color "${verify_accent}ff"
        --caps-lock-key-hl-color "${verify_accent}ff"
        --caps-lock-bs-hl-color "${typing_accent}ff"

        # Status text in the center must remain fully opaque and high contrast.
        --text-color "${foreground}ff"
        --text-clear-color "${typing_accent}ff"
        --text-ver-color "${verify_accent}ff"
        --text-caps-lock-color "${typing_accent}ff"

        # The keyboard layout remains readable while typing, even with upstream swaylock.
        --layout-bg-color "${background}00"
        --layout-border-color "${background}00"
        --layout-text-color "${foreground}ff"

        --line-color "${accent}66"
        --line-clear-color "${typing_accent}cc"
        --line-ver-color "${verify_accent}cc"
        --line-wrong-color "${wrong:-$accent}cc"
        --line-caps-lock-color "${typing_accent}cc"
        --separator-color "${background}aa"
      )

      if [[ -n "$wrong" ]]; then
        args+=(
          --ring-wrong-color "${wrong}ff"
          --text-wrong-color "${wrong}ff"
        )
      fi
    fi
  fi

  exec swaylock "${args[@]}"
fi

if command -v hyprlock >/dev/null 2>&1; then
  exec hyprlock
fi

echo "No supported screen locker is installed. Install swaylock." >&2
exit 1
