#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/runtime.sh"
ensure_ags_running
if [[ -n "${2:-}" ]]; then
  ags_request shortcuts "${1:-toggle}" "$2"
else
  ags_request shortcuts "${1:-toggle}"
fi
