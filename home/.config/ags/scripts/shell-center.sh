#!/usr/bin/env bash
# Compatibility entry point for former Shell FX bindings.
exec bash "${XDG_CONFIG_HOME:-$HOME/.config}/ags/scripts/quick-launcher.sh" "$@"
