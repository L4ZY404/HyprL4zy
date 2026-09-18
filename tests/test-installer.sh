#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export HYPRLAZY_ROOT="$ROOT"
export HOME="$(mktemp -d)"
trap 'rm -rf "$HOME"' EXIT

source "$ROOT/installer/lib/common.sh"
source "$ROOT/installer/modules/pacman.sh"
source "$ROOT/installer/modules/packages.sh"
source "$ROOT/installer/modules/sddm.sh"

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$*"; }

# 1. Syntax check every Bash file.
while IFS= read -r file; do
  bash -n "$file" || fail "bash syntax: $file"
done < <(find "$ROOT" -type f -name '*.sh' -print)
pass "bash syntax"

# 2. Required installer files.
for file in \
  install.sh \
  installer/lib/common.sh \
  installer/modules/pacman.sh \
  installer/modules/packages.sh \
  installer/modules/dotfiles.sh \
  installer/modules/shell.sh \
  installer/modules/services.sh \
  installer/modules/sddm.sh \
  installer/modules/doctor.sh \
  installer/modules/backups.sh \
  installer/manifests/packages-official.txt \
  installer/manifests/packages-programs.txt \
  installer/manifests/packages-aur.txt; do
  [[ -f "$ROOT/$file" ]] || fail "missing $file"
done
pass "installer structure"

# 3. Manifest duplicates.
for file in "$ROOT"/installer/manifests/packages-*.txt; do
  duplicates="$(read_manifest "$file" | LC_ALL=C sort | uniq -d)"
  [[ -z "$duplicates" ]] || fail "duplicate packages in $file: $duplicates"
done
pass "package manifests"

# 4. Powerlevel10k must remain aligned with ~/.zshrc.
grep -Fxq 'zsh-theme-powerlevel10k-git' "$ROOT/installer/manifests/packages-aur.txt" || fail "Powerlevel10k package missing"
grep -Fq '/usr/share/zsh-theme-powerlevel10k/powerlevel10k.zsh-theme' "$ROOT/home/.zshrc" || fail "Powerlevel10k source missing from .zshrc"
pass "Powerlevel10k integration"

# 5. Keep Astal minimal: AGS core + AstalTray only.
grep -Fxq 'aylurs-gtk-shell-git' "$ROOT/installer/manifests/packages-aur.txt" || fail "AGS package missing"
grep -Fxq 'libastal-tray-git' "$ROOT/installer/manifests/packages-aur.txt" || fail "AstalTray package missing"
if grep -Fxq 'libastal-meta' "$ROOT/installer/manifests/packages-aur.txt"; then
  fail "libastal-meta must not be installed"
fi
pass "minimal Astal dependency set"

# 6. Pywal must come from AUR; Python remains an official runtime dependency.
grep -Fxq 'python' "$ROOT/installer/manifests/packages-official.txt" || fail "python runtime missing"
if grep -Fxq 'python-pywal' "$ROOT/installer/manifests/packages-official.txt"; then
  fail "python-pywal must not be installed from pacman"
fi
grep -Fxq 'pywal-git' "$ROOT/installer/manifests/packages-aur.txt" || fail "pywal-git missing from AUR manifest"
pass "Pywal AUR integration"

# 7. pacman.conf patch must be idempotent and preserve custom repositories.
sample="$HOME/pacman.conf"
patched="$HOME/pacman.patched"
patched_twice="$HOME/pacman.patched.twice"
cat > "$sample" <<'PACMAN'
[options]
#Color
#ParallelDownloads = 2
CheckSpace

[custom-repo]
Server = https://example.invalid/$arch
PACMAN
render_pacman_conf "$sample" "$patched"
render_pacman_conf "$patched" "$patched_twice"
cmp -s "$patched" "$patched_twice" || fail "pacman patch is not idempotent"
grep -Fxq 'Color' "$patched" || fail "Color not enabled"
grep -Fxq 'ILoveCandy' "$patched" || fail "ILoveCandy not enabled"
grep -Fxq 'ParallelDownloads = 5' "$patched" || fail "ParallelDownloads not set"
grep -Fq '[custom-repo]' "$patched" || fail "custom repo was lost"
grep -Fq 'Server = https://example.invalid/$arch' "$patched" || fail "custom repo server was lost"
pass "pacman patch"

