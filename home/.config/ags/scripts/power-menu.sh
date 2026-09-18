#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$(readlink -f "$0")")/runtime.sh"
ensure_ags_running
ags_request power-menu "${1:-toggle}"
