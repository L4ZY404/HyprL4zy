#!/usr/bin/env bash
set -euo pipefail
kind="${1:-terminal}"
preference=$(python3 - "$kind" <<'PREF'
import json,os,pathlib,sys
try:
 data=json.loads((pathlib.Path(os.environ.get('XDG_CONFIG_HOME',str(pathlib.Path.home()/'.config')))/'ags/local.json').read_text())
 key={'files':'fileManager','music':'terminal'}.get(sys.argv[1],sys.argv[1])
 value=data.get(key,'')
 print(value if isinstance(value,str) else '')
except (OSError,ValueError,AttributeError): print('')
PREF
)
if [[ -n "$preference" ]] && command -v "$preference" >/dev/null; then
  case "$kind" in
    browser) exec "$preference" ;;
    files) exec "$preference" "$HOME" ;;
  esac
fi
case "$kind" in
 browser) exec xdg-open https://www.google.com ;;
 files) exec xdg-open "$HOME" ;;
esac
for terminal in "$preference" "${TERMINAL:-}" alacritty kitty foot wezterm ghostty xterm; do
  [[ -n "$terminal" ]] && command -v "$terminal" >/dev/null || continue
  if [[ "$kind" == music ]]; then
    command -v ncmpcpp >/dev/null || { echo "ncmpcpp is not installed." >&2; exit 1; }
    if [[ "$terminal" == wezterm ]]; then exec wezterm start -- ncmpcpp; fi
    exec "$terminal" -e ncmpcpp
  fi
  exec "$terminal"
done
command -v notify-send >/dev/null && notify-send 'Terminal unavailable' 'Install a terminal or set TERMINAL.'
exit 1
