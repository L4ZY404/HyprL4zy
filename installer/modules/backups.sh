#!/usr/bin/env bash

# Backup listing and restoration.

set -euo pipefail

list_backups() {
  ensure_state_dirs
  section "Backups"
  local found=0
  local directory
  while IFS= read -r directory; do
    [[ -n "$directory" ]] || continue
    found=1
    printf '%s\n' "$directory"
  done < <(find "$HYPRLAZY_BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -print | LC_ALL=C sort -r)
  ((found)) || printf 'No HyprLazy backups found.\n'
}

resolve_backup() {
  local requested="$1"
  if [[ "$requested" == latest ]]; then
    find "$HYPRLAZY_BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -print | LC_ALL=C sort -r | head -n1
    return
  fi
  if [[ "$requested" == /* ]]; then
    printf '%s' "$requested"
  else
    printf '%s' "$HYPRLAZY_BACKUP_ROOT/$requested"
  fi
}

remove_created_home_files() {
  local backup="$1"
  local created="$backup/metadata/created-home-files.txt"
  [[ -f "$created" ]] || return 0

  local relative target
  tac "$created" | awk '!seen[$0]++' | while IFS= read -r relative; do
    [[ -n "$relative" ]] || continue
    target="$HOME/$relative"
    if [[ -e "$target" || -L "$target" ]]; then
      rm -f -- "$target"
    fi
  done
}

restore_managed_manifest() {
  local backup="$1"
  ensure_state_dirs
  if [[ -f "$backup/metadata/managed-home-files.before.txt" ]]; then
    cp -a "$backup/metadata/managed-home-files.before.txt" "$HYPRLAZY_STATE_DIR/managed-home-files.txt"
  elif [[ -f "$backup/metadata/managed-home-files.was-absent" ]]; then
    rm -f "$HYPRLAZY_STATE_DIR/managed-home-files.txt"
  fi
}

restore_backup() {
  local requested="${1:-latest}"
  local backup
  backup="$(resolve_backup "$requested")"
  [[ -n "$backup" && -d "$backup" ]] || die "Backup not found: $requested"

  section "Restore"
  info "Restoring backup: $backup"

  remove_created_home_files "$backup"

  if [[ -d "$backup/home" ]]; then
    cp -a "$backup/home/." "$HOME/"
    ok "User files restored."
  fi
  restore_managed_manifest "$backup"

  if [[ -f "$backup/system/etc/pacman.conf" ]]; then
    if confirm "Restore /etc/pacman.conf from this backup?"; then
      sudo cp -a "$backup/system/etc/pacman.conf" /etc/pacman.conf
      ok "/etc/pacman.conf restored."
    fi
  fi

  restore_sddm_state "$backup"
}

restore_sddm_path() {
  local backup="$1"
  local target="$2"
  local absent_marker="$3"
  local source="$backup/system/${target#/}"

  if [[ -e "$source" || -L "$source" ]]; then
    sudo rm -rf -- "$target"
    sudo mkdir -p "$(dirname "$target")"
    sudo cp -a -- "$source" "$target"
  elif [[ -f "$backup/metadata/$absent_marker" ]]; then
    sudo rm -rf -- "$target"
  fi
}

restore_sddm_state() {
  local backup="$1"
  local has_sddm_backup=0

  [[ -e "$backup/system/usr/share/sddm/themes/Dynamic_bubble" || \
     -e "$backup/system/etc/sddm.conf.d/90-hyprlazy-theme.conf" || \
     -e "$backup/system/etc/sddm.conf" || \
     -e "$backup/system/var/cache/sddm-theme" || \
     -f "$backup/metadata/sddm-theme.was-absent" || \
     -f "$backup/metadata/sddm-config.was-absent" || \
     -f "$backup/metadata/sddm-cache.was-absent" ]] && has_sddm_backup=1

  ((has_sddm_backup == 1)) || return 0
  confirm "Restore the SDDM theme/configuration state from this backup?" || return 0

  restore_sddm_path "$backup" "/usr/share/sddm/themes/Dynamic_bubble" "sddm-theme.was-absent"
  restore_sddm_path "$backup" "/etc/sddm.conf.d/90-hyprlazy-theme.conf" "sddm-config.was-absent"
  if [[ -f "$backup/system/etc/sddm.conf" ]]; then
    sudo cp -a -- "$backup/system/etc/sddm.conf" /etc/sddm.conf
  fi
  restore_sddm_path "$backup" "/var/cache/sddm-theme" "sddm-cache.was-absent"

  if [[ -f "$backup/metadata/sddm-service.before" ]]; then
    case "$(<"$backup/metadata/sddm-service.before")" in
      enabled) sudo systemctl enable sddm.service >/dev/null 2>&1 || true ;;
      disabled) sudo systemctl disable sddm.service >/dev/null 2>&1 || true ;;
    esac
  fi

  ok "SDDM state restored."
}
