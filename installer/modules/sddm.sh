#!/usr/bin/env bash

# Optional SDDM + Dynamic Bubble integration for HyprLazy.

set -euo pipefail

HYPRLAZY_SDDM_CHOICE="${HYPRLAZY_SDDM_CHOICE:-ask}"
HYPRLAZY_SDDM_REPO="${HYPRLAZY_SDDM_REPO:-https://github.com/L4ZY404/SDDM-THEME-Dynamic_bubble.git}"
HYPRLAZY_SDDM_REF="${HYPRLAZY_SDDM_REF:-}"
HYPRLAZY_SDDM_THEME_NAME="Dynamic_bubble"
HYPRLAZY_SDDM_THEME_DIR="/usr/share/sddm/themes/$HYPRLAZY_SDDM_THEME_NAME"
HYPRLAZY_SDDM_CACHE_DIR="/var/cache/sddm-theme"
HYPRLAZY_SDDM_CONFIG="/etc/sddm.conf.d/90-hyprlazy-theme.conf"
HYPRLAZY_SDDM_MAIN_CONFIG="/etc/sddm.conf"

sddm_theme_installed() {
  [[ -f "$HYPRLAZY_SDDM_THEME_DIR/Main.qml" ]]
}

resolve_sddm_choice() {
  case "$HYPRLAZY_SDDM_CHOICE" in
    yes|no) return 0 ;;
    ask) ;;
    *) die "Invalid SDDM choice: $HYPRLAZY_SDDM_CHOICE" ;;
  esac

  # Optional system components are never selected implicitly in unattended mode.
  if [[ ! -t 0 ]]; then
    HYPRLAZY_SDDM_CHOICE="no"
    export HYPRLAZY_SDDM_CHOICE
    return 0
  fi

  printf 'Install the optional HyprLazy SDDM theme (Dynamic Bubble)? [y/N] '
  local answer=""
  read -r answer || true
  if [[ "$answer" =~ ^[Yy]([Ee][Ss])?$ ]]; then
    HYPRLAZY_SDDM_CHOICE="yes"
  else
    HYPRLAZY_SDDM_CHOICE="no"
  fi
  export HYPRLAZY_SDDM_CHOICE
}

print_sddm_plan() {
  printf '\nOptional SDDM integration:\n'
  case "$HYPRLAZY_SDDM_CHOICE" in
    yes) printf '  install SDDM and Dynamic Bubble\n' ;;
    no) printf '  skip SDDM integration\n' ;;
    *) printf '  ask during install (default: no)\n' ;;
  esac
  printf '  theme source: %s\n' "$HYPRLAZY_SDDM_REPO"
  printf '  theme destination: %s\n' "$HYPRLAZY_SDDM_THEME_DIR"
  printf '  SDDM config: %s\n' "$HYPRLAZY_SDDM_CONFIG"
}

