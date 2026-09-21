#!/usr/bin/env bash

# HyprL4zy installer/updater for Arch Linux.

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export HYPRLAZY_ROOT="$ROOT"

# shellcheck source=installer/lib/common.sh
source "$ROOT/installer/lib/common.sh"
source "$ROOT/installer/modules/pacman.sh"
source "$ROOT/installer/modules/packages.sh"
source "$ROOT/installer/modules/dotfiles.sh"
source "$ROOT/installer/modules/shell.sh"
source "$ROOT/installer/modules/services.sh"
source "$ROOT/installer/modules/sddm.sh"
source "$ROOT/installer/modules/doctor.sh"
source "$ROOT/installer/modules/backups.sh"

usage() {
  cat <<'USAGE'
HyprL4zy installer

Usage:
  ./install.sh list [--minimal]
  ./install.sh plan [--minimal] [--with-sddm|--without-sddm]
  ./install.sh install [--minimal] [--yes] [--with-sddm|--without-sddm]
  ./install.sh update [--minimal] [--yes] [--with-sddm|--without-sddm]
  ./install.sh doctor
  ./install.sh backups
  ./install.sh restore [latest|BACKUP_PATH]

Options:
  --minimal       Skip the optional user-facing programs manifest.
  --yes, -y       Accept package-manager prompts and the Zsh shell change.
  --with-sddm     Install Dynamic Bubble, or explicitly refresh it when already installed.
  --without-sddm  Never touch SDDM.

Default SDDM behavior:
  - Existing Dynamic Bubble install: detect it and leave it untouched.
  - Theme missing + interactive run: ask once.
  - Theme missing + unattended run: skip it unless --with-sddm is provided.

Update behavior:
  - Synchronizes only changed managed dotfiles.
  - Preserves local.conf and Quickshell settings.json.
  - Removes files managed by an older HyprL4zy release only when they disappeared
    from the new source manifest.
  - Ensures paru is installed and uses it as the only AUR helper.
  - Installs only missing package requirements.
  - Preserves user-removed optional desktop/AUR programs instead of reinstalling them.
  - Skips pacman -Syu when no new pacman packages are required.

Run as a normal user. sudo is requested only for package/system changes.
USAGE
}

parse_options() {
  local arg
  HYPRLAZY_SDDM_CHOICE="${HYPRLAZY_SDDM_CHOICE:-auto}"
  HYPRLAZY_SDDM_EXPLICIT="${HYPRLAZY_SDDM_EXPLICIT:-0}"
  for arg in "$@"; do
    case "$arg" in
      --yes|-y) HYPRLAZY_ASSUME_YES=1 ;;
      --minimal) HYPRLAZY_MINIMAL=1 ;;
      --with-sddm) HYPRLAZY_SDDM_CHOICE=yes; HYPRLAZY_SDDM_EXPLICIT=1 ;;
      --without-sddm) HYPRLAZY_SDDM_CHOICE=no; HYPRLAZY_SDDM_EXPLICIT=1 ;;
      --help|-h) usage; exit 0 ;;
      --*) die "Unknown option: $arg" ;;
      *) ;;
    esac
  done
  export HYPRLAZY_ASSUME_YES HYPRLAZY_MINIMAL HYPRLAZY_SDDM_CHOICE HYPRLAZY_SDDM_EXPLICIT
}

print_lists() {
  section "Required AUR helper"
  printf 'paru\n'
  section "Official runtime packages"
  read_manifest "$HYPRLAZY_MANIFEST_DIR/packages-official.txt"
  if [[ "$HYPRLAZY_MINIMAL" != 1 ]]; then
    section "Programs"
    read_manifest "$HYPRLAZY_MANIFEST_DIR/packages-programs.txt"
  fi
  section "Required AUR packages"
  read_manifest "$HYPRLAZY_MANIFEST_DIR/packages-aur.txt"
  section "Optional AUR packages"
  read_manifest "$HYPRLAZY_MANIFEST_DIR/packages-aur-optional.txt"
}

run_plan() {
  require_arch
  section "HyprL4zy install/update plan"
  print_package_plan
  printf '\nPacman changes:\n'
  if pacman_conf_needs_changes; then
    printf '  enable Color\n  enable ILoveCandy\n  set ParallelDownloads = 5\n'
  else
    printf '  already configured\n'
  fi
  printf '\nDotfiles:\n'
  print_dotfile_plan
  printf '\nServices:\n'
  printf '  use existing NetworkManager/iwd stack, enabling NetworkManager only when no alternative is active\n'
  printf '  enable/start bluetooth.service only when needed\n'
  printf '  enable/start power-profiles-daemon only when no conflicting power manager is active\n'
  printf '\nShell:\n'
  printf '  install Oh My Zsh if missing\n'
  printf '  preserve existing Oh My Zsh checkout on dotfile updates\n'
  printf '  offer to set Zsh as default only on initial install\n'
  print_sddm_plan
}

record_install_state() {
  ensure_state_dirs
  local revision="archive"
  if git -C "$HYPRLAZY_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    revision="$(git -C "$HYPRLAZY_ROOT" rev-parse HEAD 2>/dev/null || printf 'git-unknown')"
  fi
  printf '%s\n' "$revision" > "$HYPRLAZY_STATE_DIR/source-revision"
  date --iso-8601=seconds > "$HYPRLAZY_STATE_DIR/last-successful-run"
}

run_install() {
  require_non_root
  require_arch
  require_sudo
  acquire_installer_lock
  HYPRLAZY_INSTALL_MODE=install
  export HYPRLAZY_INSTALL_MODE
  resolve_sddm_choice
  ensure_state_dirs

  configure_pacman
  install_bootstrap_packages install
  install_official_packages
  install_paru
  install_aur_packages
  install_dotfiles
  install_oh_my_zsh
  set_default_shell
  configure_services
  install_optional_sddm
  record_install_state

  section "Finished"
  ok "HyprL4zy installation completed."
  print_backup_result
  printf 'Run ./install.sh doctor to verify the installation.\n'
  printf 'Select a wallpaper in Wallpaper Studio to generate the first Pywal palette.\n'
  printf 'Open a new Zsh session and run: p10k configure  (only when ~/.p10k.zsh is absent).\n'
}

run_update() {
  require_non_root
  require_arch
  require_sudo
  acquire_installer_lock
  HYPRLAZY_INSTALL_MODE=update
  export HYPRLAZY_INSTALL_MODE
  resolve_sddm_choice
  ensure_state_dirs

  configure_pacman
  install_bootstrap_packages update
  install_official_packages
  install_paru
  install_aur_packages
  install_dotfiles
  install_oh_my_zsh
  configure_services
  install_optional_sddm
  record_install_state

  section "Updated"
  ok "HyprL4zy synchronized to this source tree."
  printf 'Machine-local monitor settings, weather/wallpaper preferences, favorites and recents were preserved.\n'
  print_backup_result
}

main() {
  local command="${1:-help}"
  shift || true
  parse_options "$@"

  case "$command" in
    list) print_lists ;;
    plan) run_plan ;;
    install) run_install ;;
    update) run_update ;;
    doctor) require_arch; run_installer_doctor ;;
    backups) list_backups ;;
    restore)
      require_non_root
      require_arch
      require_sudo
      acquire_installer_lock
      restore_backup "${1:-latest}"
      ;;
    help|--help|-h) usage ;;
    *) usage >&2; exit 2 ;;
  esac
}

main "$@"