# 8. No private home path should be present in publishable source.
private_home="/home/""l4zy"
if grep -R -n -F "$private_home" "$ROOT" --exclude-dir=.git --exclude='test-installer.sh' >/dev/null 2>&1; then
  fail "private home path found"
fi
pass "portable paths"

# 9. local machine state must not be committed.
[[ ! -e "$ROOT/home/.config/ags/local.json" ]] || fail "local.json must not be committed"
[[ ! -e "$ROOT/home/.config/hypr/local.conf" ]] || fail "local.conf must not be committed"
[[ -e "$ROOT/home/.config/ags/local.example.json" ]] || fail "local.example.json missing"
[[ -e "$ROOT/home/.config/hypr/local.example.conf" ]] || fail "local.example.conf missing"
pass "local state policy"

# 10. Optional SDDM integration must delegate to Dynamic Bubble's installer.
grep -Fq -- '--with-sddm' "$ROOT/install.sh" || fail "--with-sddm flag missing"
grep -Fq 'Install the optional HyprLazy SDDM theme' "$ROOT/installer/modules/sddm.sh" || fail "interactive SDDM prompt missing"
grep -Fq 'https://github.com/L4ZY404/SDDM-THEME-Dynamic_bubble.git' "$ROOT/installer/modules/sddm.sh" || fail "Dynamic Bubble repository missing"
grep -Fq 'bash ./install.sh' "$ROOT/installer/modules/sddm.sh" || fail "Dynamic Bubble standalone installer is not used"
if grep -Fq 'install_sddm_theme_files' "$ROOT/installer/modules/sddm.sh"; then
  fail "HyprLazy must not duplicate Dynamic Bubble theme installation logic"
fi
pass "delegated optional SDDM integration"

# 11. AUR installer must continue when yay reports failure after the package was installed.
if ! (
  MOCK_INSTALLED=0
  package_installed() { [[ "$1" == demo-package && "$MOCK_INSTALLED" == 1 ]]; }
  yay() { MOCK_INSTALLED=1; return 7; }
  install_single_aur_package demo-package
); then
  fail "AUR installed-state verification did not tolerate a non-zero yay status"
fi
pass "AUR post-install status verification"

# 12. A truly missing AUR package must still be reported as a failure.
if (
  package_installed() { return 1; }
  yay() { return 9; }
  install_single_aur_package missing-package
); then
  fail "missing AUR package was incorrectly accepted"
fi
pass "AUR missing-package detection"

# 13. pacman bulk failures must be verified before aborting.
if ! (
  MOCK_INSTALLED=0
  package_installed() { [[ "$MOCK_INSTALLED" == 1 ]]; }
  sudo() { MOCK_INSTALLED=1; return 4; }
  install_pacman_package_set "mock runtime" 1 demo-package
); then
  fail "pacman installed-state verification did not tolerate a non-zero status"
fi
pass "pacman post-install status verification"


# 14. A non-zero yay status for one installed package must not stop later AUR packages.
if ! (
  mock_manifest="$HOME/mock-manifests"
  mkdir -p "$mock_manifest"
  printf 'first-package\nsecond-package\n' > "$mock_manifest/packages-aur.txt"
  : > "$mock_manifest/packages-aur-optional.txt"
  HYPRLAZY_MANIFEST_DIR="$mock_manifest"
  MOCK_INSTALLED=""
  MOCK_ATTEMPTS=""
  package_installed() { [[ " $MOCK_INSTALLED " == *" $1 "* ]]; }
  yay() {
    local package="${@: -1}"
    MOCK_ATTEMPTS+=" $package"
    MOCK_INSTALLED+=" $package"
    [[ "$package" == first-package ]] && return 7
    return 0
  }
  install_aur_packages
  [[ " $MOCK_ATTEMPTS " == *" first-package "* ]]
  [[ " $MOCK_ATTEMPTS " == *" second-package "* ]]
); then
  fail "AUR package phase did not continue after a verified installed package returned non-zero"
fi
pass "AUR phase continuation"

printf '\nAll installer tests passed.\n'
