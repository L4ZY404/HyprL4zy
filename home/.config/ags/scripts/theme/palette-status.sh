#!/usr/bin/env bash
set -u
cache="${XDG_CACHE_HOME:-$HOME/.cache}/wal"
ags="${XDG_CONFIG_HOME:-$HOME/.config}/ags"
printf 'Pywal palette status\n'
printf '  colors.json: %s\n' "$([[ -s "$cache/colors.json" ]] && echo present || echo missing)"
printf '  colors.scss: %s\n' "$([[ -s "$cache/colors.scss" ]] && echo present || echo missing)"
printf '  AGS wal.scss: %s\n' "$([[ -L "$ags/wal.scss" ]] && readlink "$ags/wal.scss" || echo regular/fallback)"
if [[ -s "$cache/colors.json" ]] && command -v python3 >/dev/null 2>&1; then
  python3 - "$cache/colors.json" <<'PY'
import json, sys
try:
    data=json.load(open(sys.argv[1], encoding='utf-8'))
    print('  background:', (data.get('special') or {}).get('background','?'))
    print('  color11:   ', (data.get('colors') or {}).get('color11','?'))
except Exception as exc:
    print('  colors.json error:', exc)
PY
fi
