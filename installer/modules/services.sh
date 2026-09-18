#!/usr/bin/env bash

# Enable system services required by HyprLazy modules without taking over an
# existing network or power-management stack unexpectedly.

set -euo pipefail

enable_service() {
  local unit="$1"
  if systemctl list-unit-files --type=service "$unit" >/dev/null 2>&1; then
    if sudo systemctl enable --now "$unit"; then
      ok "Enabled $unit"
    else
      warn "Could not enable $unit"
    fi
  else
    warn "Service not found: $unit"
  fi
}

start_service() {
  local unit="$1"
  if systemctl list-unit-files --type=service "$unit" >/dev/null 2>&1; then
    if sudo systemctl start "$unit"; then
      ok "Started $unit"
    else
      warn "Could not start $unit"
    fi
  fi
}

configure_network_service() {
  if systemctl is-active --quiet NetworkManager.service 2>/dev/null; then
    enable_service NetworkManager.service
    return 0
  fi

  if systemctl is-active --quiet systemd-networkd.service 2>/dev/null || \
     systemctl is-active --quiet connman.service 2>/dev/null; then
    warn "Another network manager is active; NetworkManager was installed but not enabled automatically."
    warn "HyprLazy network controls use nmcli and work best with NetworkManager."
    return 0
  fi

  enable_service NetworkManager.service
}

configure_power_service() {
  if systemctl is-active --quiet tlp.service 2>/dev/null; then
    warn "TLP is active; power-profiles-daemon was not started to avoid competing power managers."
    return 0
  fi
  start_service power-profiles-daemon.service
}

configure_services() {
  section "Services"
  configure_network_service
  enable_service bluetooth.service
  configure_power_service

  if command -v xdg-user-dirs-update >/dev/null 2>&1; then
    xdg-user-dirs-update || true
  fi
}
