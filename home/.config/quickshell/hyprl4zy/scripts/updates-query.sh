#!/usr/bin/env bash
set -u

export LC_ALL=C

official_backend="none"
aur_helper="none"
official_warning=""
aur_warning=""
official_output=""
aur_output=""

run_checkupdates() {
    local out err status
    err="$(mktemp)"
    set +e
    out="$(timeout 90 checkupdates 2>"$err")"
    status=$?
    set -e
    if [[ $status -eq 0 || $status -eq 2 ]]; then
        official_backend="checkupdates"
        official_output="$out"
        rm -f "$err"
        return 0
    fi
    official_warning="checkupdates failed: $(tr '\n' ' ' < "$err" | sed 's/[[:space:]]\+/ /g' | sed 's/^ //;s/ $//')"
    rm -f "$err"
    return 1
}

run_pacman_cache() {
    local out err status
    err="$(mktemp)"
    set +e
    out="$(timeout 45 pacman -Qu 2>"$err")"
    status=$?
    set -e
    if [[ $status -eq 0 || $status -eq 1 ]]; then
        official_backend="pacman-cache"
        official_output="$out"
        if [[ -z "$official_warning" ]]; then
            official_warning="Fresh repository check unavailable; showing pacman's current sync cache."
        fi
        rm -f "$err"
        return 0
    fi
    local msg
    msg="$(tr '\n' ' ' < "$err" | sed 's/[[:space:]]\+/ /g' | sed 's/^ //;s/ $//')"
    rm -f "$err"
    [[ -n "$msg" ]] && official_warning="${official_warning:+$official_warning }pacman -Qu failed: $msg"
    return 1
}

if command -v checkupdates >/dev/null 2>&1; then
    run_checkupdates || {
        command -v pacman >/dev/null 2>&1 && run_pacman_cache || true
    }
elif command -v pacman >/dev/null 2>&1; then
    official_warning="pacman-contrib/checkupdates is not installed; showing pacman's current sync cache."
    run_pacman_cache || true
fi

if [[ "$official_backend" == "none" ]]; then
    printf 'ERROR\tofficial\t%s\n' "${official_warning:-No supported Arch update checker is available.}"
    exit 3
fi

if command -v paru >/dev/null 2>&1; then
    aur_helper="paru"
    err="$(mktemp)"
    set +e
    aur_output="$(timeout 90 paru -Qua 2>"$err")"
    status=$?
    set -e
    if [[ $status -ne 0 && $status -ne 1 ]]; then
        aur_warning="$(tr '\n' ' ' < "$err" | sed 's/[[:space:]]\+/ /g' | sed 's/^ //;s/ $//')"
        aur_output=""
    elif [[ $status -eq 1 && -s "$err" ]]; then
        aur_warning="$(tr '\n' ' ' < "$err" | sed 's/[[:space:]]\+/ /g' | sed 's/^ //;s/ $//')"
        aur_output=""
    fi
    rm -f "$err"
else
    aur_warning="paru is required by HyprL4zy but was not found. Run the installer to repair it."
fi

printf 'META\tbackend\t%s\n' "$official_backend"
printf 'META\thelper\t%s\n' "$aur_helper"
[[ -n "$official_warning" ]] && printf 'WARN\tofficial\t%s\n' "$official_warning"
[[ -n "$aur_warning" ]] && printf 'WARN\taur\t%s\n' "$aur_warning"

while IFS= read -r line; do
    [[ -n "$line" ]] && printf 'PKG\trepo\t%s\n' "$line"
done <<< "$official_output"

while IFS= read -r line; do
    [[ -n "$line" ]] && printf 'PKG\taur\t%s\n' "$line"
done <<< "$aur_output"

# An empty final package list is a successful check.
exit 0
