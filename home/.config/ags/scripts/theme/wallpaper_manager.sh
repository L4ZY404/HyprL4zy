#!/usr/bin/env bash

# ==============================================================================
# AGS WALLPAPER MANAGER
# Features: images, videos, awww transitions, mpvpaper, pywal, dunst reload
# ==============================================================================

set -u

state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/ags"
mkdir -p "$state_dir" "${XDG_CACHE_HOME:-$HOME/.cache}"
exec 8>"$state_dir/wallpaper.lock"
flock -n 8 || exit 0

WALL_DIR="${WALL_DIR:-$(python3 - <<'PREFS'
import json,os,pathlib,subprocess
home=pathlib.Path.home()
try:
 data=json.loads((pathlib.Path(os.environ.get('XDG_CONFIG_HOME',str(home/'.config')))/'ags/local.json').read_text())
 value=data.get('wallpaperDir','')
except (OSError,ValueError,AttributeError): value=''
if not isinstance(value,str): value=''
if not value:
 try: pictures=subprocess.check_output(['xdg-user-dir','PICTURES'],text=True).strip()
 except (OSError,subprocess.SubprocessError): pictures=str(home/'Pictures')
 value=str(pathlib.Path(pictures)/'Wallpapers')
print(os.path.expanduser(value))
PREFS
)}"
TRANSITION_TYPE="${TRANSITION_TYPE:-grow}"

CACHE_IMG="${XDG_CACHE_HOME:-$HOME/.cache}/current_wallpaper.jpg"
CACHE_PATH="${XDG_CACHE_HOME:-$HOME/.cache}/current_wall_path"
CACHE_TBL="${XDG_CACHE_HOME:-$HOME/.cache}/current_bg_tbl.jpg"

AGS_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/ags"
AGS_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/ags"
WAL_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/wal"
mkdir -p "$AGS_CACHE" "$WAL_CACHE"
SDDM_SYNC="$AGS_DIR/scripts/theme/sddm_sync.sh"
DUNST_WAL="${XDG_CACHE_HOME:-$HOME/.cache}/wal/colors-dunstrc"
DUNST_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/dunst/dunstrc"
BAR_SETTINGS_JSON="$AGS_DIR/generated/bar-settings.json"

notify() {
  [[ "${AGS_RESTORE_QUIET:-0}" == 1 ]] && return 0
  local title="$1"
  local message="$2"
  local urgency="${3:-normal}"
  local icon="${4:-$CACHE_TBL}"

  if command -v dunstify >/dev/null 2>&1; then
    dunstify -i "$icon" -a "Wallpaper" -r 999 -u "$urgency" "$title" "$message"
  elif command -v notify-send >/dev/null 2>&1; then
    notify-send -i "$icon" -u "$urgency" "$title" "$message"
  fi
}

is_video_file() {
  local filename="$1"
  local extension="${filename##*.}"
  extension="${extension,,}"

  [[ "$extension" =~ ^(mp4|mkv|webm)$ ]]
}

is_wallpaper_file() {
  local filename="$1"
  local extension="${filename##*.}"
  extension="${extension,,}"

  [[ "$extension" =~ ^(jpg|jpeg|png|webp|mp4|mkv|webm)$ ]]
}

ensure_awww_daemon() {
  if pgrep -u "$(id -u)" -x "awww-daemon|swww-daemon" >/dev/null 2>&1; then
    return
  fi

  if command -v awww-daemon >/dev/null 2>&1; then
    awww-daemon 8>&- >/dev/null 2>&1 &
    sleep 0.5
  elif command -v swww-daemon >/dev/null 2>&1; then
    swww-daemon 8>&- >/dev/null 2>&1 &
    sleep 0.5
  fi
}

wallpaper_command() {
  if command -v awww >/dev/null 2>&1; then
    printf '%s' "awww"
    return
  fi

  if command -v swww >/dev/null 2>&1; then
    printf '%s' "swww"
    return
  fi

  printf '%s' ""
}

