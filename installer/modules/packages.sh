#!/usr/bin/env bash

# Package installation and mandatory paru bootstrap.
# Every package-manager command is followed by installed-state verification.

set -euo pipefail

pacman_flags() {
  if [[ "$HYPRLAZY_ASSUME_YES" == 1 ]]; then
    printf '%s\n' --noconfirm
  fi
}

paru_flags() {
  if [[ "$HYPRLAZY_ASSUME_YES" == 1 ]]; then
    printf '%s\n' --noconfirm
  fi
}

join_by() {
  local separator="$1"
  shift || true
  local first=1 value
  for value in "$@"; do
    if ((first)); then first=0; else printf '%s' "$separator"; fi
    printf '%s' "$value"
  done
}

package_requirement_satisfied() {
  local package="$1"
  case "$package" in
    quickshell)
      package_installed quickshell || package_installed quickshell-git || command -v qs >/dev/null 2>&1
      ;;
    awww)
      package_installed awww || command -v awww >/dev/null 2>&1
      ;;
    iwd)
      package_installed iwd || command -v iwctl >/dev/null 2>&1
      ;;
    wireplumber)
      package_installed wireplumber || command -v wpctl >/dev/null 2>&1
      ;;
    *)
      package_installed "$package"
      ;;
  esac
}

aur_requirement_satisfied() {
  local package="$1"
  case "$package" in
    mpvpaper|mpvpaper-git)
      package_installed mpvpaper || package_installed mpvpaper-git || command -v mpvpaper >/dev/null 2>&1
      ;;
    swaylock-effects|swaylock-effects-git|swaylock-effects-improved-git)
      package_installed swaylock-effects || package_installed swaylock-effects-git || \
        package_installed swaylock-effects-improved-git || command -v swaylock >/dev/null 2>&1
      ;;
    zsh-theme-powerlevel10k-git|zsh-theme-powerlevel10k)
      package_installed zsh-theme-powerlevel10k-git || package_installed zsh-theme-powerlevel10k || \
        [[ -r /usr/share/zsh-theme-powerlevel10k/powerlevel10k.zsh-theme ]]
      ;;
    pywal-git|python-pywal)
      package_installed pywal-git || package_installed python-pywal || command -v wal >/dev/null 2>&1
      ;;
    *)
      package_installed "$package"
      ;;
  esac
}

aur_requirement_label() {
  local package="$1"
  case "$package" in
    mpvpaper|mpvpaper-git) printf '%s' 'mpvpaper runtime' ;;
    swaylock-effects*) printf '%s' 'swaylock runtime' ;;
    zsh-theme-powerlevel10k*) printf '%s' 'Powerlevel10k' ;;
    pywal-git|python-pywal) printf '%s' 'Pywal (wal)' ;;
    *) printf '%s' "$package" ;;
  esac
}

collect_missing_packages() {
  local output_name="$1"
  shift
  local -n output_ref="$output_name"
  output_ref=()
  local package
  for package in "$@"; do
    package_requirement_satisfied "$package" || output_ref+=("$package")
  done
}