find_sddm_theme_source() {
  local checkout="$1"
  local candidate
  for candidate in \
    "$checkout/$HYPRLAZY_SDDM_THEME_NAME" \
    "$checkout/Dynamic-bubble" \
    "$checkout/DynamicBubble" \
    "$checkout"; do
    if [[ -f "$candidate/Main.qml" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  local matches=()
  mapfile -t matches < <(find "$checkout" -mindepth 1 -maxdepth 4 -type f -name Main.qml -print 2>/dev/null | LC_ALL=C sort)
  if ((${#matches[@]} == 1)); then
    dirname "${matches[0]}"
    return 0
  fi

  return 1
}

install_sddm_packages() {
  local theme_source="$1"
  local packages=(sddm)

  if grep -RqsE '^import[[:space:]]+QtMultimedia' "$theme_source"; then
    packages+=(qt6-multimedia)
  fi
  if grep -RqsE '^import[[:space:]]+QtQuick\.VirtualKeyboard' "$theme_source"; then
    packages+=(qt6-virtualkeyboard)
  fi
  if grep -RqsE '^import[[:space:]]+Qt5Compat\.GraphicalEffects' "$theme_source"; then
    packages+=(qt6-5compat)
  fi
  if grep -RqsE '^import[[:space:]]+QtSvg' "$theme_source" || find "$theme_source" -type f -iname '*.svg' -print -quit | grep -q .; then
    packages+=(qt6-svg)
  fi

  local flags=()
  mapfile -t flags < <(pacman_flags)
  sudo pacman -S --needed "${flags[@]}" "${packages[@]}"
}

backup_sddm_state() {
  start_backup

  if [[ -e "$HYPRLAZY_SDDM_THEME_DIR" || -L "$HYPRLAZY_SDDM_THEME_DIR" ]]; then
    backup_system_file "$HYPRLAZY_SDDM_THEME_DIR"
  else
    : > "$HYPRLAZY_CURRENT_BACKUP/metadata/sddm-theme.was-absent"
  fi

  if [[ -e "$HYPRLAZY_SDDM_CONFIG" || -L "$HYPRLAZY_SDDM_CONFIG" ]]; then
    backup_system_file "$HYPRLAZY_SDDM_CONFIG"
  else
    : > "$HYPRLAZY_CURRENT_BACKUP/metadata/sddm-config.was-absent"
  fi

  if [[ -f "$HYPRLAZY_SDDM_MAIN_CONFIG" ]]; then
    backup_system_file "$HYPRLAZY_SDDM_MAIN_CONFIG"
  fi

  if [[ -e "$HYPRLAZY_SDDM_CACHE_DIR" || -L "$HYPRLAZY_SDDM_CACHE_DIR" ]]; then
    backup_system_file "$HYPRLAZY_SDDM_CACHE_DIR"
  else
    : > "$HYPRLAZY_CURRENT_BACKUP/metadata/sddm-cache.was-absent"
  fi

  if systemctl is-enabled --quiet sddm.service 2>/dev/null; then
    printf 'enabled\n' > "$HYPRLAZY_CURRENT_BACKUP/metadata/sddm-service.before"
  else
    printf 'disabled\n' > "$HYPRLAZY_CURRENT_BACKUP/metadata/sddm-service.before"
  fi
}

prepare_sddm_cache() {
  local user_name group_name had_theme_conf=0
  user_name="$(id -un)"
  group_name="$(id -gn)"
  [[ -f "$HYPRLAZY_SDDM_CACHE_DIR/theme.conf" ]] && had_theme_conf=1

  sudo install -d -m 0755 "$HYPRLAZY_SDDM_CACHE_DIR"
  sudo chown -R "$user_name:$group_name" "$HYPRLAZY_SDDM_CACHE_DIR"
  chmod 0755 "$HYPRLAZY_SDDM_CACHE_DIR"

  if ((had_theme_conf == 0)); then
    if sudo test -f "$HYPRLAZY_SDDM_THEME_DIR/theme.conf"; then
      sudo cat "$HYPRLAZY_SDDM_THEME_DIR/theme.conf" > "$HYPRLAZY_SDDM_CACHE_DIR/theme.conf"
    else
      cat > "$HYPRLAZY_SDDM_CACHE_DIR/theme.conf" <<'THEME'
[General]
mode=pro
background=/var/cache/sddm-theme/current_wallpaper.jpg
background_color=#111111
color11=#f5c2e7
username=
THEME
    fi
  fi
  chmod 0644 "$HYPRLAZY_SDDM_CACHE_DIR/theme.conf"
}

install_sddm_theme_files() {
  local theme_source="$1"

  sudo rm -rf -- "$HYPRLAZY_SDDM_THEME_DIR"
  sudo install -d -m 0755 "$HYPRLAZY_SDDM_THEME_DIR"

  # Avoid copying the source repository metadata when the theme lives at repo root.
  tar -C "$theme_source" --exclude='.git' -cf - . | sudo tar -C "$HYPRLAZY_SDDM_THEME_DIR" -xf -
  sudo chown -R root:root "$HYPRLAZY_SDDM_THEME_DIR"
  sudo chmod -R u=rwX,go=rX "$HYPRLAZY_SDDM_THEME_DIR"

  [[ -f "$HYPRLAZY_SDDM_THEME_DIR/Main.qml" ]] || die "Dynamic Bubble does not contain Main.qml after installation."

  prepare_sddm_cache

  # Runtime configuration lives in /var/cache so the desktop user never
  # needs write access to /usr/share/sddm/themes.
  sudo rm -f -- "$HYPRLAZY_SDDM_THEME_DIR/theme.conf"
  sudo ln -s "$HYPRLAZY_SDDM_CACHE_DIR/theme.conf" "$HYPRLAZY_SDDM_THEME_DIR/theme.conf"
}

render_sddm_main_config() {
  local source="$1"
  local destination="$2"
  awk -v theme="$HYPRLAZY_SDDM_THEME_NAME" '
    function emit_current() {
      if (in_theme && !current_written) {
        print "Current=" theme
        current_written=1
      }
    }
    /^[[:space:]]*\[[^]]+\][[:space:]]*$/ {
      if (in_theme) emit_current()
      in_theme = ($0 ~ /^[[:space:]]*\[Theme\][[:space:]]*$/)
      if (in_theme) {
        saw_theme=1
        current_written=0
      }
      print
      next
    }
    {
      if (in_theme && $0 ~ /^[[:space:]]*Current[[:space:]]*=/) {
        if (!current_written) {
          print "Current=" theme
          current_written=1
        }
        next
      }
      print
    }
    END {
      if (in_theme) emit_current()
      if (!saw_theme) {
        print ""
        print "[Theme]"
        print "Current=" theme
      }
    }
  ' "$source" > "$destination"
}

configure_sddm_theme() {
  local temporary
  temporary="$(mktemp)"
  cat > "$temporary" <<EOF_CONFIG
# Managed by HyprLazy. Remove this file to stop overriding the SDDM theme.
[Theme]
Current=$HYPRLAZY_SDDM_THEME_NAME
EOF_CONFIG
  sudo install -D -m 0644 "$temporary" "$HYPRLAZY_SDDM_CONFIG"
  rm -f "$temporary"

  # /etc/sddm.conf has higher precedence than /etc/sddm.conf.d. Preserve the
  # file when it exists, changing only the Theme/Current value.
  if [[ -f "$HYPRLAZY_SDDM_MAIN_CONFIG" ]]; then
    temporary="$(mktemp)"
    render_sddm_main_config "$HYPRLAZY_SDDM_MAIN_CONFIG" "$temporary"
    sudo install -m 0644 "$temporary" "$HYPRLAZY_SDDM_MAIN_CONFIG"
    rm -f "$temporary"
  fi
}

enable_sddm_if_safe() {
  local display_manager_link="/etc/systemd/system/display-manager.service"
  local current=""
  if [[ -L "$display_manager_link" ]]; then
    current="$(basename "$(readlink -f "$display_manager_link")")"
  fi

  if [[ -n "$current" && "$current" != "sddm.service" ]]; then
    warn "Another display manager is configured ($current)."
    warn "Dynamic Bubble was installed, but HyprLazy did not replace your active display manager."
    return 0
  fi

  if sudo systemctl enable sddm.service >/dev/null 2>&1; then
    ok "SDDM enabled for the next boot."
  else
    warn "Could not enable sddm.service automatically."
  fi
}

sync_sddm_theme_once() {
  local sync_script="$HOME/.config/ags/scripts/theme/sddm_sync.sh"
  if [[ -x "$sync_script" && -f "${XDG_CACHE_HOME:-$HOME/.cache}/wal/colors" ]]; then
    "$sync_script" || warn "Initial Dynamic Bubble Pywal sync failed; it will retry after the next wallpaper change."
  else
    info "Dynamic Bubble will receive its first Pywal palette after you select a wallpaper in Theme Studio."
  fi
}

install_optional_sddm() {
  [[ "$HYPRLAZY_SDDM_CHOICE" == yes ]] || {
    info "Skipping optional SDDM integration."
    return 0
  }

  section "Optional SDDM"
  local checkout
  checkout="$(mktemp -d)"
  trap 'rm -rf "$checkout"' RETURN

  info "Fetching Dynamic Bubble from $HYPRLAZY_SDDM_REPO"
  git clone --depth=1 "$HYPRLAZY_SDDM_REPO" "$checkout/theme"
  if [[ -n "$HYPRLAZY_SDDM_REF" ]]; then
    git -C "$checkout/theme" fetch --depth=1 origin "$HYPRLAZY_SDDM_REF"
    git -C "$checkout/theme" checkout --detach FETCH_HEAD
  fi

  local theme_source
  theme_source="$(find_sddm_theme_source "$checkout/theme")" || \
    die "Could not locate Main.qml in the Dynamic Bubble repository."

  install_sddm_packages "$theme_source"
  backup_sddm_state
  install_sddm_theme_files "$theme_source"
  configure_sddm_theme
  enable_sddm_if_safe
  sync_sddm_theme_once

  local commit="unknown"
  commit="$(git -C "$checkout/theme" rev-parse HEAD 2>/dev/null || printf 'unknown')"
  printf '%s\n' "$commit" > "$HYPRLAZY_STATE_DIR/sddm-theme-commit"

  ok "Dynamic Bubble installed as the HyprLazy SDDM theme."
  trap - RETURN
  rm -rf "$checkout"
}
