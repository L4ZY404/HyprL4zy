#!/usr/bin/env bash
set -euo pipefail

command_name="${1:-status}"
arg="${2:-}"
cache_home="${XDG_CACHE_HOME:-$HOME/.cache}"
config_home="${XDG_CONFIG_HOME:-$HOME/.config}"
state_home="${XDG_STATE_HOME:-$HOME/.local/state}"
thumb_dir="$cache_home/hyprl4zy/wallpaper-previews"
palette_frame_dir="$cache_home/hyprl4zy/pywal-frames"
current_path="$cache_home/current_wall_path"
current_frame="$cache_home/current_wallpaper.png"
current_video_frame_path="$state_home/hyprl4zy/current-video-frame.path"
mkdir -p "$thumb_dir" "$palette_frame_dir" "$state_home/hyprl4zy"

normalize_user_path() {
    local value="${1:-}"

    # Accept the common forms users paste into Wallpaper Studio. Shell tilde
    # expansion does not happen after a value has already been stored in a
    # variable, so normalize it explicitly here.
    case "$value" in
        '~') value="$HOME" ;;
        '~/'*) value="$HOME/${value#\~/}" ;;
    esac

    value="${value//\$\{HOME\}/$HOME}"
    value="${value//\$HOME/$HOME}"

    if [[ "$value" == file://* ]]; then
        if command -v python3 >/dev/null 2>&1; then
            value="$(python3 - "$value" <<'PYURI'
import sys
from urllib.parse import unquote, urlparse
uri = sys.argv[1]
parsed = urlparse(uri)
print(unquote(parsed.path))
PYURI
)"
        else
            value="${value#file://}"
            value="${value//%20/ }"
        fi
    fi

    [[ -n "$value" ]] || value="$HOME/Pictures/Wallpapers"

    if [[ "$value" != /* ]]; then
        value="$PWD/$value"
    fi

    realpath -m -- "$value" 2>/dev/null || printf '%s\n' "$value"
}

backend() {
    if command -v awww >/dev/null 2>&1; then
        printf '%s\n' "awww"
    elif command -v swww >/dev/null 2>&1; then
        printf '%s\n' "swww"
    elif command -v hyprctl >/dev/null 2>&1 && pgrep -x hyprpaper >/dev/null 2>&1; then
        printf '%s\n' "hyprpaper"
    else
        printf '%s\n' "none"
    fi
}

kind_for() {
    local name="${1,,}"
    case "$name" in
        *.mp4|*.mkv|*.webm) printf 'video\n' ;;
        *.jpg|*.jpeg|*.png|*.webp) printf 'image\n' ;;
        *) printf 'unknown\n' ;;
    esac
}

start_wallpaper_daemon() {
    local selected="$1"
    case "$selected" in
        awww)
            if ! pgrep -x awww-daemon >/dev/null 2>&1; then
                command -v awww-daemon >/dev/null 2>&1 || return 1
                awww-daemon >/dev/null 2>&1 &
                sleep 0.35
            fi
            ;;
        swww)
            if ! pgrep -x swww-daemon >/dev/null 2>&1; then
                command -v swww-daemon >/dev/null 2>&1 || return 1
                swww-daemon >/dev/null 2>&1 &
                sleep 0.35
            fi
            ;;
    esac
}

# Hyprland reports the pointer in global layout coordinates. awww/swww expect
# transition coordinates relative to one output, and their Y axis is bottom-up.
# Convert the pointer to monitor-local percentages so this also remains correct
# with negative monitor positions and HiDPI scaling.
cursor_context() {
    command -v hyprctl >/dev/null 2>&1 || return 1
    command -v jq >/dev/null 2>&1 || return 1
    [[ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]] || return 1

    local raw cx cy monitor_line name local_x local_y scale physical_w physical_h origin
    raw="$(hyprctl cursorpos 2>/dev/null | head -n1 | tr -d '[:space:]')"
    [[ "$raw" =~ ^(-?[0-9]+),(-?[0-9]+)$ ]] || return 1
    cx="${BASH_REMATCH[1]}"
    cy="${BASH_REMATCH[2]}"

    monitor_line="$(hyprctl -j monitors 2>/dev/null | jq -r \
        --argjson cx "$cx" --argjson cy "$cy" '
            .[]
            | select((.disabled // false) == false)
            | (.scale // 1) as $scale
            | (.width / $scale) as $logical_w
            | (.height / $scale) as $logical_h
            | select($cx >= .x and $cx < (.x + $logical_w)
                     and $cy >= .y and $cy < (.y + $logical_h))
            | [.name, ($cx - .x), ($cy - .y), $scale, .width, .height]
            | @tsv
        ' | head -n1)"

    [[ -n "$monitor_line" ]] || return 1
    IFS=$'\t' read -r name local_x local_y scale physical_w physical_h <<< "$monitor_line"
    [[ -n "$name" && -n "$scale" && -n "$physical_w" && -n "$physical_h" ]] || return 1

    # awww interprets integer transition coordinates in physical output pixels,
    # measured from the left and from the bottom. Convert Hyprland's global,
    # top-origin logical pointer coordinates once here and avoid --invert-y.
    origin="$(awk -v x="$local_x" -v y="$local_y" -v s="$scale" -v w="$physical_w" -v h="$physical_h" '
        BEGIN {
            px = int(x * s + 0.5)
            py_top = int(y * s + 0.5)
            py = int(h - py_top)
            if (px < 0) px = 0
            if (px >= w) px = int(w - 1)
            if (py < 0) py = 0
            if (py >= h) py = int(h - 1)
            printf "%d,%d", px, py
        }
    ')" || return 1

    printf '%s\t%s\n' "$name" "$origin"
}

backend_outputs() {
    local selected="$1"
    case "$selected" in
        awww)
            if command -v jq >/dev/null 2>&1; then
                awww query -j 2>/dev/null \
                    | jq -r 'to_entries[] | .value[]? | .name // empty' \
                    | sed '/^$/d' \
                    || true
            fi
            ;;
        swww)
            swww query 2>/dev/null \
                | awk -F: 'NF > 1 {gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); if ($1 != "") print $1}' \
                || true
            ;;
    esac
}

active_outputs() {
    if command -v hyprctl >/dev/null 2>&1 \
       && command -v jq >/dev/null 2>&1 \
       && [[ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]]; then
        hyprctl -j monitors 2>/dev/null \
            | jq -r '.[] | select((.disabled // false) == false) | .name' \
            | sed '/^$/d'
    fi
}

apply_transition_output() {
    local selected="$1"
    local target="$2"
    local output="$3"
    local transition="$4"
    local origin="${5:-center}"

    local cmd=("$selected" img -o "$output"
        --transition-type "$transition"
        --transition-duration 1.30
        --transition-fps 60)

    if [[ "$transition" == "grow" ]]; then
        cmd+=(--transition-pos "$origin")
    fi

    cmd+=("$target")
    "${cmd[@]}"
}

apply_global_transition() {
    local selected="$1"
    local target="$2"
    local transition="${3:-fade}"
    local origin="${4:-center}"

    local cmd=("$selected" img
        --transition-type "$transition"
        --transition-duration 1.30
        --transition-fps 60)
    [[ "$transition" == "grow" ]] && cmd+=(--transition-pos "$origin")
    cmd+=("$target")
    "${cmd[@]}"
}

apply_instant_output() {
    local selected="$1"
    local target="$2"
    local output="$3"

    # Prefer the backend's explicit no-transition mode. Some older forks do not
    # expose it, so keep a practically-instant fade as a compatibility fallback.
    "$selected" img -o "$output" --transition-type none "$target" 2>/dev/null         || "$selected" img -o "$output" --transition-type fade --transition-duration 0.01 --transition-fps 60 "$target"
}

apply_image_backend_instant() {
    local target="$1"
    local selected="$2"
    local backend_log="$state_home/hyprl4zy/wallpaper-last-backend.log"

    case "$selected" in
        awww|swww)
            start_wallpaper_daemon "$selected"
            local outputs=()
            mapfile -t outputs < <(backend_outputs "$selected")
            if [[ ${#outputs[@]} -eq 0 ]]; then
                mapfile -t outputs < <(active_outputs)
            fi

            local success=0 output
            for output in "${outputs[@]}"; do
                if apply_instant_output "$selected" "$target" "$output" >>"$backend_log" 2>&1; then
                    success=$((success + 1))
                fi
            done

            if [[ $success -eq 0 ]]; then
                if "$selected" img --transition-type none "$target" >>"$backend_log" 2>&1                     || "$selected" img --transition-type fade --transition-duration 0.01 --transition-fps 60 "$target" >>"$backend_log" 2>&1; then
                    success=1
                fi
            fi
            [[ $success -gt 0 ]] || return 1
            ;;
        hyprpaper)
            hyprctl hyprpaper preload "$target" >/dev/null 2>&1 || true
            hyprctl hyprpaper wallpaper ",$target" >/dev/null
            ;;
        *)
            return 1
            ;;
    esac
}

apply_image_backend() {
    local target="$1"
    local selected="$2"
    local captured_context="${3:-}"
    local backend_log="$state_home/hyprl4zy/wallpaper-last-backend.log"
    : > "$backend_log"

    case "$selected" in
        awww|swww)
            start_wallpaper_daemon "$selected"

            local context cursor_monitor cursor_origin
            context="$captured_context"
            [[ -n "$context" ]] || context="$(cursor_context 2>/dev/null || true)"
            cursor_monitor=""
            cursor_origin="center"
            if [[ -n "$context" ]]; then
                IFS=$'\t' read -r cursor_monitor cursor_origin <<< "$context"
            fi

            local outputs=()
            mapfile -t outputs < <(backend_outputs "$selected")
            if [[ ${#outputs[@]} -eq 0 ]]; then
                mapfile -t outputs < <(active_outputs)
            fi

            local success=0
            local cursor_known=0
            local output
            for output in "${outputs[@]}"; do
                [[ "$output" == "$cursor_monitor" ]] && cursor_known=1
            done

            if [[ -n "$cursor_monitor" && $cursor_known -eq 1 ]]; then
                if apply_transition_output "$selected" "$target" "$cursor_monitor" "grow" "$cursor_origin" >>"$backend_log" 2>&1; then
                    success=$((success + 1))
                fi

                for output in "${outputs[@]}"; do
                    [[ "$output" == "$cursor_monitor" ]] && continue
                    if apply_transition_output "$selected" "$target" "$output" "fade" "center" >>"$backend_log" 2>&1; then
                        success=$((success + 1))
                    fi
                done
            fi

            # If output targeting fails for any reason, fall back to the simple
            # all-output path that awww/swww support natively. Wallpaper apply
            # must never fail solely because monitor discovery disagrees.
            if [[ $success -eq 0 ]]; then
                if apply_global_transition "$selected" "$target" "grow" "center" >>"$backend_log" 2>&1; then
                    success=1
                fi
            fi

            [[ $success -gt 0 ]] || return 1
            ;;
        hyprpaper)
            hyprctl hyprpaper preload "$target" >/dev/null 2>&1 || true
            hyprctl hyprpaper wallpaper ",$target" >/dev/null
            ;;
        none)
            return 1
            ;;
    esac
}

extract_video_frame() {
    local file="$1"
    local output="$2"
    command -v ffmpeg >/dev/null 2>&1 || return 1

    local tmp="${output}.tmp.png"
    rm -f "$tmp"

    # Prefer a representative frame from roughly one third into the video.
    # Fall back to fixed seek points for malformed or very short files.
    local seeks=()
    if command -v ffprobe >/dev/null 2>&1; then
        local duration representative
        duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$file" 2>/dev/null || true)"
        representative="$(awk -v d="$duration" 'BEGIN { if (d + 0 > 0.3) printf "%.3f", d * 0.33 }')"
        [[ -n "$representative" ]] && seeks+=("$representative")
    fi
    seeks+=("1" "0" "2")

    local seek
    for seek in "${seeks[@]}"; do
        if timeout 20 ffmpeg -threads 1 -y -ss "$seek" -i "$file" \
            -map 0:v:0 -frames:v 1 -vf 'format=rgb24' -compression_level 3 "$tmp" >/dev/null 2>&1 \
            && [[ -s "$tmp" ]]; then
            mv -f "$tmp" "$output"
            return 0
        fi
        rm -f "$tmp"
    done

    return 1
}

# Pywal caches generated schemes by image path/name and does not reliably notice
# when an existing file is replaced in-place. Video frames used to always be
# written as current_wallpaper.jpg, so later videos could reuse stale colors.
# Give every distinct frame a content-addressed filename instead.
video_palette_source() {
    local frame="$1"
    [[ -s "$frame" ]] || return 1

    local digest target
    digest="$(sha256sum "$frame" | awk '{print $1}')"
    [[ -n "$digest" ]] || return 1
    target="$palette_frame_dir/${digest}.png"

    if [[ ! -s "$target" ]]; then
        cp -f "$frame" "$target"
    fi
    touch "$target"

    # Keep a small bounded cache of palette sources.
    find "$palette_frame_dir" -maxdepth 1 -type f -name '*.png' -printf '%T@ %p\n' 2>/dev/null \
        | sort -nr \
        | tail -n +17 \
        | cut -d' ' -f2- \
        | xargs -r rm -f --

    printf '%s' "$target"
}

sync_hyprland_palette() {
    local generated="$cache_home/wal/colors-hyprland.conf"
    local target="$config_home/hypr/colors.conf"

    [[ -s "$generated" ]] || return 0
    mkdir -p "$(dirname "$target")"

    local tmp="${target}.hyprl4zy.$$"
    cp -f "$generated" "$tmp"
    chmod 0644 "$tmp"
    mv -f "$tmp" "$target"

    if command -v hyprctl >/dev/null 2>&1 && [[ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]]; then
        hyprctl reload >/dev/null 2>&1 || true
    fi
}

refresh_wal() {
    local source="$1"
    local force_regenerate="${2:-0}"
    local palette_file="$cache_home/wal/colors.json"
    local error_log="$state_home/hyprl4zy/pywal-last-error.log"
    local source_log="$state_home/hyprl4zy/pywal-last-source.log"
    command -v wal >/dev/null 2>&1 || return 2
    [[ -s "$source" ]] || return 1

    printf '%s\n' "$source" > "$source_log"
    : > "$error_log"

    if ! wal -i "$source" -n -q >/dev/null 2>"$error_log"; then
        # Keep one verbose retry in the log. Some pywal forks differ in their
        # quiet-mode behaviour, while the actual palette generation still works.
        if ! wal -i "$source" -n >/dev/null 2>>"$error_log"; then
            return 1
        fi
    fi

    [[ -s "$palette_file" ]] || return 1
    grep -q '"background"' "$palette_file" || return 1
    grep -q '"color11"' "$palette_file" || return 1
    sync_hyprland_palette
    return 0
}

video_thumb_path() {
    local file="$1"
    local stamp key
    stamp="$(stat -c '%Y:%s' "$file" 2>/dev/null || printf '0:0')"
    key="$(printf '%s|%s' "$file" "$stamp" | sha256sum | awk '{print $1}')"
    printf '%s/%s.jpg' "$thumb_dir" "$key"
}

generate_video_thumb() {
    local file="$1"
    command -v ffmpeg >/dev/null 2>&1 || return 1
    local thumb tmp
    thumb="$(video_thumb_path "$file")"
    [[ -s "$thumb" ]] && { printf '%s' "$thumb"; return 0; }

    # Thumbnail generation is intentionally bounded and is never performed by
    # the catalog scan itself. This prevents a folder with many videos from
    # keeping Wallpaper Studio empty for minutes.
    tmp="${thumb}.tmp.jpg"
    rm -f "$tmp"
    if timeout 10 ffmpeg -threads 1 -y -ss 00:00:01 -i "$file" \
        -map 0:v:0 -frames:v 1 \
        -vf 'scale=960:540:force_original_aspect_ratio=increase,crop=960:540' \
        -q:v 3 "$tmp" >/dev/null 2>&1 && [[ -s "$tmp" ]]; then
        mv -f "$tmp" "$thumb"
        printf '%s' "$thumb"
        return 0
    fi
    rm -f "$tmp"
    return 1
}

scan_directory() {
    local dir
    dir="$(normalize_user_path "$1")"
    [[ -d "$dir" ]] || {
        printf 'Wallpaper directory does not exist: %s\n' "$dir" >&2
        return 2
    }

    while IFS=$'\t' read -r _stamp file; do
        [[ -f "$file" ]] || continue
        local kind preview
        kind="$(kind_for "$file")"
        [[ "$kind" != "unknown" ]] || continue
        preview="$file"
        if [[ "$kind" == "video" ]]; then
            preview="$(video_thumb_path "$file")"
            [[ -s "$preview" ]] || preview=""
        fi
        printf 'ENTRY\t%s\t%s\t%s\n' "$kind" "$file" "$preview"
    done < <(
        find "$dir" -maxdepth 3 -type f \( \
            -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' -o \
            -iname '*.mp4' -o -iname '*.mkv' -o -iname '*.webm' \
        \) -printf '%T@\t%p\n' 2>/dev/null | sort -nr
    )
}

warm_video_previews() {
    local dir
    dir="$(normalize_user_path "$1")"
    [[ -d "$dir" ]] || return 2
    command -v ffmpeg >/dev/null 2>&1 || return 0

    # Run outside the catalog scan. Wallpaper Studio can render the complete
    # list immediately using placeholders while these previews are prepared.
    while IFS= read -r -d '' file; do
        generate_video_thumb "$file" >/dev/null 2>&1 || true
    done < <(find "$dir" -maxdepth 3 -type f \( -iname '*.mp4' -o -iname '*.mkv' -o -iname '*.webm' \) -print0 2>/dev/null)
}

prepare_current_video_handoff() {
    local selected="$1"

    [[ "$selected" != "none" ]] || return 1
    [[ -s "$current_path" ]] || return 1
    pgrep -u "$(id -u)" -x mpvpaper >/dev/null 2>&1 || return 1

    local previous previous_kind frame fallback_frame
    previous="$(cat "$current_path" 2>/dev/null || true)"
    previous_kind="$(kind_for "$previous")"
    [[ "$previous_kind" == "video" ]] || return 1

    frame=""
    if [[ -s "$current_video_frame_path" ]]; then
        frame="$(cat "$current_video_frame_path" 2>/dev/null || true)"
        [[ -s "$frame" ]] || frame=""
    fi

    if [[ -z "$frame" && -f "$previous" ]]; then
        fallback_frame="$cache_home/hyprl4zy/current-video-handoff.png"
        mkdir -p "$(dirname "$fallback_frame")"
        if extract_video_frame "$previous" "$fallback_frame"; then
            frame="$fallback_frame"
        fi
    fi

    [[ -n "$frame" && -s "$frame" ]] || return 1

    # Put the static representative frame behind the still-running mpvpaper
    # surface with no visible animation. Killing mpvpaper after that reveals the
    # exact still frame instead of black, then the normal transition can begin.
    apply_image_backend_instant "$frame" "$selected" || return 1
    sleep 0.06
    pkill -u "$(id -u)" -x mpvpaper >/dev/null 2>&1 || true
    return 0
}

apply_wallpaper() {
    local target
    target="$(normalize_user_path "$1")"
    [[ -f "$target" ]] || {
        printf 'Wallpaper does not exist: %s\n' "$target" >&2
        return 2
    }

    local selected kind live palette_state palette_source transition_context video_handoff
    selected="$(backend)"
    kind="$(kind_for "$target")"
    # Capture pointer context immediately when Apply begins. Video extraction
    # and Pywal may take seconds; querying afterwards no longer represents the
    # click that initiated the transition.
    transition_context="$(cursor_context 2>/dev/null || true)"
    printf '%s\n' "$transition_context" > "$state_home/hyprl4zy/wallpaper-last-transition-context.log"
    live=0
    palette_state="unavailable"
    palette_source=""
    video_handoff=0
    if prepare_current_video_handoff "$selected"; then
        video_handoff=1
    fi

    case "$kind" in
        image)
            if [[ $video_handoff -eq 0 ]]; then
                pkill -u "$(id -u)" -x mpvpaper >/dev/null 2>&1 || true
            fi
            rm -f "$current_video_frame_path"
            [[ "$selected" != "none" ]] || {
                printf 'No image wallpaper backend found. Install awww/swww or run hyprpaper.\n' >&2
                return 3
            }
            apply_image_backend "$target" "$selected" "$transition_context"
            cp -f "$target" "$current_frame" 2>/dev/null || true
            palette_source="$target"
            if refresh_wal "$palette_source"; then palette_state="updated"; else palette_state="failed"; fi
            ;;
        video)
            command -v ffmpeg >/dev/null 2>&1 || {
                printf 'ffmpeg is required for video wallpapers.\n' >&2
                return 4
            }
            if ! extract_video_frame "$target" "$current_frame"; then
                printf 'Could not extract a video frame for Pywal: %s\n' "$target" >&2
                return 4
            fi
            palette_source="$(video_palette_source "$current_frame")" || {
                printf 'Could not prepare a unique video frame for Pywal: %s\n' "$target" >&2
                return 4
            }
            if refresh_wal "$palette_source" 1; then palette_state="updated"; else palette_state="failed"; fi
            printf '%s\n' "$palette_source" > "$current_video_frame_path"
            if [[ $video_handoff -eq 0 ]]; then
                pkill -u "$(id -u)" -x mpvpaper >/dev/null 2>&1 || true
            fi

            if [[ "$selected" != "none" ]]; then
                apply_image_backend "$current_frame" "$selected" "$transition_context" || true
            fi

            if command -v mpvpaper >/dev/null 2>&1; then
                (
                    sleep 1.45
                    nohup mpvpaper -o '--no-audio --loop-file=inf --hwdec=auto --profile=fast --panscan=1.0' '*' "$target" >/dev/null 2>&1 &
                    sleep 0.45
                    case "$selected" in
                        awww) awww clear >/dev/null 2>&1 || true ;;
                        swww) swww clear >/dev/null 2>&1 || true ;;
                    esac
                ) >/dev/null 2>&1 &
                live=1
            elif [[ "$selected" == "none" ]]; then
                printf 'mpvpaper is required for live video wallpapers when no image backend is available.\n' >&2
                return 5
            fi
            ;;
        *)
            printf 'Unsupported wallpaper format: %s\n' "$target" >&2
            return 6
            ;;
    esac

    printf '%s\n' "$target" > "$current_path"
    printf 'backend=%s\nkind=%s\nlive=%s\npalette=%s\n' \
        "$selected" "$kind" "$live" "$palette_state"
    [[ -n "$palette_source" ]] && printf 'palette_source=%s\n' "$palette_source"
}

case "$command_name" in
    status)
        printf 'backend=%s\n' "$(backend)"
        command -v wal >/dev/null 2>&1 && printf 'pywal=1\n' || printf 'pywal=0\n'
        command -v ffmpeg >/dev/null 2>&1 && printf 'ffmpeg=1\n' || printf 'ffmpeg=0\n'
        command -v mpvpaper >/dev/null 2>&1 && printf 'mpvpaper=1\n' || printf 'mpvpaper=0\n'
        command -v jq >/dev/null 2>&1 && printf 'jq=1\n' || printf 'jq=0\n'
        ;;
    scan)
        [[ -n "$arg" ]] || { printf 'Usage: %s scan DIRECTORY\n' "$0" >&2; exit 2; }
        scan_directory "$arg"
        ;;
    warm-previews)
        [[ -n "$arg" ]] || { printf 'Usage: %s warm-previews DIRECTORY\n' "$0" >&2; exit 2; }
        warm_video_previews "$arg"
        ;;
    open-folder)
        [[ -n "$arg" ]] || { printf 'Usage: %s open-folder DIRECTORY\n' "$0" >&2; exit 2; }
        arg="$(normalize_user_path "$arg")"
        mkdir -p -- "$arg"
        if command -v nemo >/dev/null 2>&1; then
            nohup nemo "$arg" >/dev/null 2>&1 &
        else
            nohup xdg-open "$arg" >/dev/null 2>&1 &
        fi
        ;;
    apply)
        [[ -n "$arg" ]] || { printf 'Usage: %s apply FILE\n' "$0" >&2; exit 2; }
        apply_wallpaper "$arg"
        ;;
    *)
        printf 'Usage: %s [status|scan DIRECTORY|warm-previews DIRECTORY|open-folder DIRECTORY|apply FILE]\n' "$0" >&2
        exit 2
        ;;
esac
