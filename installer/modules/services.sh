#!/usr/bin/env bash

# Configure only services HyprL4zy actually needs, without taking over an
# already-working network or power-management stack.

set -euo pipefail

service_exists() {
  systemctl list-unit-files --type=service "$1" >/dev/null 2>&1
}

enable_service_if_needed() {
  local unit="$1"
  service_exists "$unit" || { warn "Service not found: $unit"; return 0; }

  local changed=0
  if ! systemctl is-enabled --quiet "$unit" 2>/dev/null; then
    if sudo systemctl enable "$unit" >/dev/null; then
      info "Enabled $unit"
      changed=1
    else
      warn "Could not enable $unit"
    fi
  fi
  if ! systemctl is-active --quiet "$unit" 2>/dev/null; then
    if sudo systemctl start "$unit"; then
      info "Started $unit"
      changed=1
    else
      warn "Could not start $unit"
    fi
  fi
  ((changed)) || ok "$unit is already enabled and active."
}

start_service_if_needed() {
  local unit="$1"
  service_exists "$unit" || { warn "Service not found: $unit"; return 0; }
  if systemctl is-active --quiet "$unit" 2>/dev/null; then
    ok "$unit is already active."
    return 0
  fi
  if sudo systemctl start "$unit"; then
    info "Started $unit"
  else
    warn "Could not start $unit"
  fi
}

configure_network_service() {
  if systemctl is-active --quiet NetworkManager.service 2>/dev/null; then
    enable_service_if_needed NetworkManager.service
    return 0
  fi

  # HyprL4zy supports Quickshell/NetworkManager natively and falls back to
  # iwctl when standalone iwd is already the user's chosen network stack.
  local alternative
  for alternative in systemd-networkd.service connman.service iwd.service; do
    if systemctl is-active --quiet "$alternative" 2>/dev/null; then
      warn "$alternative is already active; NetworkManager was installed but will not be enabled automatically."
      return 0
    fi
  done

  enable_service_if_needed NetworkManager.service
}

configure_power_service() {
  local alternative
  for alternative in tlp.service auto-cpufreq.service tuned.service; do
    if systemctl is-active --quiet "$alternative" 2>/dev/null; then
      warn "$alternative is active; power-profiles-daemon was not started to avoid competing power managers."
      return 0
    fi
  done
  enable_service_if_needed power-profiles-daemon.service
}

configure_services() {
  section "Services"
  configure_network_service
  enable_service_if_needed bluetooth.service
  configure_power_service

  # UPower is D-Bus activated on Arch; touching its service is unnecessary.
  if command -v xdg-user-dirs-update >/dev/null 2>&1; then
    xdg-user-dirs-update || true
  fi
}
