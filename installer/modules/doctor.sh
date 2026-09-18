#!/usr/bin/env bash

# Installer-level health checks.

set -euo pipefail

run_installer_doctor() {
  section "HyprLazy doctor"
  local failed=0

  local commands=(
    hyprctl ags gjs sass zsh swaylock dunst
    grim slurp wl-copy wl-paste cliphist
    pactl playerctl cava brightnessctl bluetoothctl nmcli
    awww wal ffmpeg mpvpaper magick jq checkupdates
  )

  local command_name
  for command_name in "${commands[@]}"; do
    if command -v "$command_name" >/dev/null 2>&1; then
      printf 'OK       %-24s %s\n' "$command_name" "$(command -v "$command_name")"
    else
      printf 'MISSING  %s\n' "$command_name"
      failed=1
    fi
  done

  printf '\nZsh integration:\n'
  [[ -d "$HOME/.oh-my-zsh" ]] && printf 'OK       Oh My Zsh\n' || { printf 'MISSING  Oh My Zsh\n'; failed=1; }
  [[ -r /usr/share/zsh-theme-powerlevel10k/powerlevel10k.zsh-theme ]] && \
    printf 'OK       Powerlevel10k\n' || { printf 'MISSING  Powerlevel10k\n'; failed=1; }

  printf '\nPacman configuration:\n'
  if pacman_conf_needs_changes; then
    printf 'MISSING  expected Color / ILoveCandy / ParallelDownloads = 5\n'
    failed=1
  else
    printf 'OK       Color + ILoveCandy + ParallelDownloads = 5\n'
  fi

  printf '\nHyprLazy files:\n'
  local required_files=(
    "$HOME/.config/hypr/hyprland.conf"
    "$HOME/.config/ags/app.ts"
    "$HOME/.config/ags/local.json"
    "$HOME/.config/swaylock/config"
    "$HOME/.config/fastfetch/config.jsonc"
    "$HOME/.zshrc"
  )
  local file
  for file in "${required_files[@]}"; do
    if [[ -e "$file" ]]; then
      printf 'OK       %s\n' "$file"
    else
      printf 'MISSING  %s\n' "$file"
      failed=1
    fi
  done

  if [[ -x "$HOME/.config/ags/scripts/doctor.sh" ]]; then
    printf '\nAGS dependency report:\n'
    "$HOME/.config/ags/scripts/doctor.sh" || failed=1
  fi


  printf '\nOptional SDDM integration:\n'
  if [[ -f /usr/share/sddm/themes/Dynamic_bubble/Main.qml ]]; then
    printf 'OK       Dynamic Bubble theme\n'
    if [[ -f /etc/sddm.conf.d/90-hyprlazy-theme.conf ]] && \
       grep -Fxq 'Current=Dynamic_bubble' /etc/sddm.conf.d/90-hyprlazy-theme.conf 2>/dev/null; then
      printf 'OK       SDDM theme selection\n'
    else
      printf 'WARN     Dynamic Bubble is installed but not selected by HyprLazy config\n'
    fi
    if [[ -w /var/cache/sddm-theme ]]; then
      printf 'OK       Pywal sync cache\n'
    else
      printf 'WARN     /var/cache/sddm-theme is not writable by the current user\n'
    fi
  else
    printf 'SKIPPED  Optional Dynamic Bubble SDDM theme is not installed\n'
  fi

  return "$failed"
}
