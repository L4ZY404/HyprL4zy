#!/usr/bin/env bash
set -euo pipefail

TITLE="hyprl4zy Updates"

if ! command -v paru >/dev/null 2>&1; then
    printf 'paru is required by HyprL4zy but was not found. Run ./install.sh install or ./install.sh update to repair it.\n' >&2
    exit 1
fi

UPDATE_COMMAND='paru -Syu'
LABEL='paru -Syu (repositories + AUR)'

SESSION=$(cat <<SCRIPT
printf '\\nhyprl4zy Update Session\\n'
printf 'Command: %s\\n\\n' '$LABEL'
$UPDATE_COMMAND
status=\$?
printf '\\nUpdate command finished with status %s.\\n' "\$status"
printf 'Press Enter to close this terminal...'
read -r _
exit "\$status"
SCRIPT
)

if command -v kitty >/dev/null 2>&1; then
    exec kitty --title "$TITLE" bash -lc "$SESSION"
elif command -v alacritty >/dev/null 2>&1; then
    exec alacritty --title "$TITLE" -e bash -lc "$SESSION"
elif command -v foot >/dev/null 2>&1; then
    exec foot -T "$TITLE" bash -lc "$SESSION"
elif command -v wezterm >/dev/null 2>&1; then
    exec wezterm start -- bash -lc "$SESSION"
elif command -v ghostty >/dev/null 2>&1; then
    exec ghostty --title="$TITLE" -e bash -lc "$SESSION"
elif command -v xterm >/dev/null 2>&1; then
    exec xterm -T "$TITLE" -e bash -lc "$SESSION"
fi

printf 'No supported terminal was found. Install kitty, alacritty, foot, wezterm, ghostty, or xterm.\n' >&2
exit 1
