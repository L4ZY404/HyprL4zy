import Gio from "gi://Gio?version=2.0"
import { clamp } from "../lib/math"
import { fileExists, readFile, spawn } from "../lib/shell"

export type BatteryState = {
  available: boolean
  path: string
  name: string
  percent: number
  status: string
  charging: boolean
  discharging: boolean
  full: boolean
  powerWatts: number
  timeSeconds: number
  healthPercent: number
  technology: string
  cycleCount: number
  statusText: "idle" | "ready" | "error"
  error: string
  lastChecked: number
}

const BATTERY_ICONS = [
  "󰁺",
  "󰁻",
  "󰁼",
  "󰁽",
  "󰁾",
  "󰁿",
  "󰂀",
  "󰂁",
  "󰂂",
  "󰁹",
]

const BATTERY_PATH_REFRESH_MS = 30000
const BATTERY_REFRESH_THROTTLE_MS = 1800

export const EMPTY_BATTERY: BatteryState = {
  available: false,
  path: "",
  name: "Battery",
  percent: 0,
  status: "Unavailable",
  charging: false,
  discharging: false,
  full: false,
  powerWatts: 0,
  timeSeconds: 0,
  healthPercent: 0,
  technology: "—",
  cycleCount: 0,
  statusText: "idle",
  error: "",
  lastChecked: 0,
}

let cachedBatteryPath = ""
let lastPathCheckMs = 0
let cachedBatteryState = EMPTY_BATTERY
let batteryRefreshPromise: Promise<BatteryState> | null = null
let lastRefreshRequestMs = 0

function parseNumber(raw: string) {
  const value = Number(raw.trim())

  return Number.isFinite(value) ? value : 0
}

function readNumber(path: string) {
  return parseNumber(readFile(path))
}

function findBatteryPathNow() {
  let enumerator: Gio.FileEnumerator | null = null
  try {
    enumerator = Gio.File.new_for_path("/sys/class/power_supply").enumerate_children("standard::name", Gio.FileQueryInfoFlags.NONE, null)
    let info: Gio.FileInfo | null
    while ((info = enumerator.next_file(null))) {
      const path = `/sys/class/power_supply/${info.get_name()}`
      if (readFile(`${path}/type`) === "Battery" && readFile(`${path}/scope`) !== "Device") return path
    }
  } catch { /* A desktop may not expose a battery. */ }
  finally { enumerator?.close(null) }
  return ""
}

export function findBatteryPath(force = false) {
  const now = Date.now()

  if (!force && now - lastPathCheckMs < BATTERY_PATH_REFRESH_MS) {
    return cachedBatteryPath
  }

  lastPathCheckMs = now
  cachedBatteryPath = findBatteryPathNow()

  return cachedBatteryPath
}

export function hasBattery() {
  return findBatteryPath().length > 0
}

function getEnergyNow(path: string) {
  return readNumber(`${path}/energy_now`) || readNumber(`${path}/charge_now`)
}

function getEnergyFull(path: string) {
  return readNumber(`${path}/energy_full`) || readNumber(`${path}/charge_full`)
}

function getEnergyDesign(path: string) {
  return readNumber(`${path}/energy_full_design`) || readNumber(`${path}/charge_full_design`)
}

function getPowerNow(path: string) {
  const powerNow = readNumber(`${path}/power_now`)

  if (powerNow > 0) {
    return powerNow
  }

  const currentNow = readNumber(`${path}/current_now`)
  const voltageNow = readNumber(`${path}/voltage_now`)

  if (currentNow > 0 && voltageNow > 0) {
    return (currentNow * voltageNow) / 1000000
  }

  return 0
}

function computeTimeSeconds(status: string, energyNow: number, energyFull: number, powerNow: number) {
  if (powerNow <= 0) {
    return 0
  }

  const normalizedStatus = status.toLowerCase()
  const remainingEnergy = normalizedStatus === "charging"
    ? Math.max(0, energyFull - energyNow)
    : energyNow

  if (remainingEnergy <= 0) {
    return 0
  }

  return Math.round((remainingEnergy / powerNow) * 3600)
}

