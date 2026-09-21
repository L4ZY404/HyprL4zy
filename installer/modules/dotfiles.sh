#!/usr/bin/env bash

# Install/update managed user configuration while preserving machine-local state.

set -euo pipefail

managed_manifest_path() {
  printf '%s' "$HYPRLAZY_STATE_DIR/managed-home-files.txt"
}

is_wallpaper_seed_path() {
  local relative="$1"
  [[ "$relative" == Pictures/Wallpapers/* ]]
}

build_source_manifest() {
  local output="$1"
  (
    cd "$HYPRLAZY_ROOT/home"
    find . \( -type f -o -type l \) ! -name '.gitkeep' -print \
      | sed 's#^\./##' \
      | LC_ALL=C sort
  ) > "$output"
}

remove_obsolete_managed_files() {
  local new_manifest="$1"
  local old_manifest
  old_manifest="$(managed_manifest_path)"
  [[ -f "$old_manifest" ]] || return 0

  local relative target removed=0
  while IFS= read -r relative; do
    [[ -n "$relative" ]] || continue
    grep -Fxq -- "$relative" "$new_manifest" && continue
    is_preserved_home_path "$relative" && continue
    is_wallpaper_seed_path "$relative" && continue
    target="$HOME/$relative"
    if [[ -e "$target" || -L "$target" ]]; then
      backup_home_path "$relative"
      rm -f -- "$target"
      info "Removed obsolete managed file: ~/$relative"
      ((removed += 1))
    fi
  done < "$old_manifest"

  # Old installer generations may leave empty AGS directories behind after all
  # managed files are retired. Remove only empty directories, never user data.
  if [[ -d "$HOME/.config/ags" ]]; then
    find "$HOME/.config/ags" -depth -type d -empty -delete 2>/dev/null || true
  fi

  HYPRLAZY_DOTFILES_REMOVED=$(( ${HYPRLAZY_DOTFILES_REMOVED:-0} + removed ))
}

create_local_hypr_config() {
  local target="$HOME/.config/hypr/local.conf"
  local example="$HOME/.config/hypr/local.example.conf"
  [[ -e "$target" || -L "$target" ]] && return 0
  [[ -f "$example" ]] || { warn "Missing local Hyprland example: $example"; return 0; }

  start_backup
  printf '%s\n' '.config/hypr/local.conf' >> "$HYPRLAZY_CURRENT_BACKUP/metadata/created-home-files.txt"
  cp -a "$example" "$target"
  info "Created ~/.config/hypr/local.conf from the portable example."
}

create_quickshell_settings() {
  local target="$HOME/.config/quickshell/hyprl4zy/settings.json"
  local example="$HOME/.config/quickshell/hyprl4zy/settings.example.json"
  [[ -e "$target" || -L "$target" ]] && return 0
  [[ -f "$example" ]] || { warn "Missing Quickshell settings example: $example"; return 0; }

  start_backup
  printf '%s\n' '.config/quickshell/hyprl4zy/settings.json' >> "$HYPRLAZY_CURRENT_BACKUP/metadata/created-home-files.txt"

  python3 - "$example" "$target" "$HOME" <<'PY'
import json
import os
import sys
source, target, home = sys.argv[1:]
with open(source, 'r', encoding='utf-8') as handle:
    data = json.load(handle)
data['wallpaperDirectory'] = os.path.join(home, 'Pictures', 'Wallpapers')
data['currentWallpaper'] = ''
with open(target, 'w', encoding='utf-8') as handle:
    json.dump(data, handle, indent=2)
    handle.write('\n')
PY
  chmod 600 "$target" 2>/dev/null || true
  info "Created local Quickshell settings with a portable wallpaper path."
}

migrate_legacy_settings_paths() {
  local relative='.config/quickshell/hyprl4zy/settings.json'
  local target="$HOME/$relative"
  [[ -f "$target" ]] || return 0
  [[ "$HOME" != '/home/l4zy' ]] || return 0
  grep -Fq '/home/l4zy/' "$target" || return 0

  backup_home_path "$relative"
  python3 - "$target" "$HOME" <<'PY'
import json
import os
import sys
path, home = sys.argv[1:]
with open(path, 'r', encoding='utf-8') as handle:
    data = json.load(handle)
old = '/home/l4zy/'
changed = False
for key in ('wallpaperDirectory', 'currentWallpaper'):
    value = data.get(key)
    if isinstance(value, str) and value.startswith(old):
        candidate = os.path.join(home, value[len(old):])
        if key == 'currentWallpaper' and not os.path.exists(candidate):
            candidate = ''
        data[key] = candidate
        changed = True
if changed:
    with open(path, 'w', encoding='utf-8') as handle:
        json.dump(data, handle, indent=2)
        handle.write('\n')
PY
  info "Migrated legacy /home/l4zy paths in Quickshell settings."
}

install_dotfiles() {
  section "Dotfiles"
  ensure_state_dirs
  HYPRLAZY_DOTFILES_ADDED=0
  HYPRLAZY_DOTFILES_UPDATED=0
  HYPRLAZY_DOTFILES_REMOVED=0
  HYPRLAZY_DOTFILES_PRESERVED=0

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
      ((HYPRLAZY_DOTFILES_PRESERVED += 1))
      continue
    fi

    # Wallpapers shipped with the repo are seed content: add missing files,
    # but never replace a user's existing wallpaper with the same name.
    if is_wallpaper_seed_path "$relative" && [[ -e "$target" || -L "$target" ]]; then
      ((HYPRLAZY_DOTFILES_PRESERVED += 1))
      continue
    fi

    if [[ -e "$target" || -L "$target" ]]; then
      if paths_equal "$source" "$target"; then
        continue
      fi
      backup_home_path "$relative"
      ((HYPRLAZY_DOTFILES_UPDATED += 1))
    else
      start_backup
      printf '%s\n' "$relative" >> "$HYPRLAZY_CURRENT_BACKUP/metadata/created-home-files.txt"
      ((HYPRLAZY_DOTFILES_ADDED += 1))
    fi

    mkdir -p "$(dirname "$target")"
    rm -f -- "$target"
    cp -a -- "$source" "$target"
  done < "$new_manifest"

  cp -f -- "$new_manifest" "$(managed_manifest_path)"
  rm -f "$new_manifest"

  mkdir -p "$HOME/Pictures/Screenshots" "$HOME/Pictures/Wallpapers"
  create_local_hypr_config
  create_quickshell_settings
  migrate_legacy_settings_paths

  [[ -d "$HOME/.config/hypr/scripts" ]] && find "$HOME/.config/hypr/scripts" -type f -name '*.sh' -exec chmod +x {} +
  [[ -d "$HOME/.config/quickshell/hyprl4zy" ]] && find "$HOME/.config/quickshell/hyprl4zy" -type f -name '*.sh' -exec chmod +x {} +

  ok "Dotfiles synchronized: ${HYPRLAZY_DOTFILES_ADDED} added, ${HYPRLAZY_DOTFILES_UPDATED} updated, ${HYPRLAZY_DOTFILES_REMOVED} obsolete removed, ${HYPRLAZY_DOTFILES_PRESERVED} local-state files preserved."
}

print_dotfile_plan() {
  printf 'Managed source root: %s/home\n' "$HYPRLAZY_ROOT"
  printf 'Destination root:    %s\n' "$HOME"
  printf 'Preserved on update:\n'
  read_manifest "$HYPRLAZY_MANIFEST_DIR/preserve-home.txt" | sed 's/^/  ~\//'
  printf 'Machine-local files created once:\n'
  printf '  ~/.config/hypr/local.conf\n'
  printf '  ~/.config/quickshell/hyprl4zy/settings.json\n'

  local manifest relative source target changes=0
  manifest="$(mktemp)"
  build_source_manifest "$manifest"
  while IFS= read -r relative; do
    [[ -n "$relative" ]] || continue
    source="$HYPRLAZY_ROOT/home/$relative"
    target="$HOME/$relative"
    if is_preserved_home_path "$relative" && [[ -e "$target" || -L "$target" ]]; then
      continue
    fi
    if is_wallpaper_seed_path "$relative" && [[ -e "$target" || -L "$target" ]]; then
      continue
    fi
    if [[ ! -e "$target" && ! -L "$target" ]]; then
      if is_wallpaper_seed_path "$relative"; then
        printf '  SEED    ~/%s\n' "$relative"
      else
        printf '  ADD     ~/%s\n' "$relative"
      fi
      ((changes += 1))
    elif ! paths_equal "$source" "$target"; then
      printf '  UPDATE  ~/%s\n' "$relative"
      ((changes += 1))
    fi
  done < "$manifest"
  rm -f "$manifest"
  ((changes > 0)) || printf '  no managed file changes detected\n'
}
