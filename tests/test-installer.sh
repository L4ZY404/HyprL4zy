#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ORIGINAL_HOME="${HOME:-}"
TEST_HOME="$(mktemp -d)"
export HOME="$TEST_HOME"
trap 'rm -rf "$TEST_HOME"' EXIT

export HYPRLAZY_ROOT="$ROOT"
source "$ROOT/installer/lib/common.sh"
source "$ROOT/installer/modules/pacman.sh"
source "$ROOT/installer/modules/packages.sh"
source "$ROOT/installer/modules/dotfiles.sh"
source "$ROOT/installer/modules/sddm.sh"

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$*"; }

# 1. Syntax check every Bash file.
while IFS= read -r file; do
  bash -n "$file" || fail "bash syntax: $file"
done < <(find "$ROOT" -type f -name '*.sh' -print)
pass "bash syntax"

# 2. Required installer and portable config files.
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
  installer/manifests/packages-aur.txt \
  installer/manifests/preserve-home.txt \
  home/.config/quickshell/hyprl4zy/shell.qml \
  home/.config/quickshell/hyprl4zy/settings.example.json \
  home/.config/hypr/local.example.conf; do
  [[ -f "$ROOT/$file" ]] || fail "missing $file"
done
pass "installer structure"

# 3. Manifest duplicates.
for file in "$ROOT"/installer/manifests/packages-*.txt; do
  duplicates="$(read_manifest "$file" | LC_ALL=C sort | uniq -d)"
  [[ -z "$duplicates" ]] || fail "duplicate packages in $file: $duplicates"
done
pass "package manifests"

# 4. Current generation must be Quickshell-only, not AGS/Astal.
grep -Fxq 'quickshell' "$ROOT/installer/manifests/packages-official.txt" || fail "quickshell package missing"
if grep -REqi 'aylurs-gtk-shell|libastal|\bgjs\b|gtk4-layer-shell|dart-sass|typescript|\bnpm\b' "$ROOT/installer/manifests"; then
  fail "obsolete AGS/Astal dependencies remain in package manifests"
fi
[[ ! -d "$ROOT/home/.config/ags" ]] || fail "obsolete AGS config directory is still shipped"
pass "Quickshell-only dependency set"

# 5. Critical Quickshell integrations must have runtime packages.
for package in quickshell xdg-desktop-portal-hyprland xdg-desktop-portal-gtk hyprpolkitagent networkmanager iwd bluez bluez-utils pipewire wireplumber upower cava awww ffmpeg jq power-profiles-daemon; do
  grep -Fxq "$package" "$ROOT/installer/manifests/packages-official.txt" || fail "missing runtime package: $package"
done
for package in mpvpaper swaylock-effects zsh-theme-powerlevel10k-git pywal-git; do
  grep -Fxq "$package" "$ROOT/installer/manifests/packages-aur.txt" || fail "missing AUR package: $package"
done
pass "runtime dependency coverage"

# 6. Powerlevel10k and Pywal policy.
grep -Fq '/usr/share/zsh-theme-powerlevel10k/powerlevel10k.zsh-theme' "$ROOT/home/.zshrc" || fail "Powerlevel10k source missing from .zshrc"
if grep -Fxq 'python-pywal' "$ROOT/installer/manifests/packages-official.txt"; then
  fail "python-pywal must not be installed from pacman"
fi
pass "shell and Pywal integration"

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

# 8. Public dotfiles must not contain the developer's private home/location state.
if grep -R -n -F '/home/l4zy' "$ROOT/home" >/dev/null 2>&1; then
  fail "private home path found in public dotfiles"
fi
if grep -R -n -Ei 'Pachuca|20\.1011|98\.7591|20\.11697|98\.73329' "$ROOT/home" >/dev/null 2>&1; then
  fail "developer weather/location state found in public dotfiles"
fi
pass "portable public dotfiles"

