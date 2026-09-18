#!/usr/bin/env bash
set -euo pipefail
AGS_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/ags"
if timeout 2 ags request ping >/dev/null 2>&1; then
  ags quit
else
  exec bash "$AGS_DIR/launch.sh" --if-needed
fi
