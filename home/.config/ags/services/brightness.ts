import { clamp } from "../lib/math"
import { commandExists, execAsync, spawn } from "../lib/shell"

export type BrightnessStatus = "idle" | "checking" | "ready" | "error"

export type BrightnessState = {
  available: boolean
  device: string
  kind: string
  current: number
  max: number
  percent: number
  status: BrightnessStatus
  error: string
  lastChecked: number
}

export const EMPTY_BRIGHTNESS: BrightnessState = {
  available: false,
  device: "—",
  kind: "—",
  current: 0,
  max: 0,
  percent: 0,
  status: "idle",
  error: "",
  lastChecked: 0,
}

const REFRESH_THROTTLE_MS = 900

let cachedState = EMPTY_BRIGHTNESS
let refreshPromise: Promise<BrightnessState> | null = null
let lastRefreshRequestMs = 0

function parseNumber(value: string, fallback = 0) {
  const parsed = Number(value.trim())

  return Number.isFinite(parsed) ? parsed : fallback
}

function parseBrightnessctl(output: string): BrightnessState {
  const [device = "—", kind = "—", currentRaw = "0", percentRaw = "0%", maxRaw = "0"] = output
    .trim()
    .split(",")
  const current = parseNumber(currentRaw)
  const max = parseNumber(maxRaw)
  const percentMatch = percentRaw.match(/(\d+)/)
  const percent = percentMatch
    ? clamp(Number(percentMatch[1]), 0, 100)
    : max > 0
      ? clamp(Math.round((current / max) * 100), 0, 100)
      : 0

  return {
    available: device !== "—" && max > 0,
    device: device || "—",
    kind: kind || "—",
    current,
    max,
    percent,
    status: "ready",
    error: "",
    lastChecked: Date.now(),
  }
}

export function readBrightness(): BrightnessState {
  return cachedState
}

export async function refreshBrightness(force = false): Promise<BrightnessState> {
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

  if (!commandExists("brightnessctl")) {
    cachedState = {
      ...EMPTY_BRIGHTNESS,
      status: "error",
      error: "brightnessctl not found",
      lastChecked: Date.now(),
    }
    return cachedState
  }

  cachedState = {
    ...cachedState,
    status: "checking",
    error: "",
  }

  refreshPromise = execAsync(["brightnessctl", "--class=backlight", "-m"])
    .then((output) => {
      cachedState = parseBrightnessctl(output)
      return cachedState
    })
    .catch((error) => {
      cachedState = {
        ...cachedState,
        available: false,
        status: "error",
        error: String(error || "Unable to read brightness"),
        lastChecked: Date.now(),
      }
      return cachedState
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

export function getBrightnessIcon(state: BrightnessState) {
  if (!state.available) return "󰃞"
  if (state.percent <= 25) return "󰃞"
  if (state.percent <= 60) return "󰃟"

  return "󰃠"
}

export function getBrightnessClass(state: BrightnessState) {
  if (!state.available || state.status === "error") return "disabled"
  if (state.percent >= 90) return "warning"

  return "normal"
}

export function getBrightnessDetail(state: BrightnessState) {
  if (state.status === "error") return state.error || "Unable to read brightness"
  if (!state.available) return "Not available"

  return state.device
}

export function changeBrightness(delta: number) {
  if (delta === 0) return

  const sign = delta > 0 ? "+" : "-"
  spawn(`brightnessctl --class=backlight set ${Math.abs(delta)}%${sign}`)
}

export function setBrightness(percent: number) {
  spawn(`brightnessctl --class=backlight set ${clamp(Math.round(percent), 1, 100)}%`)
}