# 9. Machine-local files must be examples in source and real files only at runtime.
[[ ! -e "$ROOT/home/.config/hypr/local.conf" ]] || fail "local.conf must not be committed"
[[ ! -e "$ROOT/home/.config/quickshell/hyprl4zy/settings.json" ]] || fail "settings.json must not be committed"
grep -Fxq '.config/hypr/local.conf' "$ROOT/installer/manifests/preserve-home.txt" || fail "local.conf is not preserved"
grep -Fxq '.config/quickshell/hyprl4zy/settings.json' "$ROOT/installer/manifests/preserve-home.txt" || fail "settings.json is not preserved"
pass "local state policy"

# 10. Dotfile install must be idempotent and generate portable local state.
export HYPRLAZY_STATE_DIR="$HOME/.local/state/hyprlazy-test"
export HYPRLAZY_BACKUP_ROOT="$HYPRLAZY_STATE_DIR/backups"
HYPRLAZY_CURRENT_BACKUP=""
export HYPRLAZY_CURRENT_BACKUP
install_dotfiles >/dev/null
[[ -f "$HOME/.config/hypr/local.conf" ]] || fail "local.conf was not created"
[[ -f "$HOME/.config/quickshell/hyprl4zy/settings.json" ]] || fail "settings.json was not created"
python3 - "$HOME/.config/quickshell/hyprl4zy/settings.json" "$HOME" <<'PY' || exit 1
import json, os, sys
path, home = sys.argv[1:]
data = json.load(open(path, encoding='utf-8'))
expected = os.path.join(home, 'Pictures', 'Wallpapers')
if data.get('wallpaperDirectory') != expected:
    raise SystemExit('wrong wallpaperDirectory')
if data.get('currentWallpaper'):
    raise SystemExit('currentWallpaper should start empty')
PY
HYPRLAZY_CURRENT_BACKUP=""
export HYPRLAZY_CURRENT_BACKUP
install_dotfiles >/dev/null
[[ -z "$HYPRLAZY_CURRENT_BACKUP" ]] || fail "second identical dotfile sync created an unnecessary backup"
pass "idempotent dotfile sync"

# 11. Legacy /home/l4zy settings paths must migrate without replacing other preferences.
settings="$HOME/.config/quickshell/hyprl4zy/settings.json"
python3 - "$settings" <<'PY'
import json, sys
p=sys.argv[1]
d=json.load(open(p, encoding='utf-8'))
d['weatherName']='Custom City'
d['wallpaperDirectory']='/home/l4zy/Pictures/Wallpapers'
d['currentWallpaper']='/home/l4zy/Pictures/Wallpapers/missing.jpg'
json.dump(d, open(p,'w',encoding='utf-8'), indent=2)
PY
HYPRLAZY_CURRENT_BACKUP=""
export HYPRLAZY_CURRENT_BACKUP
migrate_legacy_settings_paths >/dev/null
python3 - "$settings" "$HOME" <<'PY' || exit 1
import json, os, sys
p, home = sys.argv[1:]
d=json.load(open(p, encoding='utf-8'))
assert d['weatherName'] == 'Custom City'
assert d['wallpaperDirectory'] == os.path.join(home, 'Pictures', 'Wallpapers')
assert d['currentWallpaper'] == ''
PY
pass "legacy settings migration"

# 12. Existing Dynamic Bubble must be auto-detected and preserved.
fake_theme="$HOME/fake-sddm-theme"
mkdir -p "$fake_theme"
: > "$fake_theme/Main.qml"
HYPRLAZY_SDDM_THEME_DIR="$fake_theme"
HYPRLAZY_SDDM_CHOICE=auto
resolve_sddm_choice
[[ "$HYPRLAZY_SDDM_CHOICE" == keep ]] || fail "existing SDDM theme was not auto-preserved"
pass "SDDM installed-state detection"

# 13. Optional SDDM integration must delegate to Dynamic Bubble's installer.
grep -Fq -- '--with-sddm' "$ROOT/install.sh" || fail "--with-sddm flag missing"
grep -Fq 'https://github.com/L4ZY404/SDDM-THEME-Dynamic_bubble.git' "$ROOT/installer/modules/sddm.sh" || fail "Dynamic Bubble repository missing"
grep -Fq 'bash ./install.sh' "$ROOT/installer/modules/sddm.sh" || fail "Dynamic Bubble standalone installer is not used"
pass "delegated optional SDDM integration"

