#!/usr/bin/env bash

# Install and update user configuration without overwriting runtime preferences.

set -euo pipefail

managed_manifest_path() {
  printf '%s' "$HYPRLAZY_STATE_DIR/managed-home-files.txt"
}

build_source_manifest() {
  local output="$1"
  (
    cd "$HYPRLAZY_ROOT/home"
    find . \( -type f -o -type l \) -print \
      | sed 's#^\./##' \
      | LC_ALL=C sort
  ) > "$output"
}

remove_obsolete_managed_files() {
  local new_manifest="$1"
  local old_manifest
  old_manifest="$(managed_manifest_path)"
  [[ -f "$old_manifest" ]] || return 0

  local relative target
  while IFS= read -r relative; do
    [[ -n "$relative" ]] || continue
    grep -Fxq -- "$relative" "$new_manifest" && continue
    is_preserved_home_path "$relative" && continue
    target="$HOME/$relative"
    if [[ -e "$target" || -L "$target" ]]; then
      backup_home_path "$relative"
      rm -f -- "$target"
      info "Removed obsolete managed file: ~/$relative"
    fi
  done < "$old_manifest"
}

install_dotfiles() {
  section "Dotfiles"
  ensure_state_dirs

  local new_manifest
  new_manifest="$(mktemp)"
  build_source_manifest "$new_manifest"
  remove_obsolete_managed_files "$new_manifest"

  local relative source target
  while IFS= read -r relative; do
    [[ -n "$relative" ]] || continue
    source="$HYPRLAZY_ROOT/home/$relative"
    target="$HOME/$relative"

    if is_preserved_home_path "$relative" && [[ -e "$target" || -L "$target" ]]; then
      info "Preserved runtime state: ~/$relative"
      continue
    fi

    if [[ -e "$target" || -L "$target" ]]; then
      if cmp -s -- "$source" "$target" 2>/dev/null; then
        continue
      fi
      backup_home_path "$relative"
    else
      start_backup
      printf '%s\n' "$relative" >> "$HYPRLAZY_CURRENT_BACKUP/metadata/created-home-files.txt"
    fi

    mkdir -p "$(dirname "$target")"
    rm -f -- "$target"
    cp -a -- "$source" "$target"
  done < "$new_manifest"

  cp -f -- "$new_manifest" "$(managed_manifest_path)"
  rm -f "$new_manifest"

  local ags_local="$HOME/.config/ags/local.json"
  local hypr_local="$HOME/.config/hypr/local.conf"
  if [[ ! -e "$ags_local" ]]; then
    start_backup
    printf '%s\n' ".config/ags/local.json" >> "$HYPRLAZY_CURRENT_BACKUP/metadata/created-home-files.txt"
    cp -a "$HOME/.config/ags/local.example.json" "$ags_local"
    info "Created ~/.config/ags/local.json from the example."
  fi
  if [[ ! -e "$hypr_local" ]]; then
    start_backup
    printf '%s\n' ".config/hypr/local.conf" >> "$HYPRLAZY_CURRENT_BACKUP/metadata/created-home-files.txt"
    cp -a "$HOME/.config/hypr/local.example.conf" "$hypr_local"
    info "Created ~/.config/hypr/local.conf from the example."
  fi

  mkdir -p "$HOME/Pictures/Screenshots" "$HOME/Pictures/Wallpapers"
  find "$HOME/.config/ags" -type f -name '*.sh' -exec chmod +x {} +
  ok "HyprLazy user configuration installed."
}

print_dotfile_plan() {
  printf 'Managed source root: %s/home\n' "$HYPRLAZY_ROOT"
  printf 'Destination root:    %s\n' "$HOME"
  printf 'Preserved on update:\n'
  read_manifest "$HYPRLAZY_MANIFEST_DIR/preserve-home.txt" | sed 's/^/  ~\//'
  printf 'Machine-local files created once:\n'
  printf '  ~/.config/ags/local.json\n'
  printf '  ~/.config/hypr/local.conf\n'
}
