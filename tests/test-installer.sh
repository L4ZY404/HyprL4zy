#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export HYPRLAZY_ROOT="$ROOT"
export HOME="$(mktemp -d)"
trap 'rm -rf "$HOME"' EXIT

source "$ROOT/installer/lib/common.sh"
source "$ROOT/installer/modules/pacman.sh"
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

# 5. pacman.conf patch must be idempotent and preserve custom repositories.
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

# 6. No private home path should be present in publishable source.
private_home="/home/""l4zy"
if grep -R -n -F "$private_home" "$ROOT" --exclude-dir=.git --exclude='test-installer.sh' >/dev/null 2>&1; then
  fail "private home path found"
fi
pass "portable paths"

# 7. local machine state must not be committed.
[[ ! -e "$ROOT/home/.config/ags/local.json" ]] || fail "local.json must not be committed"
[[ ! -e "$ROOT/home/.config/hypr/local.conf" ]] || fail "local.conf must not be committed"
[[ -e "$ROOT/home/.config/ags/local.example.json" ]] || fail "local.example.json missing"
[[ -e "$ROOT/home/.config/hypr/local.example.conf" ]] || fail "local.example.conf missing"
pass "local state policy"



# 8. Optional SDDM integration must remain opt-in and portable.
grep -Fq -- '--with-sddm' "$ROOT/install.sh" || fail "--with-sddm flag missing"
grep -Fq 'Install the optional HyprLazy SDDM theme' "$ROOT/installer/modules/sddm.sh" || fail "interactive SDDM prompt missing"
grep -Fq 'https://github.com/L4ZY404/SDDM-THEME-Dynamic_bubble.git' "$ROOT/installer/modules/sddm.sh" || fail "Dynamic Bubble repository missing"
grep -Fq '/var/cache/sddm-theme' "$ROOT/home/.config/ags/scripts/theme/sddm_sync.sh" || fail "SDDM Pywal cache path missing"
if grep -Fq 'touch "$THEME_DIR/Main.qml"' "$ROOT/home/.config/ags/scripts/theme/sddm_sync.sh"; then
  fail "runtime SDDM sync must not write into /usr/share"
fi
pass "optional SDDM integration"

# 9. SDDM theme source detection should accept both repo-root and nested layouts.
fake_repo="$HOME/fake-sddm-repo"
mkdir -p "$fake_repo/Dynamic_bubble"
: > "$fake_repo/Dynamic_bubble/Main.qml"
[[ "$(find_sddm_theme_source "$fake_repo")" == "$fake_repo/Dynamic_bubble" ]] || fail "nested SDDM theme detection"
rm -rf "$fake_repo"
mkdir -p "$fake_repo"
: > "$fake_repo/Main.qml"
[[ "$(find_sddm_theme_source "$fake_repo")" == "$fake_repo" ]] || fail "root SDDM theme detection"
pass "SDDM theme discovery"

# 10. Patching /etc/sddm.conf must preserve unrelated settings and be idempotent.
sddm_sample="$HOME/sddm.conf"
sddm_patched="$HOME/sddm.patched"
sddm_twice="$HOME/sddm.patched.twice"
cat > "$sddm_sample" <<'SDDM'
[General]
DisplayServer=x11

[Theme]
Current=old-theme
CursorTheme=breeze_cursors

[Users]
MaximumUid=60513
SDDM
render_sddm_main_config "$sddm_sample" "$sddm_patched"
render_sddm_main_config "$sddm_patched" "$sddm_twice"
cmp -s "$sddm_patched" "$sddm_twice" || fail "SDDM config patch is not idempotent"
grep -Fxq 'Current=Dynamic_bubble' "$sddm_patched" || fail "SDDM theme was not selected"
grep -Fxq 'DisplayServer=x11' "$sddm_patched" || fail "SDDM General settings were lost"
grep -Fxq 'CursorTheme=breeze_cursors' "$sddm_patched" || fail "SDDM Theme settings were lost"
grep -Fxq 'MaximumUid=60513' "$sddm_patched" || fail "SDDM Users settings were lost"
pass "SDDM config patch"

printf '\nAll installer tests passed.\n'