# 14. A non-zero paru status is tolerated when the required runtime ended up installed.
if ! (
  MOCK_INSTALLED=0
  aur_requirement_satisfied() { [[ "$1" == demo-package && "$MOCK_INSTALLED" == 1 ]]; }
  aur_requirement_label() { printf '%s' "$1"; }
  paru() { MOCK_INSTALLED=1; return 7; }
  install_single_aur_package demo-package
); then
  fail "AUR installed-state verification did not tolerate a non-zero paru status"
fi
pass "AUR post-install verification"

# 15. A truly missing AUR package must still fail.
if (
  aur_requirement_satisfied() { return 1; }
  aur_requirement_label() { printf '%s' "$1"; }
  paru() { return 9; }
  install_single_aur_package missing-package
); then
  fail "missing AUR package was incorrectly accepted"
fi
pass "AUR missing-package detection"

# 16. pacman bulk failures must be verified before aborting.
if ! (
  MOCK_INSTALLED=0
  package_requirement_satisfied() { [[ "$MOCK_INSTALLED" == 1 ]]; }
  sudo() { MOCK_INSTALLED=1; return 4; }
  install_pacman_package_set "mock runtime" 1 demo-package
); then
  fail "pacman installed-state verification did not tolerate a non-zero status"
fi
pass "pacman post-install verification"

# 17. An installed quickshell-git provider must satisfy the official quickshell requirement.
if ! (
  package_installed() { [[ "$1" == quickshell-git ]]; }
  command() { builtin command "$@"; }
  package_requirement_satisfied quickshell
); then
  fail "quickshell-git did not satisfy the Quickshell requirement"
fi
pass "Quickshell provider detection"

# 18. Update mode must not trigger pacman just because an optional desktop app is absent.
if ! (
  HYPRLAZY_INSTALL_MODE=update
  HYPRLAZY_MINIMAL=0
  package_requirement_satisfied() { [[ "$1" != firefox ]]; }
  ! pacman_work_needed
); then
  fail "update mode tried to reconcile the optional desktop program bundle"
fi
pass "incremental update package scope"

# 19. paru is mandatory: when missing, the installer must bootstrap it even on update.
if ! (
  HYPRLAZY_INSTALL_MODE=update
  MOCK_PARU_INSTALLED=0
  command() {
    if [[ "${1:-}" == -v && "${2:-}" == paru ]]; then
      [[ "$MOCK_PARU_INSTALLED" == 1 ]]
      return
    fi
    builtin command "$@"
  }
  git() {
    local dest="${@: -1}"
    mkdir -p "$dest"
    MOCK_PARU_INSTALLED=1
    return 0
  }
  makepkg() { return 0; }
  install_paru >/dev/null
); then
  fail "mandatory paru bootstrap failed"
fi
pass "mandatory paru bootstrap"

# 20. Update mode must preserve optional AUR packages instead of reinstalling them.
if ! (
  HYPRLAZY_INSTALL_MODE=update
  seen_optional=0
  install_single_aur_package() {
    [[ "$1" == catppuccin-gtk-theme-mocha ]] && seen_optional=1
    return 0
  }
  install_aur_packages >/dev/null
  [[ "$seen_optional" == 0 ]]
); then
  fail "update mode attempted to reinstall an optional AUR package"
fi
pass "optional AUR preservation on update"

# 21. Repository wallpapers are seed content: install missing files, preserve existing files,
#     and never delete them merely because a later repo revision removes the seed.
seed_source="$ROOT/home/Pictures/Wallpapers/.installer-seed-test"
seed_target="$HOME/Pictures/Wallpapers/.installer-seed-test"
printf 'repo-v1\n' > "$seed_source"
HYPRLAZY_CURRENT_BACKUP=""
export HYPRLAZY_CURRENT_BACKUP
install_dotfiles >/dev/null
[[ "$(cat "$seed_target")" == 'repo-v1' ]] || fail "wallpaper seed was not installed"
printf 'user-copy\n' > "$seed_target"
printf 'repo-v2\n' > "$seed_source"
HYPRLAZY_CURRENT_BACKUP=""
export HYPRLAZY_CURRENT_BACKUP
install_dotfiles >/dev/null
[[ "$(cat "$seed_target")" == 'user-copy' ]] || fail "wallpaper seed overwrote a user file"
rm -f "$seed_source"
HYPRLAZY_CURRENT_BACKUP=""
export HYPRLAZY_CURRENT_BACKUP
install_dotfiles >/dev/null
[[ "$(cat "$seed_target")" == 'user-copy' ]] || fail "obsolete wallpaper seed deleted a user file"
[[ ! -e "$HOME/Pictures/Wallpapers/.gitkeep" ]] || fail ".gitkeep leaked into the installed wallpaper directory"
pass "wallpaper seed preservation"

