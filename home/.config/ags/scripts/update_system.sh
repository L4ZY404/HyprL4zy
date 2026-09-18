#!/usr/bin/env bash
set -euo pipefail
if command -v paru >/dev/null; then paru -Syu
elif command -v yay >/dev/null; then yay -Syu
elif command -v pacman >/dev/null; then
  sudo pacman -Syu
else echo 'This update action supports Arch Linux.'
fi
read -r -p 'Press Enter to close...' || true
