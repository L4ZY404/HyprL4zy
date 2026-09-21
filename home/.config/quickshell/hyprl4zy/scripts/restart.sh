#!/usr/bin/env bash
set -euo pipefail

state_root="${XDG_STATE_HOME:-$HOME/.local/state}/hyprl4zy"
mkdir -p "$state_root"
# Share the startup lock so repeated shortcuts cannot race session startup.
exec 9>"$state_root/session-start.lock"
flock -n 9 || exit 0
command -v qs >/dev/null 2>&1 || { echo 'Quickshell is not installed.' >&2; exit 1; }

# Only stop instances returned for this configuration, never unrelated shells.
instances="$(timeout 5s qs -c hyprl4zy list)" || {
    echo 'Could not query Quickshell instances; restart cancelled.' >&2
    exit 1
}
mapfile -t pids < <(printf '%s\n' "$instances" | awk '/Process ID:/ && $3 ~ /^[0-9]+$/ {print $3}')
for pid in "${pids[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
 done
for check in {1..50}; do
    alive=false
    for pid in "${pids[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then alive=true; fi
    done
    if [[ "$alive" == false ]]; then break; fi
    sleep 0.1
 done
if [[ "$alive" == true ]]; then
    echo 'Quickshell did not stop within five seconds; no duplicate was started.' >&2
    exit 1
fi
# Do not let the new daemon inherit the restart lock.
qs -n -d -c hyprl4zy 9>&- >>"$state_root/quickshell-startup.log" 2>&1
