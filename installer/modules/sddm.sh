#!/usr/bin/env bash

# Optional Dynamic Bubble SDDM integration.
# Dynamic Bubble owns its installation logic; HyprLazy only asks the user,
# captures a rollback snapshot, clones the upstream repository and runs it.

set -euo pipefail

HYPRLAZY_SDDM_CHOICE="${HYPRLAZY_SDDM_CHOICE:-ask}"
HYPRLAZY_SDDM_REPO="${HYPRLAZY_SDDM_REPO:-https://github.com/L4ZY404/SDDM-THEME-Dynamic_bubble.git}"
HYPRLAZY_SDDM_REF="${HYPRLAZY_SDDM_REF:-}"
HYPRLAZY_SDDM_THEME_NAME="Dynamic_bubble"
HYPRLAZY_SDDM_THEME_DIR="/usr/share/sddm/themes/$HYPRLAZY_SDDM_THEME_NAME"
HYPRLAZY_SDDM_CACHE_DIR="/var/cache/sddm-theme"
HYPRLAZY_SDDM_CONFIG="/etc/sddm.conf.d/90-dynamic-bubble.conf"
HYPRLAZY_SDDM_LEGACY_CONFIG="/etc/sddm.conf.d/90-hyprlazy-theme.conf"
HYPRLAZY_SDDM_MAIN_CONFIG="/etc/sddm.conf"
HYPRLAZY_SDDM_SYNC_BIN="/usr/local/bin/dynamic-bubble-sync"

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
    yes) printf '  clone Dynamic Bubble and run its standalone installer\n' ;;
    no) printf '  skip SDDM integration\n' ;;
    *) printf '  ask during install (default: no)\n' ;;
  esac
  printf '  repository: %s\n' "$HYPRLAZY_SDDM_REPO"
  printf '  theme destination: %s\n' "$HYPRLAZY_SDDM_THEME_DIR"
}

backup_or_mark_system_path() {
  local path="$1"
  local absent_marker="$2"
  if [[ -e "$path" || -L "$path" ]]; then
    backup_system_file "$path"
  else
    : > "$HYPRLAZY_CURRENT_BACKUP/metadata/$absent_marker"
  fi
}

backup_or_mark_home_path() {
  local relative="$1"
  local target="$HOME/$relative"
  if [[ -e "$target" || -L "$target" ]]; then
    backup_home_path "$relative"
  else
    start_backup
    printf '%s\n' "$relative" >> "$HYPRLAZY_CURRENT_BACKUP/metadata/created-home-files.txt"
  fi
}

backup_sddm_state() {
  start_backup
  backup_or_mark_system_path "$HYPRLAZY_SDDM_THEME_DIR" "sddm-theme.was-absent"
  backup_or_mark_system_path "$HYPRLAZY_SDDM_CONFIG" "sddm-config.was-absent"
  backup_or_mark_system_path "$HYPRLAZY_SDDM_LEGACY_CONFIG" "sddm-legacy-config.was-absent"
  backup_or_mark_system_path "$HYPRLAZY_SDDM_CACHE_DIR" "sddm-cache.was-absent"
  backup_or_mark_system_path "$HYPRLAZY_SDDM_SYNC_BIN" "sddm-sync-bin.was-absent"

  if [[ -f "$HYPRLAZY_SDDM_MAIN_CONFIG" ]]; then
    backup_system_file "$HYPRLAZY_SDDM_MAIN_CONFIG"
  else
    : > "$HYPRLAZY_CURRENT_BACKUP/metadata/sddm-main-config.was-absent"
  fi

  backup_or_mark_home_path ".config/systemd/user/dynamic-bubble-sync.service"
  backup_or_mark_home_path ".config/systemd/user/dynamic-bubble-sync.path"
  backup_or_mark_home_path ".config/systemd/user/default.target.wants/dynamic-bubble-sync.path"

  if systemctl is-enabled --quiet sddm.service 2>/dev/null; then
    printf 'enabled\n' > "$HYPRLAZY_CURRENT_BACKUP/metadata/sddm-service.before"
  else
    printf 'disabled\n' > "$HYPRLAZY_CURRENT_BACKUP/metadata/sddm-service.before"
  fi
}

install_optional_sddm() {
  [[ "$HYPRLAZY_SDDM_CHOICE" == yes ]] || {
    info "Skipping optional SDDM integration."
    return 0
  }

  section "Optional SDDM"
  backup_sddm_state

  local checkout
  checkout="$(mktemp -d)"

  info "Fetching Dynamic Bubble from $HYPRLAZY_SDDM_REPO"
  if ! git clone --depth=1 "$HYPRLAZY_SDDM_REPO" "$checkout/theme"; then
    rm -rf "$checkout"
    warn "Dynamic Bubble could not be cloned. SDDM is optional, so the HyprLazy installation will continue."
    return 0
  fi

  if [[ -n "$HYPRLAZY_SDDM_REF" ]]; then
    if ! git -C "$checkout/theme" fetch --depth=1 origin "$HYPRLAZY_SDDM_REF" || \
       ! git -C "$checkout/theme" checkout --detach FETCH_HEAD; then
      rm -rf "$checkout"
      warn "Dynamic Bubble ref '$HYPRLAZY_SDDM_REF' could not be checked out; skipping optional SDDM setup."
      return 0
    fi
  fi

  if [[ ! -f "$checkout/theme/install.sh" ]]; then
    rm -rf "$checkout"
    warn "Dynamic Bubble does not contain install.sh; skipping optional SDDM setup."
    return 0
  fi

  local commit="unknown"
  commit="$(git -C "$checkout/theme" rev-parse HEAD 2>/dev/null || printf 'unknown')"

  info "Running Dynamic Bubble's standalone installer."
  if ! (cd "$checkout/theme" && bash ./install.sh); then
    rm -rf "$checkout"
    warn "Dynamic Bubble's installer returned an error. The main HyprLazy installation will continue."
    warn "A pre-install SDDM snapshot is available in: $HYPRLAZY_CURRENT_BACKUP"
    return 0
  fi

  rm -rf "$checkout"

  if ! sddm_theme_installed; then
    warn "Dynamic Bubble finished without an error, but Main.qml was not found in $HYPRLAZY_SDDM_THEME_DIR."
    return 0
  fi

  printf '%s\n' "$commit" > "$HYPRLAZY_STATE_DIR/sddm-theme-commit"
  ok "Dynamic Bubble installed through its own installer."
}
