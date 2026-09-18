#!/usr/bin/env bash
# Shared paths and palette bootstrap. Sourced by launchers.
AGS_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/ags"
AGS_STATE="${XDG_STATE_HOME:-$HOME/.local/state}/ags"
AGS_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/ags"
WAL_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/wal"
mkdir -p "$AGS_STATE" "$AGS_CACHE"
chmod 700 "$AGS_STATE" "$AGS_CACHE"

write_scss_from_wal_json() {
  local json="$WAL_CACHE/colors.json"
  local target="$WAL_CACHE/colors.scss"
  [[ -s "$json" ]] || return 1
  command -v python3 >/dev/null 2>&1 || return 1
  mkdir -p "$WAL_CACHE"
  python3 - "$json" "$target" <<'PY'
import json, os, sys, tempfile
source, target = sys.argv[1:3]
try:
    data = json.load(open(source, encoding='utf-8'))
    special = data.get('special') or {}
    colors = data.get('colors') or {}
    values = {
        'background': special.get('background'),
        'foreground': special.get('foreground'),
        **{f'color{i}': colors.get(f'color{i}') for i in range(16)},
    }
    if not all(isinstance(v, str) and v.startswith('#') for v in values.values()):
        raise ValueError('incomplete wal colors.json')
    text = ''.join(f'${name}: {value};\n' for name, value in values.items())
    directory = os.path.dirname(target)
    fd, tmp = tempfile.mkstemp(prefix='.colors.scss.', dir=directory, text=True)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as out:
            out.write(text)
            out.flush()
            os.fsync(out.fileno())
        os.replace(tmp, target)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
except Exception:
    sys.exit(1)
PY
}

prepare_palette() {
  local palette="$WAL_CACHE/colors.scss"
  # Self-heal installations where pywal generated colors.json but not SCSS.
  if [[ ! -s "$palette" && -s "$WAL_CACHE/colors.json" ]]; then
    write_scss_from_wal_json || true
  fi
  if [[ -s "$palette" ]]; then
    ln -sfn "$palette" "$AGS_DIR/wal.scss"
  else
    # Replace a dangling symlink without following it.
    cp "$AGS_DIR/defaults/colors.scss" "$AGS_DIR/wal.scss.new"
    mv -f "$AGS_DIR/wal.scss.new" "$AGS_DIR/wal.scss"
  fi
}

ensure_ags_running() {
  if timeout 2 ags request ping >/dev/null 2>&1; then
    return 0
  fi
  bash "$AGS_DIR/launch.sh" --if-needed
}

ags_request() {
  local output rc attempt
  for attempt in {1..20}; do
    output="$(timeout 3 ags request "$@" 2>&1)" && rc=0 || rc=$?
    if (( rc == 0 )); then
      if [[ "$output" == *"is not ready"* ]]; then
        sleep 0.1
        continue
      fi
      printf '%s\n' "$output"
      [[ "$output" != ERROR:* ]]
      return
    fi
    sleep 0.1
  done
  printf 'AGS request failed: %s\n' "$output" >&2
  printf 'Log: %s/ags.log\n' "$AGS_STATE" >&2
  return 1
}