trigger_wallpaper_cascade() {
  local target_img="$1"
  local command
  command="$(wallpaper_command)"

  if [ -z "$command" ]; then
    notify "Wallpaper Error" "awww or swww is missing." "critical"
    return 1
  fi

  ensure_awww_daemon

  local cursor_global cx cy monitors_json
  cursor_global=$(hyprctl cursorpos 2>/dev/null | tr -d ' ' || true)
  cx=$(echo "$cursor_global" | cut -d',' -f1)
  cy=$(echo "$cursor_global" | cut -d',' -f2)
  monitors_json=$(hyprctl monitors -j 2>/dev/null || true)

  if [ -z "$monitors_json" ] || ! command -v jq >/dev/null 2>&1; then
    "$command" img "$target_img" \
      --transition-type "$TRANSITION_TYPE" \
      --transition-duration 2.0 \
      --transition-fps "${AGS_TRANSITION_FPS:-60}" \
      --invert-y \
      --transition-pos "0.5,0.5"
    return
  fi

  for mon in $(echo "$monitors_json" | jq -r '.[].name'); do
    local mx my mw mh norm_x norm_y
    mx=$(echo "$monitors_json" | jq -r ".[] | select(.name==\"$mon\") | .x")
    my=$(echo "$monitors_json" | jq -r ".[] | select(.name==\"$mon\") | .y")
    mw=$(echo "$monitors_json" | jq -r ".[] | select(.name==\"$mon\") | .width")
    mh=$(echo "$monitors_json" | jq -r ".[] | select(.name==\"$mon\") | .height")

    if [ "${cx:-0}" -ge "$mx" ] && [ "${cx:-0}" -lt "$((mx + mw))" ] && [ "${cy:-0}" -ge "$my" ] && [ "${cy:-0}" -lt "$((my + mh))" ]; then
      norm_x=$(echo "$((cx - mx)) $mw" | awk '{printf "%.3f", $1/$2}')
      norm_y=$(echo "$((cy - my)) $mh" | awk '{printf "%.3f", $1/$2}')

      "$command" img "$target_img" -o "$mon" \
        --transition-type "$TRANSITION_TYPE" \
        --transition-duration 2.0 \
        --transition-fps "${AGS_TRANSITION_FPS:-60}" \
        --invert-y \
        --transition-pos "$norm_x,$norm_y" &
    else
      (
        sleep 0.3
        "$command" img "$target_img" -o "$mon" \
          --transition-type "$TRANSITION_TYPE" \
          --transition-duration 2.0 \
          --transition-fps "${AGS_TRANSITION_FPS:-60}" \
          --invert-y \
          --transition-pos "0.5,0.5"
      ) &
    fi
  done
}

generate_preview() {
  if command -v magick >/dev/null 2>&1; then
    magick "$CACHE_IMG" -resize 800x -quality 70 "$CACHE_TBL" >/dev/null 2>&1 || true
  elif command -v convert >/dev/null 2>&1; then
    convert "$CACHE_IMG" -resize 800x -quality 70 "$CACHE_TBL" >/dev/null 2>&1 || true
  else
    cp "$CACHE_IMG" "$CACHE_TBL" 2>/dev/null || true
  fi
}

wal_source_for_current_image() {
  local digest link
  if command -v sha256sum >/dev/null 2>&1; then
    digest="$(sha256sum "$CACHE_IMG" | awk '{print $1}')"
  else
    digest="$(cksum "$CACHE_IMG" | awk '{print $1 "-" $2}')"
  fi
  link="$AGS_CACHE/wal-source-${digest}.jpg"
  ln -sfn "$CACHE_IMG" "$link"
  # Keep these tiny symlinks bounded while preserving the current one.
  find "$AGS_CACHE" -maxdepth 1 -type l -name 'wal-source-*.jpg' ! -name "$(basename "$link")" -delete 2>/dev/null || true
  printf '%s' "$link"
}

write_scss_from_wal_json() {
  local json="$WAL_CACHE/colors.json"
  local target="$WAL_CACHE/colors.scss"
  [[ -s "$json" ]] || return 1
  python3 - "$json" "$target" <<'PY_WAL_SCSS'
import json, os, sys, tempfile
source, target = sys.argv[1:3]
try:
    data = json.load(open(source, encoding='utf-8'))
    special = data.get('special') or {}
    colors = data.get('colors') or {}
    values = {
        'background': special.get('background'),
        'foreground': special.get('foreground'),
        **{f'color{i}': colors.get(f'color{i}') for i in range(16)},
    }
    if not all(isinstance(v, str) and v.startswith('#') for v in values.values()):
        raise ValueError('incomplete wal colors.json')
    text = ''.join(f'${name}: {value};\n' for name, value in values.items())
    directory = os.path.dirname(target)
    fd, tmp = tempfile.mkstemp(prefix='.colors.scss.', dir=directory, text=True)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as out:
            out.write(text)
            out.flush()
            os.fsync(out.fileno())
        os.replace(tmp, target)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
except Exception:
    sys.exit(1)
PY_WAL_SCSS
}