pacman_work_needed() {
  local packages=() programs=() missing=()
  array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-official.txt" packages
  collect_missing_packages missing "${packages[@]}"
  ((${#missing[@]})) && return 0

  if [[ "$HYPRLAZY_INSTALL_MODE" != update && "$HYPRLAZY_MINIMAL" != 1 ]]; then
    array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-programs.txt" programs
    collect_missing_packages missing "${programs[@]}"
    ((${#missing[@]})) && return 0
  fi

  return 1
}

install_bootstrap_packages() {
  local mode="${1:-install}"
  section "Bootstrap packages"

  if [[ "$mode" == update ]] && ! pacman_work_needed; then
    ok "No new pacman packages are required; skipping the system upgrade transaction."
    return 0
  fi

  local flags=()
  mapfile -t flags < <(pacman_flags)

  if ! sudo pacman -Syu --needed "${flags[@]}" base-devel git curl ca-certificates; then
    die "The system upgrade/bootstrap transaction failed. Fix pacman first, then rerun the installer; completed work will be detected automatically."
  fi

  local missing=()
  collect_missing_packages missing base-devel git curl ca-certificates
  ((${#missing[@]} == 0)) || \
    die "Bootstrap transaction finished but these packages are still missing: $(join_by ', ' "${missing[@]}")"
  ok "Bootstrap packages are ready."
}

install_pacman_package_set() {
  local label="$1"
  local required="$2"
  shift 2
  local packages=("$@")
  ((${#packages[@]})) || return 0

  local flags=()
  mapfile -t flags < <(pacman_flags)

  local missing=()
  collect_missing_packages missing "${packages[@]}"
  if ((${#missing[@]} == 0)); then
    ok "$label already installed."
    return 0
  fi

  info "Installing $label (${#missing[@]} package(s)): $(join_by ', ' "${missing[@]}")"
  if ! sudo pacman -S --needed "${flags[@]}" "${missing[@]}"; then
    collect_missing_packages missing "${packages[@]}"
    if ((${#missing[@]} == 0)); then
      warn "pacman returned a non-zero status for $label, but every requested runtime is available; continuing."
      return 0
    fi

    warn "Bulk installation for $label did not complete. Retrying only the remaining packages."
    local retry_failures=() package
    for package in "${missing[@]}"; do
      info "Retrying package: $package"
      if sudo pacman -S --needed "${flags[@]}" "$package"; then
        continue
      fi
      if package_requirement_satisfied "$package"; then
        warn "pacman reported a failure for $package, but its runtime is available; continuing."
      else
        retry_failures+=("$package")
        warn "Package is still missing: $package"
      fi
    done

    if ((${#retry_failures[@]})); then
      if [[ "$required" == 1 ]]; then
        warn "Required packages that could not be installed: $(join_by ', ' "${retry_failures[@]}")"
        return 1
      fi
      warn "Optional/program packages skipped after failure: $(join_by ', ' "${retry_failures[@]}")"
      return 0
    fi
  fi

  collect_missing_packages missing "${packages[@]}"
  if ((${#missing[@]})); then
    if [[ "$required" == 1 ]]; then
      warn "Required packages are still missing after installation: $(join_by ', ' "${missing[@]}")"
      return 1
    fi
    warn "Some program packages remain unavailable: $(join_by ', ' "${missing[@]}")"
  else
    ok "$label installed."
  fi
}

install_official_packages() {
  section "Official packages"

  local runtime=()
  array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-official.txt" runtime
  if ! install_pacman_package_set "required runtime packages" 1 "${runtime[@]}"; then
    die "Required Arch packages are missing. Review the warnings above and rerun the installer after resolving them."
  fi

  if [[ "$HYPRLAZY_INSTALL_MODE" != update && "$HYPRLAZY_MINIMAL" != 1 ]]; then
    local programs=()
    array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-programs.txt" programs
    install_pacman_package_set "default user programs" 0 "${programs[@]}" || true
  elif [[ "$HYPRLAZY_INSTALL_MODE" == update ]]; then
    info "Update mode: preserving the user's optional program set."
  fi
}

install_paru() {
  if command -v paru >/dev/null 2>&1; then
    ok "paru is already installed."
    return 0
  fi

  section "paru"
  info "paru was not found; bootstrapping it from the AUR as the current user."

  local build_root
  build_root="$(mktemp -d)"
  trap 'rm -rf -- "$build_root"' RETURN

  if ! git clone --depth=1 https://aur.archlinux.org/paru.git "$build_root/paru"; then
    rm -rf "$build_root"
    trap - RETURN
    die "Could not clone paru from the AUR. Check your network connection and rerun the installer."
  fi

  local makepkg_status=0
  (
    cd "$build_root/paru"
    if [[ "$HYPRLAZY_ASSUME_YES" == 1 ]]; then
      makepkg -si --needed --noconfirm
    else
      makepkg -si --needed
    fi
  ) || makepkg_status=$?

  rm -rf "$build_root"
  trap - RETURN

  if command -v paru >/dev/null 2>&1; then
    if ((makepkg_status != 0)); then
      warn "makepkg returned status $makepkg_status, but paru is installed; continuing."
    else
      ok "paru installed."
    fi
    return 0
  fi

  die "paru installation did not complete (makepkg status: $makepkg_status)."
}

install_single_aur_package() {
  local package="$1"
  shift
  local flags=("$@")
  local label
  label="$(aur_requirement_label "$package")"

  if aur_requirement_satisfied "$package"; then
    ok "Requirement already satisfied: $label"
    return 0
  fi

  info "Installing AUR package: $package ($label)"
  local status=0
  paru -S --needed "${flags[@]}" "$package" || status=$?

  if aur_requirement_satisfied "$package"; then
    if ((status != 0)); then
      warn "paru returned status $status for $package, but the required runtime is available; continuing."
    else
      ok "Installed requirement: $label"
    fi
    return 0
  fi

  warn "AUR requirement failed and is still missing: $label (requested package: $package, paru status: $status)"
  return 1
}

install_aur_packages() {
  section "AUR packages"
  local packages=()
  array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-aur.txt" packages
  local flags=()
  mapfile -t flags < <(paru_flags)

  local failures=() package
  for package in "${packages[@]}"; do
    if ! install_single_aur_package "$package" "${flags[@]}"; then
      failures+=("$package")
    fi
  done

  if ((${#failures[@]})); then
    die "Required AUR packages could not be installed: $(join_by ', ' "${failures[@]}"). Fix these builds and rerun the installer; already completed work will be skipped."
  fi
  ok "Required AUR package set is ready."

  local optional=()
  array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-aur-optional.txt" optional
  if [[ "$HYPRLAZY_INSTALL_MODE" != update ]] && ((${#optional[@]})); then
    info "Installing optional visual packages. Failures here will not abort HyprL4zy."
    for package in "${optional[@]}"; do
      install_single_aur_package "$package" "${flags[@]}" || warn "Optional AUR package skipped: $package"
    done
  elif [[ "$HYPRLAZY_INSTALL_MODE" == update && ${#optional[@]} -gt 0 ]]; then
    info "Update mode: preserving optional AUR packages as-is."
  fi
}

print_package_plan() {
  local official=() programs=() aur=() aur_optional=()
  array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-official.txt" official
  array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-programs.txt" programs
  array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-aur.txt" aur
  array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-aur-optional.txt" aur_optional

  printf 'AUR helper:\n'
  if command -v paru >/dev/null 2>&1; then
    printf '  paru (installed)\n'
  else
    printf '  paru (will be bootstrapped)\n'
  fi

  printf '\nOfficial runtime requirements missing:\n'
  local package count=0
  for package in "${official[@]}"; do
    if ! package_requirement_satisfied "$package"; then printf '  %s\n' "$package"; ((count += 1)); fi
  done
  ((count > 0)) || printf '  none\n'

  if [[ "$HYPRLAZY_MINIMAL" != 1 ]]; then
    printf '\nProgram packages missing:\n'
    count=0
    for package in "${programs[@]}"; do
      if ! package_requirement_satisfied "$package"; then printf '  %s\n' "$package"; ((count += 1)); fi
    done
    ((count > 0)) || printf '  none\n'
  fi

  printf '\nAUR requirements missing:\n'
  count=0
  for package in "${aur[@]}"; do
    if ! aur_requirement_satisfied "$package"; then printf '  %s\n' "$package"; ((count += 1)); fi
  done
  ((count > 0)) || printf '  none\n'

  printf '\nOptional AUR packages missing:\n'
  count=0
  for package in "${aur_optional[@]}"; do
    if ! aur_requirement_satisfied "$package"; then printf '  %s\n' "$package"; ((count += 1)); fi
  done
  ((count > 0)) || printf '  none\n'
}