# 22. Update widgets and AUR installation must use only paru.
grep -Fq 'paru -Syu' "$ROOT/home/.config/quickshell/hyprl4zy/scripts/update-control.sh" || fail "update control is not using paru"
grep -Fq 'paru -Qua' "$ROOT/home/.config/quickshell/hyprl4zy/scripts/updates-query.sh" || fail "update query is not using paru"
if grep -REqi '\b(yay|pikaur|trizen)\b' \
  "$ROOT/install.sh" \
  "$ROOT/installer" \
  "$ROOT/home/.config/quickshell/hyprl4zy/scripts"; then
  fail "an unsupported AUR helper remains in runtime code"
fi
pass "paru-only update path"

# 23. Unknown long options should fail instead of being silently ignored.

if "$ROOT/install.sh" help --definitely-not-a-real-option >/dev/null 2>&1; then
  fail "unknown installer option was silently accepted"
fi
pass "unknown option validation"

# 25. Wallpaper catalog scans must not synchronously decode video previews.
wall_dir="$HOME/wallpaper-scan-test"
mkdir -p "$wall_dir"
printf 'not-a-real-video' > "$wall_dir/demo.mp4"
scan_output="$(timeout 3 bash "$ROOT/home/.config/quickshell/hyprl4zy/scripts/wallpaper-control.sh" scan "$wall_dir")" \
  || fail "wallpaper catalog scan blocked on video preview generation"
printf '%s\n' "$scan_output" | grep -Fq $'ENTRY\tvideo\t' || fail "video was not returned by wallpaper catalog scan"
pass "non-blocking wallpaper catalog"

# 26. Battery service must select physical UPower devices instead of requiring
# the aggregate display device itself to be flagged as a laptop battery.
grep -Fq 'UPower.devices && UPower.devices.values' "$ROOT/home/.config/quickshell/hyprl4zy/services/PowerService.qml" \
  || fail "PowerService does not inspect physical UPower devices"
grep -Fq 'physicalBatteryReady || displayDevice.isLaptopBattery' "$ROOT/home/.config/quickshell/hyprl4zy/services/PowerService.qml" \
  || fail "PowerService aggregate battery fallback missing"
pass "portable UPower battery detection"

# 27. Global text/icon readability boosts must stay centralized.
grep -Fq 'readonly property real textBoost: 1.06' "$ROOT/home/.config/quickshell/hyprl4zy/services/UiScale.qml" \
  || fail "global text boost missing"
grep -Fq 'readonly property real iconBoost: 1.08' "$ROOT/home/.config/quickshell/hyprl4zy/services/UiScale.qml" \
  || fail "global icon boost missing"
pass "global readability scaling"

# 28. Accept both UPower percentage representations and normalize them to
# the 0..100 range expected by MetricRing and BatteryPopover.
grep -Fq 'return number <= 1.0001 ? number * 100 : number' "$ROOT/home/.config/quickshell/hyprl4zy/services/PowerService.qml" \
  || fail "UPower percentage normalization is missing"
grep -Fq 'function devicePercent(device)' "$ROOT/home/.config/quickshell/hyprl4zy/services/PowerService.qml" \
  || fail "battery percentage energy/capacity fallback is missing"
grep -Fq 'sysfsAvailable && Number(sysfsPercent) > 0' "$ROOT/home/.config/quickshell/hyprl4zy/services/PowerService.qml" \
  || fail "battery percentage sysfs fallback is missing"
pass "UPower percentage normalization"