write_hypr_colors_from_wal_json() {
  local json="$WAL_CACHE/colors.json"
  local target="$WAL_CACHE/colors-hyprland.conf"
  [[ -s "$json" ]] || return 1
  python3 - "$json" "$target" <<'PY_WAL_HYPR'
import json, os, re, sys, tempfile
source, target = sys.argv[1:3]
try:
    data = json.load(open(source, encoding='utf-8'))
    color11 = (data.get('colors') or {}).get('color11', '')
    background = (data.get('special') or {}).get('background', '')
    def hex6(value):
        if not isinstance(value, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', value):
            raise ValueError('invalid Pywal color')
        return value[1:]
    accent = hex6(color11)
    bg = hex6(background)
    text = (
        '# HyprLazy managed Pywal colors.\n'
        f'$ags_color11 = rgb({accent})\n'
        f'$ags_color11_dim = rgba({accent}70)\n'
        f'$ags_background = rgb({bg})\n'
    )
    directory = os.path.dirname(target)
    fd, tmp = tempfile.mkstemp(prefix='.colors-hyprland.', dir=directory, text=True)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as out:
            out.write(text)
            out.flush()
            os.fsync(out.fileno())
        os.replace(tmp, target)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
except Exception:
    sys.exit(1)
PY_WAL_HYPR
}

record_palette_state() {
  python3 - "$WAL_CACHE/colors.json" "$state_dir/palette-state" <<'PY_STATE' 2>/dev/null || true
import json, sys
source, target = sys.argv[1:3]
try:
    data = json.load(open(source, encoding='utf-8'))
    bg = (data.get('special') or {}).get('background', '')
    c11 = (data.get('colors') or {}).get('color11', '')
    with open(target, 'w', encoding='utf-8') as out:
        out.write(f'background={bg}\ncolor11={c11}\n')
except Exception:
    pass
PY_STATE
}

apply_dunst_geometry() {
  [ -f "$DUNST_CONFIG" ] || return 0
  python3 - "$DUNST_CONFIG" "$BAR_SETTINGS_JSON" <<'PY_DUNST_SCALE' 2>/dev/null || true
import json, os, re, sys, tempfile
config_path, settings_path = sys.argv[1:3]
scale = 1.0
try:
    data = json.load(open(settings_path, encoding='utf-8'))
    monitors = data.get('monitors') or {}
    profile = monitors.get('monitor-0') or next(iter(monitors.values()), {})
    scale = float(((profile.get('global') or {}).get('scaleMd', 14))) / 14.0
except Exception:
    scale = 1.0
scale = max(0.70, min(1.80, scale))
# Notifications need a little more visual weight than the narrow vertical bar.
# Keep them tied to the same user scale, with a small readability multiplier.
scale = min(2.0, scale * 1.15)

def sv(value, minimum=1):
    return max(minimum, int(round(value * scale)))

try:
    text = open(config_path, encoding='utf-8').read()
except OSError:
    raise SystemExit(0)

# Keep the Pywal colors/template, but normalize the geometry in the first
# [global] section. This lets notification size follow the same user scale as
# the bar without replacing the user's color palette.
settings = {
    'width': f'(0, {sv(410, 260)})',
    'padding': str(sv(11)),
    'horizontal_padding': str(sv(13)),
    'text_icon_padding': str(sv(8)),
    'gap_size': str(sv(7)),
    'frame_width': str(sv(2)),
    'corner_radius': str(sv(13)),
    'icon_corner_radius': str(sv(7)),
    'max_icon_size': str(sv(62, 24)),
    'separator_height': str(sv(2)),
    'progress_bar_height': str(sv(8)),
    'progress_bar_min_width': str(sv(120, 80)),
    'progress_bar_max_width': str(sv(330, 180)),
    # Compact notification structure: preserve app identity, remove the wide
    # double-space after the gear, then keep title/body immediately below it.
    'format': '"<b>󰣇 %a</b>\\n<b>⚙ %s</b>\\n%b"',
}

lines = text.splitlines()
global_start = next((i for i, line in enumerate(lines) if line.strip().lower() == '[global]'), None)
if global_start is None:
    lines = ['[global]'] + [f'    {k} = {v}' for k, v in settings.items()] + [''] + lines
else:
    global_end = next((i for i in range(global_start + 1, len(lines)) if re.match(r'^\s*\[.+\]\s*$', lines[i])), len(lines))
    for key, value in settings.items():
        pattern = re.compile(rf'^(\s*){re.escape(key)}\s*=.*$', re.I)
        found = False
        for i in range(global_start + 1, global_end):
            match = pattern.match(lines[i])
            if match:
                lines[i] = f'{match.group(1) or "    "}{key} = {value}'
                found = True
                break
        if not found:
            lines.insert(global_end, f'    {key} = {value}')
            global_end += 1

# Scale an existing font size while preserving the configured font family.
for i in range((global_start or 0) + 1, min(len(lines), (global_end if global_start is not None else len(lines)))):
    m = re.match(r'^(\s*)font\s*=\s*(.*?)(?:\s+(\d+(?:\.\d+)?))?\s*$', lines[i], re.I)
    if not m:
        continue
    family = (m.group(2) or '').strip()
    # If the greedy family captured a trailing size, peel it back out.
    fm = re.match(r'^(.*?)(?:\s+(\d+(?:\.\d+)?))$', family)
    if fm:
        family = fm.group(1).strip()
    if not family:
        family = 'JetBrainsMono Nerd Font'
    family = re.sub(r'\s+(?:Regular|Normal|Medium|Bold|SemiBold|DemiBold|Heavy|Black)$', '', family, flags=re.I).strip()
    lines[i] = f'{m.group(1) or "    "}font = {family} Bold {max(8, sv(10, 8))}'
    break

directory = os.path.dirname(config_path)
fd, tmp = tempfile.mkstemp(prefix='.dunstrc.ags.', dir=directory, text=True)
try:
    with os.fdopen(fd, 'w', encoding='utf-8') as out:
        out.write('\n'.join(lines) + '\n')
        out.flush(); os.fsync(out.fileno())
    os.replace(tmp, config_path)
finally:
    if os.path.exists(tmp): os.unlink(tmp)
PY_DUNST_SCALE

  if command -v dunstctl >/dev/null 2>&1; then
    timeout 2 dunstctl reload >/dev/null 2>&1 || true
  fi
}

reload_theme_stack() {
  local wal_updated=0 wal_source=""
  if command -v wal >/dev/null 2>&1; then
    wal_source="$(wal_source_for_current_image)"
    # The content hash in the path prevents pywal from reusing a stale scheme
    # merely because ~/.cache/current_wallpaper.jpg kept the same filename.
    if wal -i "$wal_source" -n -q -t >/dev/null 2>&1; then
      wal_updated=1
      # pywal variants differ in their built-in exports. Always guarantee the
      # SCSS file consumed by AGS from the canonical colors.json output.
      write_scss_from_wal_json || true
      write_hypr_colors_from_wal_json || true
      record_palette_state
    fi
  fi

  if [[ "${AGS_SYNC_SDDM:-0}" == 1 && -f "$SDDM_SYNC" ]]; then
    sh "$SDDM_SYNC" >/dev/null 2>&1 || true
  fi

  local hypr_palette="${XDG_CACHE_HOME:-$HOME/.cache}/wal/colors-hyprland.conf"
  local hypr_target="${XDG_CONFIG_HOME:-$HOME/.config}/hypr/hyprlazy-colors.conf"
  if [[ -s "$hypr_palette" ]]; then
    mkdir -p "$(dirname "$hypr_target")"
    cp "$hypr_palette" "$hypr_target"
    if command -v hyprctl >/dev/null 2>&1 && [[ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]]; then
      hyprctl reload >/dev/null 2>&1 || true
    fi
  fi

  # Never restore a stale pre-upgrade notification template after a wal failure.
  if (( wal_updated )) && [ -f "$DUNST_WAL" ]; then
    mkdir -p "$(dirname "$DUNST_CONFIG")"
    cp "$DUNST_WAL" "$DUNST_CONFIG" 2>/dev/null || true
  fi

  apply_dunst_geometry

  if [[ "${AGS_NO_RESTART:-0}" != 1 && -x "$AGS_DIR/launch.sh" ]]; then
    ("$AGS_DIR/launch.sh") 8>&- >/dev/null 2>&1 &
  fi
}

apply_wallpaper() {
  local img="$1"

  if [ -z "$img" ] || [ ! -f "$img" ]; then
    notify "Wallpaper Error" "File not found: $img" "critical"
    exit 1
  fi

  echo "$img" > "$CACHE_PATH"

  local filename is_video
  filename=$(basename "$img")

  if is_video_file "$filename"; then
    is_video=true
  else
    is_video=false
  fi

  if [ "$is_video" = true ]; then
    if command -v ffmpeg >/dev/null 2>&1; then
      ffmpeg -y -i "$img" -vframes 1 -f image2 "$CACHE_IMG" >/dev/null 2>&1 || exit 1
    else
      notify "Wallpaper Error" "ffmpeg is missing. Cannot process video." "critical"
      exit 1
    fi
  else
    cp "$img" "$CACHE_IMG" || exit 1
  fi

  if [ "$is_video" = true ]; then
    pkill -u "$(id -u)" -x mpvpaper >/dev/null 2>&1 || true

    if command -v mpvpaper >/dev/null 2>&1; then
      # Videos use exactly the same cursor-origin circular transition as photos:
      # transition to the extracted first frame, hold it until the awww/swww
      # transition is complete, then reveal mpvpaper without a second transition.
      trigger_wallpaper_cascade "$CACHE_IMG"
      sleep "${AGS_VIDEO_TRANSITION_HOLD:-2.05}"
      nice -n 19 mpvpaper -o "--no-audio --loop-file=inf --hwdec=auto --vo=gpu --fps=60 --profile=fast --vd-lavc-threads=2 --panscan=1.0" '*' "$img" 8>&- >/dev/null 2>&1 &
      sleep 0.55
      local command
      command="$(wallpaper_command)"
      if [ -n "$command" ]; then
        "$command" clear >/dev/null 2>&1 || true
      fi
    else
      notify "Wallpaper Warning" "mpvpaper is missing. Using static video frame." "normal"
      trigger_wallpaper_cascade "$CACHE_IMG"
    fi
  else
    pkill -u "$(id -u)" -x mpvpaper >/dev/null 2>&1 || true
    trigger_wallpaper_cascade "$CACHE_IMG"
  fi

  generate_preview
  reload_theme_stack
  notify "Wallpaper Updated" "Source: $filename" "normal" "$CACHE_TBL"
}

select_random_wallpaper() {
  find "$WALL_DIR" -type f \( \
    -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" -o \
    -iname "*.mp4" -o -iname "*.mkv" -o -iname "*.webm" \
  \) 2>/dev/null | shuf -n 1
}

case "${1:-}" in
  --dunst-scale)
    apply_dunst_geometry
    exit 0
    ;;

  -r|--random)
    SELECTED=$(select_random_wallpaper)
    if [ -n "$SELECTED" ]; then
      apply_wallpaper "$SELECTED"
    else
      notify "Wallpaper Error" "No wallpapers found in $WALL_DIR" "critical"
      exit 1
    fi
    ;;

  -s|--select)
    if command -v nemo >/dev/null 2>&1; then
      nemo "$WALL_DIR" >/dev/null 2>&1 &
      notify "Wallpapers" "Opened wallpaper folder in Nemo." "normal"
      exit 0
    fi

    if command -v ranger >/dev/null 2>&1; then
      if command -v alacritty >/dev/null 2>&1; then
        alacritty --title "Wallpapers" -e ranger "$WALL_DIR" >/dev/null 2>&1 &
      elif command -v kitty >/dev/null 2>&1; then
        kitty --title "Wallpapers" -e ranger "$WALL_DIR" >/dev/null 2>&1 &
      elif command -v foot >/dev/null 2>&1; then
        foot -T "Wallpapers" ranger "$WALL_DIR" >/dev/null 2>&1 &
      elif command -v wezterm >/dev/null 2>&1; then
        wezterm start -- ranger "$WALL_DIR" >/dev/null 2>&1 &
      else
        notify "Wallpaper Error" "ranger is installed, but no supported terminal was found." "critical"
        exit 1
      fi

      notify "Wallpapers" "Opened wallpaper folder in ranger." "normal"
      exit 0
    fi

    xdg-open "$WALL_DIR" >/dev/null 2>&1 &
    notify "Wallpapers" "Opened wallpaper folder." "normal"
    ;;

  ""|--restore)
    if [ -f "$CACHE_PATH" ]; then
      LAST_WALL=$(cat "$CACHE_PATH")
      if [ -f "$LAST_WALL" ]; then
        apply_wallpaper "$LAST_WALL"
      else
        SELECTED=$(select_random_wallpaper)
        [[ -n "$SELECTED" ]] && apply_wallpaper "$SELECTED"
      fi
    else
      SELECTED=$(select_random_wallpaper)
      [[ -n "$SELECTED" ]] && apply_wallpaper "$SELECTED"
    fi
    ;;

  *)
    if [ -f "$1" ] && is_wallpaper_file "$1"; then
      apply_wallpaper "$1"
    else
      echo "Usage: $0 [--random|--select] OR [filename]"
      exit 1
    fi
    ;;
esac
