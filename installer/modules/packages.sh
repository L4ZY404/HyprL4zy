#!/usr/bin/env bash

# Package installation and yay bootstrap.

set -euo pipefail

pacman_flags() {
  if [[ "$HYPRLAZY_ASSUME_YES" == 1 ]]; then
    printf '%s\n' --noconfirm
  fi
}

yay_flags() {
  if [[ "$HYPRLAZY_ASSUME_YES" == 1 ]]; then
    printf '%s\n' --noconfirm
  fi
}

install_bootstrap_packages() {
  section "Bootstrap packages"
  local flags=()
  mapfile -t flags < <(pacman_flags)
  sudo pacman -Syu --needed "${flags[@]}" base-devel git curl ca-certificates
}

install_official_packages() {
  section "Official packages"
  local packages=()
  local programs=()
  array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-official.txt" packages
  if [[ "$HYPRLAZY_MINIMAL" != 1 ]]; then
    array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-programs.txt" programs
    packages+=("${programs[@]}")
  fi

  local flags=()
  mapfile -t flags < <(pacman_flags)
  sudo pacman -S --needed "${flags[@]}" "${packages[@]}"
  ok "Official package set installed."
}

install_yay() {
  if command -v yay >/dev/null 2>&1; then
    ok "yay is already installed."
    return 0
  fi

  section "yay"
  info "yay was not found; bootstrapping it from the AUR as the current user."

  local build_root
  build_root="$(mktemp -d)"
  trap 'rm -rf "$build_root"' RETURN

  git clone --depth=1 https://aur.archlinux.org/yay.git "$build_root/yay"
  (
    cd "$build_root/yay"
    if [[ "$HYPRLAZY_ASSUME_YES" == 1 ]]; then
      makepkg -si --needed --noconfirm
    else
      makepkg -si --needed
    fi
  )

  command -v yay >/dev/null 2>&1 || die "yay installation finished but the command is still unavailable."
  ok "yay installed."
  trap - RETURN
  rm -rf "$build_root"
}

install_aur_packages() {
  section "AUR packages"
  local packages=()
  array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-aur.txt" packages
  local flags=()
  mapfile -t flags < <(yay_flags)
  yay -S --needed "${flags[@]}" "${packages[@]}"
  ok "Required AUR package set installed."

  local optional=()
  array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-aur-optional.txt" optional
  if ((${#optional[@]})); then
    info "Installing optional visual packages. Failures here will not abort HyprLazy."
    local package
    for package in "${optional[@]}"; do
      if ! yay -S --needed "${flags[@]}" "$package"; then
        warn "Optional AUR package failed: $package"
      fi
    done
  fi
}

print_package_plan() {
  local official=() programs=() aur=() aur_optional=()
  array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-official.txt" official
  array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-programs.txt" programs
  array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-aur.txt" aur
  array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-aur-optional.txt" aur_optional

  printf 'Official packages missing:\n'
  local package
  local count=0
  for package in "${official[@]}"; do
    if ! package_installed "$package"; then
      printf '  %s\n' "$package"
      ((count += 1))
    fi
  done
  ((count > 0)) || printf '  none\n'

  if [[ "$HYPRLAZY_MINIMAL" != 1 ]]; then
    printf '\nProgram packages missing:\n'
    count=0
    for package in "${programs[@]}"; do
      if ! package_installed "$package"; then
        printf '  %s\n' "$package"
        ((count += 1))
      fi
    done
    ((count > 0)) || printf '  none\n'
  fi

  printf '\nAUR packages missing:\n'
  count=0
  for package in "${aur[@]}"; do
    if ! package_installed "$package"; then
      printf '  %s\n' "$package"
      ((count += 1))
    fi
  done
  ((count > 0)) || printf '  none\n'

  printf '\nOptional AUR packages missing:\n'
  count=0
  for package in "${aur_optional[@]}"; do
    if ! package_installed "$package"; then
      printf '  %s\n' "$package"
      ((count += 1))
    fi
  done
  ((count > 0)) || printf '  none\n'
}
