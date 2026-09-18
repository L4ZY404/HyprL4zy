#!/usr/bin/env bash

# Package installation and yay bootstrap.
# Package-manager commands are always verified against pacman's installed
# database before the installer decides whether a reported failure is fatal.

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

join_by() {
  local separator="$1"
  shift || true
  local first=1 value
  for value in "$@"; do
    if ((first)); then
      first=0
    else
      printf '%s' "$separator"
    fi
    printf '%s' "$value"
  done
}


ags_runtime_compatible() {
  # Prefer package metadata when AGS comes from Arch/AUR. This avoids replacing
  # the stable package with the conflicting -git variant.
  if package_installed aylurs-gtk-shell || package_installed aylurs-gtk-shell-git; then
    return 0
  fi

  command -v ags >/dev/null 2>&1 || return 1

  # Accept a custom/source installation only when it reports AGS 3.x or newer.
  local version major
  version="$(ags --version 2>/dev/null | grep -Eo '[0-9]+(\.[0-9]+){1,2}' | head -n1 || true)"
  [[ -n "$version" ]] || return 1
  major="${version%%.*}"
  [[ "$major" =~ ^[0-9]+$ ]] && ((major >= 3))
}

astal_tray_available() {
  if package_installed libastal-tray || package_installed libastal-tray-git; then
    return 0
  fi

  command -v gjs >/dev/null 2>&1 || return 1
  gjs -c 'imports.gi.versions.AstalTray="0.1"; const AstalTray=imports.gi.AstalTray;' >/dev/null 2>&1
}

aur_requirement_satisfied() {
  local package="$1"
  case "$package" in
    aylurs-gtk-shell|aylurs-gtk-shell-git)
      ags_runtime_compatible
      ;;
    libastal-tray|libastal-tray-git)
      astal_tray_available
      ;;
    *)
      package_installed "$package"
      ;;
  esac
}

aur_requirement_label() {
  local package="$1"
  case "$package" in
    aylurs-gtk-shell|aylurs-gtk-shell-git) printf '%s' 'AGS 3 runtime' ;;
    libastal-tray|libastal-tray-git) printf '%s' 'AstalTray' ;;
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
    package_installed "$package" || output_ref+=("$package")
  done
}

install_bootstrap_packages() {
  section "Bootstrap packages"
  local flags=()
  mapfile -t flags < <(pacman_flags)

  if ! sudo pacman -Syu --needed "${flags[@]}" base-devel git curl ca-certificates; then
    die "The system upgrade/bootstrap transaction failed. Fix pacman first, then rerun the installer; --needed will skip completed work."
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

  info "Installing $label (${#missing[@]} package(s))."

  # A single bulk transaction is fastest. If pacman returns a non-zero status,
  # verify the actual installed state before retrying only the missing packages.
  if ! sudo pacman -S --needed "${flags[@]}" "${missing[@]}"; then
    collect_missing_packages missing "${packages[@]}"
    if ((${#missing[@]} == 0)); then
      warn "pacman returned a non-zero status for $label, but every requested package is installed; continuing."
      return 0
    fi

    warn "Bulk installation for $label did not complete. Retrying the remaining packages one by one."
    local retry_failures=()
    local package
    for package in "${missing[@]}"; do
      info "Retrying package: $package"
      if sudo pacman -S --needed "${flags[@]}" "$package"; then
        continue
      fi
      if package_installed "$package"; then
        warn "pacman reported a failure for $package, but it is installed; continuing."
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

  if [[ "$HYPRLAZY_MINIMAL" != 1 ]]; then
    local programs=()
    array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-programs.txt" programs
    # User-facing applications should never prevent the rice itself from being
    # installed when a mirror/package is temporarily unavailable.
    install_pacman_package_set "default user programs" 0 "${programs[@]}" || true
  fi
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

  if ! git clone --depth=1 https://aur.archlinux.org/yay.git "$build_root/yay"; then
    rm -rf "$build_root"
    die "Could not clone yay from the AUR. Check your network connection and rerun the installer."
  fi

  local makepkg_status=0
  (
    cd "$build_root/yay"
    if [[ "$HYPRLAZY_ASSUME_YES" == 1 ]]; then
      makepkg -si --needed --noconfirm
    else
      makepkg -si --needed
    fi
  ) || makepkg_status=$?

  rm -rf "$build_root"

  if command -v yay >/dev/null 2>&1; then
    if ((makepkg_status != 0)); then
      warn "makepkg returned status $makepkg_status, but yay is installed; continuing."
    else
      ok "yay installed."
    fi
    return 0
  fi

  die "yay installation did not complete (makepkg status: $makepkg_status)."
}

install_single_aur_package() {
  local package="$1"
  shift
  local flags=("$@")
  local label
  label="$(aur_requirement_label "$package")"

  # AUR packages may have stable/-git alternatives that provide the same
  # runtime. Do not ask yay to replace a working provider just because the
  # manifest names a different variant.
  if aur_requirement_satisfied "$package"; then
    ok "Requirement already satisfied: $label"
    return 0
  fi

  info "Installing AUR package: $package ($label)"
  local status=0
  yay -S --needed "${flags[@]}" "$package" || status=$?

  if aur_requirement_satisfied "$package"; then
    if ((status != 0)); then
      warn "yay returned status $status for $package, but the required runtime is available; continuing."
    else
      ok "Installed requirement: $label"
    fi
    return 0
  fi

  warn "AUR requirement failed and is still missing: $label (requested package: $package, yay status: $status)"
  return 1
}

install_aur_packages() {
  section "AUR packages"
  local packages=()
  array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-aur.txt" packages
  local flags=()
  mapfile -t flags < <(yay_flags)

  # Install required AUR packages independently. One broken AUR build should
  # not prevent the installer from attempting the remaining dependencies.
  local failures=()
  local package
  for package in "${packages[@]}"; do
    if ! install_single_aur_package "$package" "${flags[@]}"; then
      failures+=("$package")
    fi
  done

  if ((${#failures[@]})); then
    die "Required AUR packages could not be installed: $(join_by ', ' "${failures[@]}"). The other packages were still attempted; fix these builds and rerun the installer."
  fi
  ok "Required AUR package set installed."

  local optional=()
  array_from_manifest "$HYPRLAZY_MANIFEST_DIR/packages-aur-optional.txt" optional
  if ((${#optional[@]})); then
    info "Installing optional visual packages. Failures here will not abort HyprLazy."
    for package in "${optional[@]}"; do
      install_single_aur_package "$package" "${flags[@]}" || \
        warn "Optional AUR package skipped: $package"
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
    if ! aur_requirement_satisfied "$package"; then
      printf '  %s\n' "$package"
      ((count += 1))
    fi
  done
  ((count > 0)) || printf '  none\n'

  printf '\nOptional AUR packages missing:\n'
  count=0
  for package in "${aur_optional[@]}"; do
    if ! aur_requirement_satisfied "$package"; then
      printf '  %s\n' "$package"
      ((count += 1))
    fi
  done
  ((count > 0)) || printf '  none\n'
}
