import { commandExists, execAsync, shellQuote, spawn } from "../lib/shell"

export type PowerProfileKind = "performance" | "balanced" | "power-saver" | "unknown"
export type PowerProfileStatus = "idle" | "checking" | "ready" | "error"

export type PowerProfileState = {
  available: boolean
  profile: PowerProfileKind
  profiles: PowerProfileKind[]
  driver: string
  status: PowerProfileStatus
  error: string
  lastChecked: number
}

export const EMPTY_POWER_PROFILE: PowerProfileState = {
  available: false,
  profile: "unknown",
  profiles: [],
  driver: "—",
  status: "idle",
  error: "",
  lastChecked: 0,
}

const REFRESH_THROTTLE_MS = 1600
const DEFAULT_PROFILES: PowerProfileKind[] = ["performance", "balanced", "power-saver"]

let cachedState = EMPTY_POWER_PROFILE
let refreshPromise: Promise<PowerProfileState> | null = null
let lastRefreshRequestMs = 0

function isProfile(value: string): value is PowerProfileKind {
  return ["performance", "balanced", "power-saver"].includes(value)
}

function normalizeProfile(value: string): PowerProfileKind {
  const trimmed = value.trim()

  return isProfile(trimmed) ? trimmed : "unknown"
}

function parseProfileList(output: string) {
  const profiles: PowerProfileKind[] = []
  let driver = "—"

  for (const line of output.split("\n")) {
    const profileMatch = line.match(/^\s*\*?\s*(performance|balanced|power-saver)\s*:/)

    if (profileMatch) {
      const profile = normalizeProfile(profileMatch[1])

      if (profile !== "unknown" && !profiles.includes(profile)) {
        profiles.push(profile)
      }
    }

    const driverMatch = line.match(/^\s*Driver:\s*(.+)$/)

    if (driverMatch && driver === "—") {
      driver = driverMatch[1].trim()
    }
  }

  return {
    profiles: profiles.length > 0 ? profiles : DEFAULT_PROFILES,
    driver,
  }
}

function parseState(output: string): PowerProfileState {
  const [currentRaw = "", listRaw = ""] = output.split("\n---profiles---\n")
  const { profiles, driver } = parseProfileList(listRaw)
  const profile = normalizeProfile(currentRaw)

  return {
    available: true,
    profile,
    profiles,
    driver,
    status: "ready",
    error: "",
    lastChecked: Date.now(),
  }
}

export function readPowerProfile(): PowerProfileState {
  return cachedState
}

export async function refreshPowerProfile(force = false): Promise<PowerProfileState> {
  const now = Date.now()

  if (
    !force &&
    cachedState.lastChecked > 0 &&
    now - lastRefreshRequestMs < REFRESH_THROTTLE_MS
  ) {
    return cachedState
  }

  lastRefreshRequestMs = now

  if (refreshPromise) {
    return refreshPromise
  }

  if (!commandExists("powerprofilesctl")) {
    cachedState = {
      ...EMPTY_POWER_PROFILE,
      status: "error",
      error: "powerprofilesctl not found",
      lastChecked: Date.now(),
    }
    return cachedState
  }

  cachedState = {
    ...cachedState,
    status: "checking",
    error: "",
  }

  refreshPromise = execAsync([
    "bash",
    "-lc",
    `printf '%s\n---profiles---\n%s\n' "$(powerprofilesctl get 2>/dev/null)" "$(powerprofilesctl list 2>/dev/null)"`,
  ])
    .then((output) => {
      cachedState = parseState(output)
      return cachedState
    })
    .catch((error) => {
      cachedState = {
        ...cachedState,
        available: false,
        status: "error",
        error: String(error || "Unable to read power profile"),
        lastChecked: Date.now(),
      }
      return cachedState
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

export function getPowerProfileIcon(state: PowerProfileState) {
  if (!state.available) return "󰌵"
  if (state.profile === "performance") return "󰓅"
  if (state.profile === "power-saver") return "󰌪"
  if (state.profile === "balanced") return "󰾅"

  return "󰌵"
}

export function getPowerProfileClass(state: PowerProfileState) {
  if (!state.available || state.status === "error") return "connection-offline"
  if (state.profile === "performance") return "connection-warning"

  return "connection-online"
}

export function getPowerProfileTitle(state: PowerProfileState) {
  if (!state.available) return "Power Profile"

  return "Power Profile"
}

export function getPowerProfileValue(state: PowerProfileState) {
  if (!state.available) return "Unavailable"
  if (state.profile === "power-saver") return "Power saver"
  if (state.profile === "performance") return "Performance"
  if (state.profile === "balanced") return "Balanced"

  return "Unknown"
}

export function getPowerProfileDetail(state: PowerProfileState) {
  if (state.status === "error") return state.error || "Unable to read profile"
  if (!state.available) return "Not available"

  return state.driver || "powerprofilesctl"
}

export function getAvailableProfilesLabel(state: PowerProfileState) {
  if (!state.available || state.profiles.length === 0) return "—"

  return state.profiles
    .map((profile) => {
      if (profile === "power-saver") return "Power saver"
      if (profile === "performance") return "Performance"
      return "Balanced"
    })
    .join(", ")
}

export function cyclePowerProfile(state = cachedState) {
  const profiles = state.profiles.length > 0 ? state.profiles : DEFAULT_PROFILES
  const currentIndex = profiles.indexOf(state.profile)
  const nextProfile = profiles[(currentIndex + 1 + profiles.length) % profiles.length]

  if (!nextProfile || nextProfile === "unknown") {
    return
  }

  spawn(`powerprofilesctl set ${nextProfile}`)
}

export function openPowerSettings() {
  spawn("sh -c 'gnome-control-center power 2>/dev/null || xfce4-power-manager-settings 2>/dev/null || true'")
}

export function setPowerProfile(profile: PowerProfileKind) {
  if (profile === "unknown" || !commandExists("powerprofilesctl")) return
  spawn(`powerprofilesctl set ${shellQuote(profile)}`)
}