function readBatteryNow(): BatteryState {
  const path = findBatteryPath()
  const now = Date.now()

  if (!path) {
    cachedBatteryState = {
      ...EMPTY_BATTERY,
      statusText: "ready",
      lastChecked: now,
    }
    return cachedBatteryState
  }

  const capacityRaw = readFile(`${path}/capacity`)
  const status = readFile(`${path}/status`) || "Unknown"
  const percent = clamp(parseNumber(capacityRaw), 0, 100)
  const name = path.split("/").pop() || "BAT"
  const energyNow = getEnergyNow(path)
  const energyFull = getEnergyFull(path)
  const energyDesign = getEnergyDesign(path)
  const powerNow = getPowerNow(path)
  const healthPercent = energyDesign > 0
    ? clamp(Math.round((energyFull / energyDesign) * 100), 0, 150)
    : 0

  cachedBatteryState = {
    available: true,
    path,
    name,
    percent,
    status,
    charging: status === "Charging",
    discharging: status === "Discharging",
    full: status === "Full" || percent >= 100,
    powerWatts: powerNow / 1000000,
    timeSeconds: computeTimeSeconds(status, energyNow, energyFull, powerNow),
    healthPercent,
    technology: readFile(`${path}/technology`) || "—",
    cycleCount: readNumber(`${path}/cycle_count`),
    statusText: "ready",
    error: "",
    lastChecked: now,
  }

  return cachedBatteryState
}

export function readBattery(): BatteryState {
  return cachedBatteryState.available || cachedBatteryState.lastChecked > 0
    ? cachedBatteryState
    : readBatteryNow()
}

export async function refreshBattery(force = false): Promise<BatteryState> {
  const now = Date.now()

  if (
    !force &&
    cachedBatteryState.lastChecked > 0 &&
    now - lastRefreshRequestMs < BATTERY_REFRESH_THROTTLE_MS
  ) {
    return cachedBatteryState
  }

  lastRefreshRequestMs = now

  if (batteryRefreshPromise) {
    return batteryRefreshPromise
  }

  batteryRefreshPromise = Promise.resolve()
    .then(() => readBatteryNow())
    .catch((error) => {
      cachedBatteryState = {
        ...cachedBatteryState,
        statusText: "error",
        error: String(error || "Unable to read battery"),
        lastChecked: Date.now(),
      }
      return cachedBatteryState
    })
    .finally(() => {
      batteryRefreshPromise = null
    })

  return batteryRefreshPromise
}

export function getBatteryIcon(state: BatteryState) {
  if (!state.available) return "󰂑"
  if (state.charging) return "󰂄"
  if (state.full) return "󰁹"

  const index = clamp(Math.floor((state.percent / 100) * 9), 0, 9)
  return BATTERY_ICONS[index]
}

export function getBatteryTitle(state: BatteryState) {
  if (!state.available) return "Battery"
  if (state.charging) return "Charging"
  if (state.full) return "Battery full"

  return "Battery"
}

export function getBatteryDetail(state: BatteryState) {
  if (!state.available) return "Not detected"
  if (state.statusText === "error") return state.error || "Battery read error"

  return `${state.status} • ${state.name}`
}

export function getBatteryStateClass(state: BatteryState) {
  if (!state.available) return "disabled"
  if (!state.charging && state.percent <= 15) return "critical"
  if (!state.charging && state.percent <= 30) return "warning"

  return "normal"
}

export function getBatteryPowerLabel(state: BatteryState) {
  if (!state.available || state.powerWatts <= 0) return "—"

  return `${state.powerWatts.toFixed(1)} W`
}

export function getBatteryTimeLabel(state: BatteryState) {
  if (!state.available || state.timeSeconds <= 0) return "—"

  const hours = Math.floor(state.timeSeconds / 3600)
  const minutes = Math.floor((state.timeSeconds % 3600) / 60)

  if (hours <= 0) {
    return `${minutes} min`
  }

  return `${hours}h ${minutes}m`
}

export function getBatteryHealthLabel(state: BatteryState) {
  if (!state.available || state.healthPercent <= 0) return "—"

  return `${state.healthPercent}%`
}

export function getBatteryCycleLabel(state: BatteryState) {
  if (!state.available || state.cycleCount <= 0) return "—"

  return `${state.cycleCount}`
}

export function openPowerSettings() {
  spawn("sh -c 'gnome-control-center power 2>/dev/null || xfce4-power-manager-settings 2>/dev/null || true'")
}
