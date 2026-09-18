#!/usr/bin/env bash

# Safe pacman.conf changes for HyprLazy.

set -euo pipefail

render_pacman_conf() {
  local input="$1"
  local output="$2"

  awk '
    function emit_missing() {
      if (!saw_color) print "Color"
      if (!saw_candy) print "ILoveCandy"
      if (!saw_parallel) print "ParallelDownloads = 5"
    }
    BEGIN {
      in_options = 0
      saw_color = 0
      saw_candy = 0
      saw_parallel = 0
    }
    /^\[options\][[:space:]]*$/ {
      if (in_options) emit_missing()
      in_options = 1
      saw_color = 0
      saw_candy = 0
      saw_parallel = 0
      print
      next
    }
    /^\[[^]]+\][[:space:]]*$/ {
      if (in_options) {
        emit_missing()
        in_options = 0
      }
      print
      next
    }
    {
      if (in_options) {
        if ($0 ~ /^[[:space:]]*#?[[:space:]]*Color[[:space:]]*$/) {
          if (!saw_color) print "Color"
          saw_color = 1
          next
        }
        if ($0 ~ /^[[:space:]]*#?[[:space:]]*ILoveCandy[[:space:]]*$/) {
          if (!saw_candy) print "ILoveCandy"
          saw_candy = 1
          next
        }
        if ($0 ~ /^[[:space:]]*#?[[:space:]]*ParallelDownloads[[:space:]]*=/) {
          if (!saw_parallel) print "ParallelDownloads = 5"
          saw_parallel = 1
          next
        }
      }
      print
    }
    END {
      if (in_options) emit_missing()
    }
  ' "$input" > "$output"
}

pacman_conf_needs_changes() {
  local file="${HYPRLAZY_PACMAN_CONF:-/etc/pacman.conf}"
  [[ -r "$file" ]] || return 0
  grep -Eq '^[[:space:]]*Color[[:space:]]*$' "$file" || return 0
  grep -Eq '^[[:space:]]*ILoveCandy[[:space:]]*$' "$file" || return 0
  grep -Eq '^[[:space:]]*ParallelDownloads[[:space:]]*=[[:space:]]*5[[:space:]]*$' "$file" || return 0
  return 1
}

configure_pacman() {
  local file="${HYPRLAZY_PACMAN_CONF:-/etc/pacman.conf}"
  [[ -f "$file" ]] || die "pacman.conf was not found at $file"

  if ! pacman_conf_needs_changes; then
    ok "pacman.conf already has Color, ILoveCandy and ParallelDownloads = 5."
    return 0
  fi

  section "Pacman"
  info "Enabling Color, ILoveCandy and ParallelDownloads = 5."
  backup_system_file "$file"

  local temp
  temp="$(mktemp)"
  render_pacman_conf "$file" "$temp"

  if [[ "$file" == /etc/* ]]; then
    sudo install -m 644 "$temp" "$file"
  else
    install -m 644 "$temp" "$file"
  fi
  rm -f "$temp"
  ok "pacman.conf updated safely; repository and mirror sections were left intact."
}
