#!/usr/bin/env bash
set -u

state_root="${XDG_STATE_HOME:-$HOME/.local/state}/hyprl4zy"
config_home="${XDG_CONFIG_HOME:-$HOME/.config}"
config_name="hyprl4zy"
mkdir -p "$state_root"
exec 9>"$state_root/session-start.lock"
flock -n 9 || exit 0

if command -v dbus-update-activation-environment >/dev/null 2>&1; then
  dbus-update-activation-environment --systemd \
    WAYLAND_DISPLAY XDG_CURRENT_DESKTOP HYPRLAND_INSTANCE_SIGNATURE \
    >/dev/null 2>&1 || true
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user import-environment \
    WAYLAND_DISPLAY XDG_CURRENT_DESKTOP HYPRLAND_INSTANCE_SIGNATURE \
    >/dev/null 2>&1 || true
fi


# Authentication agent for GUI privilege prompts. Prefer the packaged user
# service when available; fall back to the executable without duplicating it.
if command -v systemctl >/dev/null 2>&1 && \
   systemctl --user cat hyprpolkitagent.service >/dev/null 2>&1; then
  systemctl --user start hyprpolkitagent.service >/dev/null 2>&1 || true
elif [[ -x /usr/lib/hyprpolkitagent/hyprpolkitagent ]] && \
     ! pgrep -u "$(id -u)" -f '/usr/lib/hyprpolkitagent/hyprpolkitagent' >/dev/null 2>&1; then
  /usr/lib/hyprpolkitagent/hyprpolkitagent 9>&- >/dev/null 2>&1 &
fi

# Quickshell owns org.freedesktop.Notifications. Do not start a fallback daemon
# first, otherwise QS can lose the DBus name during login.
for unit in dunst.service swaync.service mako.service; do
  systemctl --user stop "$unit" >/dev/null 2>&1 || true
done
for daemon in dunst swaync mako; do
  pkill -u "$(id -u)" -x "$daemon" >/dev/null 2>&1 || true
done

# Start idle handling once per session.
"$config_home/hypr/scripts/idle.sh" 9>&- || true

# Clipboard history is independent from the shell.
if command -v wl-paste >/dev/null 2>&1 && command -v cliphist >/dev/null 2>&1; then
  (
    flock -n 8 || exit 0
    exec wl-paste --watch cliphist store
  ) 8>"$state_root/clipboard.lock" 9>&- >/dev/null 2>&1 &
fi

# Restore the last static wallpaper when available.
if command -v awww-daemon >/dev/null 2>&1; then
  if ! pgrep -u "$(id -u)" -x awww-daemon >/dev/null 2>&1; then
    awww-daemon 9>&- >/dev/null 2>&1 &
    sleep 0.25
  fi
  wallpaper="${XDG_CACHE_HOME:-$HOME/.cache}/current_wallpaper.jpg"
  if command -v awww >/dev/null 2>&1 && [[ -s "$wallpaper" ]]; then
    awww img "$wallpaper" --transition-type none >/dev/null 2>&1 || true
  fi
fi

run_limited() {
  local seconds="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
  else
    "$@"
  fi
}

instance_pid() {
  command -v qs >/dev/null 2>&1 || return 0
  run_limited 2s qs -c "$config_name" list 2>/dev/null \
    | awk '/Process ID:/ {print $3; exit}' || true
}

start_quickshell() {
  command -v qs >/dev/null 2>&1 || {
    printf '%s\n' 'qs was not found in PATH during session startup.' > "$state_root/quickshell-startup.log"
    return 1
  }

  local pid=""
  pid="$(instance_pid)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  : > "$state_root/quickshell-startup.log"

  # Login can race DBus/Wayland environment propagation on fast boots. Retry a
  # few times instead of permanently losing the shell for the whole session.
  local attempt check
  for attempt in 1 2 3 4; do
    printf 'Attempt %d to start %s\n' "$attempt" "$config_name" >> "$state_root/quickshell-startup.log"
    qs -n -d -c "$config_name" >> "$state_root/quickshell-startup.log" 2>&1 || true

    for check in {1..40}; do
      sleep 0.10
      pid="$(instance_pid)"
      if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        printf 'Started PID %s\n' "$pid" >> "$state_root/quickshell-startup.log"
        return 0
      fi
    done

    sleep 0.50
  done

  printf '%s\n' 'Quickshell failed to stay running after 4 attempts.' >> "$state_root/quickshell-startup.log"
  return 1
}

start_quickshell 9>&- || true