# 29. The Power / Session surface is attached to the physical right edge: the
# right edge must stay square while the free left corners remain rounded.
grep -Fq 'readonly property real edgeRadius: unit * 0.28' "$ROOT/home/.config/quickshell/hyprl4zy/popovers/PowerPopover.qml" \
  || fail "power surface edge radius is not centralized"
grep -Fq 'anchors.right: parent.right' "$ROOT/home/.config/quickshell/hyprl4zy/popovers/PowerPopover.qml" \
  || fail "power surface right-edge cap is missing"
grep -Fq 'revealMask.width - root.edgeRadius' "$ROOT/home/.config/quickshell/hyprl4zy/popovers/PowerPopover.qml" \
  || fail "power surface right-edge flattening is missing"
grep -Fq 'width: !root.presented' "$ROOT/home/.config/quickshell/hyprl4zy/popovers/PowerPopover.qml" \
  || fail "power surface does not reveal from the right edge by width"
if grep -Fq 'transform: Translate' "$ROOT/home/.config/quickshell/hyprl4zy/popovers/PowerPopover.qml"; then
  fail "power surface still uses clipped off-window translation"
fi
pass "power menu edge geometry"


# 30. Media/Cava should leave the bar layout when nothing is actively playing,
# while retaining an animated collapse/reveal when playback changes.
grep -Fq 'readonly property bool playing: player !== null && player.isPlaying' \
  "$ROOT/home/.config/quickshell/hyprl4zy/modules/media/MediaModule.qml" \
  || fail "MediaModule does not expose active playback state"
grep -Fq 'property bool compactRequested: mediaModule.playing' \
  "$ROOT/home/.config/quickshell/hyprl4zy/bar/Bar.qml" \
  || fail "media island is not tied to active playback"
grep -Fq 'opacity: mediaIsland.compactRequested || mediaIsland.contextExpanded ? 1 : 0' \
  "$ROOT/home/.config/quickshell/hyprl4zy/bar/Bar.qml" \
  || fail "media island animated fade is missing"
pass "idle media island collapse"

# 31. Updates should stay visible while checking, when updates exist, or on an
# error; a successful zero-update result should animate out of the bar layout.
grep -Fq 'property bool compactRequested: updatesModule.checking' \
  "$ROOT/home/.config/quickshell/hyprl4zy/bar/Bar.qml" \
  || fail "updates island visibility policy is missing"
grep -Fq '|| updatesModule.updateCount > 0' \
  "$ROOT/home/.config/quickshell/hyprl4zy/bar/Bar.qml" \
  || fail "updates island does not remain visible for pending updates"
grep -Fq 'opacity: updatesIsland.compactRequested || updatesIsland.contextExpanded ? 1 : 0' \
  "$ROOT/home/.config/quickshell/hyprl4zy/bar/Bar.qml" \
  || fail "updates island animated fade is missing"
pass "zero-update island collapse"

# 32. Tray delegates must receive a real index so explicit two-column placement
# does not stack every SNI icon at 0,0. Context menus use Quickshell's native
# QsMenuAnchor bound directly to SystemTrayItem.menu.
grep -Fq 'required property int index' \
  "$ROOT/home/.config/quickshell/hyprl4zy/modules/tray/TrayModule.qml" \
  || fail "tray delegate index is not declared"
grep -Fq 'singleItemRow' \
  "$ROOT/home/.config/quickshell/hyprl4zy/modules/tray/TrayModule.qml" \
  || fail "tray odd-row centering is missing"
grep -Fq 'QsMenuAnchor {' \
  "$ROOT/home/.config/quickshell/hyprl4zy/modules/tray/TrayModule.qml" \
  || fail "tray native menu anchor is missing"
grep -Fq 'anchor.item: trayButton' \
  "$ROOT/home/.config/quickshell/hyprl4zy/modules/tray/TrayModule.qml" \
  || fail "tray menu is not anchored to the clicked icon"
grep -Fq 'acceptedButtons: Qt.LeftButton | Qt.MiddleButton | Qt.RightButton' \
  "$ROOT/home/.config/quickshell/hyprl4zy/modules/tray/TrayModule.qml" \
  || fail "tray right click is not accepted"
pass "tray indexed layout and context menu"

printf '\nAll installer tests passed.\n'
