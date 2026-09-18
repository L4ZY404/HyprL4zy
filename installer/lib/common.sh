#!/usr/bin/env bash

# Shared helpers for the HyprLazy installer.

set -euo pipefail

HYPRLAZY_ROOT="${HYPRLAZY_ROOT:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)}"
HYPRLAZY_INSTALLER_DIR="$HYPRLAZY_ROOT/installer"
HYPRLAZY_MANIFEST_DIR="$HYPRLAZY_INSTALLER_DIR/manifests"
HYPRLAZY_STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/hyprlazy"
HYPRLAZY_BACKUP_ROOT="$HYPRLAZY_STATE_DIR/backups"
HYPRLAZY_CURRENT_BACKUP="${HYPRLAZY_CURRENT_BACKUP:-}"
HYPRLAZY_ASSUME_YES="${HYPRLAZY_ASSUME_YES:-0}"
HYPRLAZY_MINIMAL="${HYPRLAZY_MINIMAL:-0}"

if [[ -t 1 ]]; then
  _c_reset=$'\033[0m'
  _c_bold=$'\033[1m'
  _c_green=$'\033[32m'
  _c_yellow=$'\033[33m'
  _c_red=$'\033[31m'
  _c_cyan=$'\033[36m'
else
  _c_reset="" _c_bold="" _c_green="" _c_yellow="" _c_red="" _c_cyan=""
fi

info() { printf '%s[INFO]%s %s\n' "$_c_cyan" "$_c_reset" "$*"; }
ok() { printf '%s[ OK ]%s %s\n' "$_c_green" "$_c_reset" "$*"; }
warn() { printf '%s[WARN]%s %s\n' "$_c_yellow" "$_c_reset" "$*" >&2; }
die() { printf '%s[FAIL]%s %s\n' "$_c_red" "$_c_reset" "$*" >&2; exit 1; }
section() { printf '\n%s== %s ==%s\n' "$_c_bold" "$*" "$_c_reset"; }

require_non_root() {
  [[ ${EUID:-$(id -u)} -ne 0 ]] || die "Run the installer as your normal user. It calls sudo only for system changes."
}

require_arch() {
  [[ -r /etc/os-release ]] || die "Unable to identify this Linux distribution."
  # shellcheck disable=SC1091
  source /etc/os-release
  [[ "${ID:-}" == "arch" || "${ID_LIKE:-}" == *arch* ]] || \
    die "HyprLazy currently supports Arch Linux and Arch-based systems only."
  command -v pacman >/dev/null 2>&1 || die "pacman was not found."
}

confirm() {
  local prompt="$1"
  if [[ "$HYPRLAZY_ASSUME_YES" == 1 ]]; then
    return 0
  fi
  printf '%s [y/N] ' "$prompt"
  local answer=""
  read -r answer || true
  [[ "$answer" =~ ^[Yy]([Ee][Ss])?$ ]]
}

read_manifest() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  sed -E 's/[[:space:]]*#.*$//; /^[[:space:]]*$/d; s/^[[:space:]]+//; s/[[:space:]]+$//' "$file"
}

array_from_manifest() {
  local file="$1"
  local -n output_ref="$2"
  mapfile -t output_ref < <(read_manifest "$file")
}

package_installed() {
  pacman -Qq "$1" >/dev/null 2>&1
}

ensure_state_dirs() {
  mkdir -p "$HYPRLAZY_STATE_DIR" "$HYPRLAZY_BACKUP_ROOT"
}

start_backup() {
  ensure_state_dirs
  if [[ -n "$HYPRLAZY_CURRENT_BACKUP" ]]; then
    return 0
  fi
  local stamp
  stamp="$(date '+%Y%m%d-%H%M%S')"
  HYPRLAZY_CURRENT_BACKUP="$HYPRLAZY_BACKUP_ROOT/$stamp"
  mkdir -p "$HYPRLAZY_CURRENT_BACKUP/home" "$HYPRLAZY_CURRENT_BACKUP/system/etc" "$HYPRLAZY_CURRENT_BACKUP/metadata"
  if [[ -f "$HYPRLAZY_STATE_DIR/managed-home-files.txt" ]]; then
    cp -a "$HYPRLAZY_STATE_DIR/managed-home-files.txt" "$HYPRLAZY_CURRENT_BACKUP/metadata/managed-home-files.before.txt"
  else
    : > "$HYPRLAZY_CURRENT_BACKUP/metadata/managed-home-files.was-absent"
  fi
  export HYPRLAZY_CURRENT_BACKUP
  printf '%s\n' "$HYPRLAZY_CURRENT_BACKUP" > "$HYPRLAZY_STATE_DIR/last-backup"
}

backup_home_path() {
  local relative="$1"
  local target="$HOME/$relative"
  [[ -e "$target" || -L "$target" ]] || return 0
  start_backup
  local destination="$HYPRLAZY_CURRENT_BACKUP/home/$relative"
  mkdir -p "$(dirname "$destination")"
  cp -a -- "$target" "$destination"
}

backup_system_file() {
  local source="$1"
  [[ -e "$source" ]] || return 0
  start_backup
  local relative="${source#/}"
  local destination="$HYPRLAZY_CURRENT_BACKUP/system/$relative"
  mkdir -p "$(dirname "$destination")"
  sudo cp -a -- "$source" "$destination"
  sudo chown -R "$(id -u):$(id -g)" "$HYPRLAZY_CURRENT_BACKUP/system" 2>/dev/null || true
}

is_preserved_home_path() {
  local relative="$1"
  local preserve_file="$HYPRLAZY_MANIFEST_DIR/preserve-home.txt"
  [[ -f "$preserve_file" ]] || return 1
  read_manifest "$preserve_file" | grep -Fxq -- "$relative"
}

command_version() {
  local command_name="$1"
  if command -v "$command_name" >/dev/null 2>&1; then
    printf '%s' "$(command -v "$command_name")"
  else
    printf '%s' "missing"
  fi
}
