#!/usr/bin/env bash

# Installer-level health checks for the current Quickshell generation.

set -euo pipefail

check_command() {
  local command_name="$1"
  if command -v "$command_name" >/dev/null 2>&1; then
    printf 'OK       %-24s %s\n' "$command_name" "$(command -v "$command_name")"
    return 0
  fi
  printf 'MISSING  %s\n' "$command_name"
  return 1
}

run_installer_doctor() {
  section "HyprL4zy doctor"
  local failed=0

  printf 'Core commands:\n'
  local commands=(
    hyprctl qs paru python3 jq zsh kitty
    grim slurp wl-copy wl-paste cliphist
    cava brightnessctl awww wal ffmpeg mpvpaper
    checkupdates notify-send
  )
  local command_name
  for command_name in "${commands[@]}"; do
    check_command "$command_name" || failed=1
  done

  printf '\nQuickshell runtime:\n'
  if command -v qs >/dev/null 2>&1; then
    local qs_version
    qs_version="$(qs --version 2>/dev/null | head -n1 || true)"
    printf 'OK       %s\n' "${qs_version:-qs available}"
  else
    printf 'MISSING  Quickshell runtime\n'
    failed=1
  fi

  printf '\nDesktop portals / policy agent:\n'
  for package in xdg-desktop-portal-hyprland xdg-desktop-portal-gtk hyprpolkitagent; do
    if package_installed "$package"; then
      printf 'OK       %s\n' "$package"
    else
      printf 'MISSING  %s\n' "$package"
      failed=1
    fi
  done

  printf '\nAudio / power services:\n'
  if command -v wpctl >/dev/null 2>&1; then
    printf 'OK       WirePlumber tools\n'
  else
    printf 'MISSING  wpctl (wireplumber)\n'
    failed=1
  fi
  if command -v upower >/dev/null 2>&1; then
    printf 'OK       UPower client\n'
  else
    printf 'MISSING  upower\n'
    failed=1
  fi
  if systemctl is-active --quiet power-profiles-daemon.service 2>/dev/null; then
    printf 'OK       power-profiles-daemon.service\n'
  elif systemctl is-active --quiet tlp.service 2>/dev/null || \
       systemctl is-active --quiet auto-cpufreq.service 2>/dev/null || \
       systemctl is-active --quiet tuned.service 2>/dev/null; then
    printf 'OK       alternative power manager active\n'
  else
    printf 'WARN     no supported power-profile service is active\n'
  fi

  printf '\nNetwork services:\n'
  if systemctl is-active --quiet NetworkManager.service 2>/dev/null; then
    printf 'OK       NetworkManager.service\n'
  elif systemctl is-active --quiet iwd.service 2>/dev/null; then
    printf 'OK       iwd.service (fallback path)\n'
  else
    printf 'MISSING  NetworkManager or iwd service\n'
    failed=1
  fi
  if systemctl is-active --quiet bluetooth.service 2>/dev/null; then
    printf 'OK       bluetooth.service\n'
  else
    printf 'WARN     bluetooth.service is not active\n'
  fi

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

  printf '\nHyprL4zy files:\n'
  local required_files=(
    "$HOME/.config/hypr/hyprland.conf"
    "$HOME/.config/hypr/local.conf"
    "$HOME/.config/quickshell/hyprl4zy/shell.qml"
    "$HOME/.config/quickshell/hyprl4zy/services/qmldir"
    "$HOME/.config/quickshell/hyprl4zy/settings.json"
    "$HOME/.config/quickshell/hyprl4zy/launcher.sh"
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

  local settings="$HOME/.config/quickshell/hyprl4zy/settings.json"
  if [[ -f "$settings" && "$HOME" != '/home/l4zy' ]] && grep -Fq '/home/l4zy/' "$settings"; then
    printf 'MISSING  portable settings migration (legacy /home/l4zy path remains)\n'
    failed=1
  fi

  printf '\nOptional SDDM integration:\n'
  if [[ -f /usr/share/sddm/themes/Dynamic_bubble/Main.qml ]]; then
    printf 'OK       Dynamic Bubble theme\n'
    if { [[ -f /etc/sddm.conf.d/90-dynamic-bubble.conf ]] && \
         grep -Fxq 'Current=Dynamic_bubble' /etc/sddm.conf.d/90-dynamic-bubble.conf 2>/dev/null; } || \
       { [[ -f /etc/sddm.conf ]] && \
         grep -Fxq 'Current=Dynamic_bubble' /etc/sddm.conf 2>/dev/null; }; then
      printf 'OK       SDDM theme selection\n'
    else
      printf 'WARN     Dynamic Bubble is installed but its SDDM selection was not detected\n'
    fi
    command -v dynamic-bubble-sync >/dev/null 2>&1 && \
      printf 'OK       dynamic-bubble-sync\n' || \
      printf 'WARN     dynamic-bubble-sync command is missing\n'
  else
    printf 'SKIPPED  Optional Dynamic Bubble SDDM theme is not installed\n'
  fi

  return "$failed"
}
