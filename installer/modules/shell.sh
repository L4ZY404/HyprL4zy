#!/usr/bin/env bash

# Zsh, Oh My Zsh and Powerlevel10k integration.

set -euo pipefail

install_oh_my_zsh() {
  section "Zsh shell"
  local target="$HOME/.oh-my-zsh"
  if [[ -d "$target/.git" ]]; then
    ok "Oh My Zsh is already installed."
    return 0
  fi
  if [[ -e "$target" ]]; then
    warn "$target already exists but is not a Git checkout; leaving it untouched."
    return 0
  fi

  git clone --depth=1 https://github.com/ohmyzsh/ohmyzsh.git "$target"
  ok "Oh My Zsh installed without modifying ~/.zshrc."
}

set_default_shell() {
  local zsh_path
  zsh_path="$(command -v zsh || true)"
  [[ -n "$zsh_path" ]] || { warn "zsh is not available; default shell was not changed."; return 0; }

  local current_shell
  current_shell="$(getent passwd "$USER" | cut -d: -f7)"
  if [[ "$current_shell" == "$zsh_path" ]]; then
    ok "Zsh is already the default shell."
    return 0
  fi

  if confirm "Set $zsh_path as the default shell for $USER?"; then
    chsh -s "$zsh_path" "$USER"
    ok "Default shell changed to Zsh."
  else
    warn "Default shell unchanged. Run: chsh -s $zsh_path"
  fi
}

update_oh_my_zsh() {
  local target="$HOME/.oh-my-zsh"
  [[ -d "$target/.git" ]] || return 0
  info "Updating Oh My Zsh checkout."
  git -C "$target" pull --ff-only || warn "Oh My Zsh update failed; existing checkout was kept."
}
