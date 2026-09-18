#!/usr/bin/env bash

# HyprLazy beta installer for Arch Linux.

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
HyprLazy installer

Usage:
  ./install.sh list [--minimal]
  ./install.sh plan [--minimal]
  ./install.sh install [--minimal] [--yes] [--with-sddm|--without-sddm]
  ./install.sh update [--minimal] [--yes] [--with-sddm|--without-sddm]
  ./install.sh doctor
  ./install.sh backups
  ./install.sh restore [latest|BACKUP_PATH]

Options:
  --minimal   Skip the user-facing programs manifest; install only rice/runtime packages.
  --yes       Accept package-manager prompts and the Zsh shell change where supported.
  --with-sddm Install/update the optional Dynamic Bubble SDDM integration.
  --without-sddm
              Skip the optional SDDM integration without asking.

Interactive install/update asks about SDDM by default. In unattended mode,
SDDM is skipped unless --with-sddm is provided.

The installer must be run as a normal user. It uses sudo only for pacman,
pacman.conf and system services.
USAGE
}

parse_options() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      --yes|-y) HYPRLAZY_ASSUME_YES=1 ;;
      --minimal) HYPRLAZY_MINIMAL=1 ;;
      --with-sddm) HYPRLAZY_SDDM_CHOICE=yes ;;
      --without-sddm) HYPRLAZY_SDDM_CHOICE=no ;;
      --help|-h) usage; exit 0 ;;
      *) ;;
    esac
  done
  export HYPRLAZY_ASSUME_YES HYPRLAZY_MINIMAL HYPRLAZY_SDDM_CHOICE
}

print_lists() {
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
  section "HyprLazy install plan"
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
  printf '  enable/start NetworkManager.service\n'
  printf '  enable/start bluetooth.service\n'
  printf '  start power-profiles-daemon.service\n'
  printf '\nShell:\n'
  printf '  install Oh My Zsh if missing\n'
  printf '  install Powerlevel10k from AUR\n'
  printf '  offer to set Zsh as the default shell\n'
  print_sddm_plan
}

run_install() {
  require_non_root
  require_arch
  resolve_sddm_choice
  ensure_state_dirs
  start_backup

  configure_pacman
  install_bootstrap_packages
  install_official_packages
  install_yay
  install_aur_packages
  install_dotfiles
  install_oh_my_zsh
  set_default_shell
  configure_services
  install_optional_sddm

  section "Finished"
  ok "HyprLazy installation completed."
  printf 'Backup: %s\n' "$HYPRLAZY_CURRENT_BACKUP"
  printf 'Run ./install.sh doctor to verify the installation.\n'
  printf 'Use nwg-look to select Catppuccin Mocha and Breeze Dark.\n'
  printf 'Open a new Zsh session and run: p10k configure  (only when ~/.p10k.zsh is absent).\n'
  printf 'Then select a wallpaper in Theme Studio to generate the first Pywal palette.\n'
}

run_update() {
  require_non_root
  require_arch
  resolve_sddm_choice
  ensure_state_dirs
  start_backup

  configure_pacman
  install_bootstrap_packages
  install_official_packages
  install_yay
  install_aur_packages
  install_dotfiles
  install_oh_my_zsh
  update_oh_my_zsh
  configure_services
  install_optional_sddm

  section "Updated"
  ok "HyprLazy files and package set were refreshed."
  printf 'Runtime Bar Editor and launcher state were preserved.\n'
  printf 'Backup: %s\n' "$HYPRLAZY_CURRENT_BACKUP"
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
    restore) require_non_root; restore_backup "${1:-latest}" ;;
    help|--help|-h) usage ;;
    *) usage >&2; exit 2 ;;
  esac
}

main "$@"
