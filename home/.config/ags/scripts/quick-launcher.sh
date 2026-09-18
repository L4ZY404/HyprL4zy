#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/runtime.sh"
ensure_ags_running
ags_request quick-launcher "${1:-toggle}"
