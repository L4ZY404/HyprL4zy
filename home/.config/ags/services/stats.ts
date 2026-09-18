import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"

import { clamp } from "../lib/math"
import { commandExists, readFile, shellQuote, spawn } from "../lib/shell"

export type CpuSample = {
  idle: number
  total: number
}

export type StatRow = {
  label: string
  value: string
}

export type StatState = {
  id: string
  icon: string
  label: string
  value: number
  max: number
  unit: string
  detail: string
  active: boolean
  warningAt: number
  criticalAt: number
  rows: StatRow[]
}

type MemorySnapshot = {
  percent: number
  usedGb: number
  availableGb: number
  totalGb: number
  swapPercent: number
  swapUsedGb: number
  swapTotalGb: number
}

type TemperatureSnapshot = {
  available: boolean
  value: number
  sensors: number
  source: string
}

type StatsSnapshot = {
  cpu: StatState
  memory: StatState
  temperature: StatState
}

const STATS_CACHE_MS = 650
const TEMPERATURE_PATH_REFRESH_MS = 30000
const STATIC_INFO_REFRESH_MS = 60000

let previousCpuSample: CpuSample | null = null
let cachedStats: StatsSnapshot | null = null
let lastStatsReadMs = 0
let cachedTemperaturePaths: string[] = []
let lastTemperaturePathReadMs = 0
let cachedCpuCores = 0
let cachedCpuModel = "CPU"
let lastStaticInfoMs = 0

function readCpuSample(): CpuSample | null {
  const line = readFile("/proc/stat")
    .split("\n")
    .find((entry) => entry.startsWith("cpu "))

  if (!line) return null

  const values = line
    .trim()
    .split(/\s+/)
    .slice(1)
    .map(Number)

  if (values.length < 4) return null

  const user = values[0] ?? 0
  const nice = values[1] ?? 0
  const system = values[2] ?? 0
  const idle = values[3] ?? 0
  const iowait = values[4] ?? 0
  const irq = values[5] ?? 0
  const softirq = values[6] ?? 0
  const steal = values[7] ?? 0

  return {
    idle: idle + iowait,
    total: user + nice + system + idle + iowait + irq + softirq + steal,
  }
}

function readCpuUsage() {
  const current = readCpuSample()

  if (!current) return 0

  if (!previousCpuSample) {
    previousCpuSample = current
    return 0
  }

  const totalDiff = current.total - previousCpuSample.total
  const idleDiff = current.idle - previousCpuSample.idle

  previousCpuSample = current

  if (totalDiff <= 0) return 0

  return clamp(Math.round(((totalDiff - idleDiff) / totalDiff) * 100))
}

function refreshStaticCpuInfo() {
  const now = Date.now()

  if (cachedCpuCores > 0 && now - lastStaticInfoMs < STATIC_INFO_REFRESH_MS) {
    return
  }

  lastStaticInfoMs = now

  const cpuInfo = readFile("/proc/cpuinfo")
  const cores = cpuInfo.match(/^processor\s*:/gm)?.length ?? 0
  const model = cpuInfo.match(/^model name\s*:\s*(.+)$/m)?.[1]?.trim()

  cachedCpuCores = cores || cachedCpuCores || 1
  cachedCpuModel = model || cachedCpuModel
}

function readCpuFrequencyGhz() {
  const cpuInfo = readFile("/proc/cpuinfo")
  const values = [...cpuInfo.matchAll(/^cpu MHz\s*:\s*(\d+(?:\.\d+)?)$/gm)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0)

  if (values.length === 0) {
    return "—"
  }

  const averageMhz = values.reduce((sum, value) => sum + value, 0) / values.length

  return `${(averageMhz / 1000).toFixed(2)} GHz`
}

function readLoadAverage() {
  const parts = readFile("/proc/loadavg").split(/\s+/)

  if (parts.length < 3) {
    return "—"
  }

  return `${parts[0]} ${parts[1]} ${parts[2]}`
}

function readUptime() {
  const seconds = Number(readFile("/proc/uptime").split(/\s+/)[0] ?? 0)

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "—"
  }

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) {
    return `${days}d ${hours}h`
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${minutes}m`
}

function getMeminfoValue(meminfo: string, key: string) {
  const match = meminfo.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"))

  return match ? Number(match[1]) : 0
}

function readMemoryUsage(): MemorySnapshot {
  const meminfo = readFile("/proc/meminfo")

  const total = getMeminfoValue(meminfo, "MemTotal")
  const available = getMeminfoValue(meminfo, "MemAvailable")
  const swapTotal = getMeminfoValue(meminfo, "SwapTotal")
  const swapFree = getMeminfoValue(meminfo, "SwapFree")

  if (total <= 0) {
    return {
      percent: 0,
      usedGb: 0,
      availableGb: 0,
      totalGb: 0,
      swapPercent: 0,
      swapUsedGb: 0,
      swapTotalGb: 0,
    }
  }

  const used = total - available
  const swapUsed = Math.max(0, swapTotal - swapFree)

  return {
    percent: clamp(Math.round((used / total) * 100)),
    usedGb: used / 1024 / 1024,
    availableGb: available / 1024 / 1024,
    totalGb: total / 1024 / 1024,
    swapPercent: swapTotal > 0 ? clamp(Math.round((swapUsed / swapTotal) * 100)) : 0,
    swapUsedGb: swapUsed / 1024 / 1024,
    swapTotalGb: swapTotal / 1024 / 1024,
  }
}

function refreshTemperaturePaths() {
  const now = Date.now()

  if (
    lastTemperaturePathReadMs > 0 &&
    now - lastTemperaturePathReadMs < TEMPERATURE_PATH_REFRESH_MS
  ) {
    return cachedTemperaturePaths
  }

  lastTemperaturePathReadMs = now

  const paths: string[] = []
  function entries(path: string): string[] {
    const result: string[] = []
    let enumerator: Gio.FileEnumerator | null = null
    try {
      enumerator = Gio.File.new_for_path(path).enumerate_children("standard::name", Gio.FileQueryInfoFlags.NONE, null)
      let info: Gio.FileInfo | null
      while ((info = enumerator.next_file(null))) result.push(info.get_name())
    } catch { /* Missing sysfs directories are normal on some hardware. */ }
    finally { enumerator?.close(null) }
    return result
  }
  for (const zone of entries("/sys/class/thermal")) {
    if (/^thermal_zone/.test(zone)) paths.push(`/sys/class/thermal/${zone}/temp`)
  }
  for (const chip of entries("/sys/class/hwmon")) {
    for (const name of entries(`/sys/class/hwmon/${chip}`)) {
      if (/^temp\d+_input$/.test(name)) paths.push(`/sys/class/hwmon/${chip}/${name}`)
    }
  }
  cachedTemperaturePaths = paths


  return cachedTemperaturePaths
}

function readTemperature(): TemperatureSnapshot {
  const readings = refreshTemperaturePaths()
    .map((path) => {
      const rawValue = Number(readFile(path).trim())
      const value = rawValue > 1000 ? rawValue / 1000 : rawValue

      return {
        path,
        value,
      }
    })
    .filter((item) => Number.isFinite(item.value))
    .filter((item) => item.value > 0 && item.value < 130)

  if (readings.length === 0) {
    return {
      available: false,
      value: 0,
      sensors: 0,
      source: "—",
    }
  }

  const hottest = readings.reduce((current, next) => {
    return next.value > current.value ? next : current
  }, readings[0])

  return {
    available: true,
    value: Math.round(hottest.value),
    sensors: readings.length,
    source: hottest.path.replace("/sys/class/", ""),
  }
}

function formatGb(value: number) {
  return `${value.toFixed(1)} GiB`
}

function buildStats(): StatsSnapshot {
  refreshStaticCpuInfo()

  const cpu = readCpuUsage()
  const memory = readMemoryUsage()
  const temperature = readTemperature()

  return {
    cpu: {
      id: "cpu",
      icon: "",
      label: "CPU",
      value: cpu,
      max: 100,
      unit: "%",
      detail: `Load: ${readLoadAverage()}`,
      active: true,
      warningAt: 70,
      criticalAt: 90,
      rows: [
        { label: "Usage", value: `${cpu}%` },
        { label: "Cores", value: `${cachedCpuCores}` },
        { label: "Frequency", value: readCpuFrequencyGhz() },
        { label: "Load", value: readLoadAverage() },
        { label: "Uptime", value: readUptime() },
        { label: "Model", value: cachedCpuModel },
      ],
    } satisfies StatState,

    memory: {
      id: "ram",
      icon: "",
      label: "RAM",
      value: memory.percent,
      max: 100,
      unit: "%",
      detail: `${formatGb(memory.usedGb)} / ${formatGb(memory.totalGb)}`,
      active: true,
      warningAt: 75,
      criticalAt: 90,
      rows: [
        { label: "Used", value: formatGb(memory.usedGb) },
        { label: "Available", value: formatGb(memory.availableGb) },
        { label: "Total", value: formatGb(memory.totalGb) },
        { label: "Swap", value: `${memory.swapPercent}%` },
        { label: "Swap used", value: `${formatGb(memory.swapUsedGb)} / ${formatGb(memory.swapTotalGb)}` },
      ],
    } satisfies StatState,

    temperature: {
      id: "temp",
      icon: "",
      label: "Temperature",
      value: temperature.value,
      max: 100,
      unit: "°C",
      detail: temperature.available ? `${temperature.sensors} sensors` : "Sensor not detected",
      active: temperature.available,
      warningAt: 70,
      criticalAt: 85,
      rows: [
        { label: "Current", value: temperature.available ? `${temperature.value}°C` : "—" },
        { label: "Sensors", value: `${temperature.sensors}` },
        { label: "Source", value: temperature.source },
        { label: "Warning", value: "70°C" },
        { label: "Critical", value: "85°C" },
      ],
    } satisfies StatState,
  }
}

export function readStats(force = false) {
  const now = Date.now()

  if (!force && cachedStats && now - lastStatsReadMs < STATS_CACHE_MS) {
    return cachedStats
  }

  cachedStats = buildStats()
  lastStatsReadMs = now

  return cachedStats
}

export function refreshStats() {
  return readStats(true)
}

export function getStatClass(state: StatState) {
  if (!state.active) return "disabled"
  if (state.value >= state.criticalAt) return "critical"
  if (state.value >= state.warningAt) return "warning"

  return "normal"
}

function getTerminalCommand() {
  const terminal = GLib.getenv("TERMINAL")

  if (terminal) {
    return terminal
  }

  for (const candidate of ["alacritty", "kitty", "foot", "wezterm", "ghostty"]) {
    if (commandExists(candidate)) {
      return candidate
    }
  }

  return ""
}

export function openSystemMonitor() {
  const terminal = getTerminalCommand()

  if (commandExists("btop") && terminal) {
    if (terminal === "wezterm") {
      spawn(`${terminal} start btop`)
      return
    }

    spawn(`${terminal} -e btop`)
    return
  }

  if (commandExists("gnome-system-monitor")) {
    spawn("gnome-system-monitor")
    return
  }

  const command = commandExists("top") ? "top" : "htop"

  if (terminal && commandExists(command)) {
    spawn(`${terminal} -e ${shellQuote(command)}`)
  }
}

export function dropFilesystemCache() {
  if (commandExists("pkexec")) {
    spawn(`pkexec sh -c ${shellQuote("sync; echo 3 > /proc/sys/vm/drop_caches")}`)
    return
  }

  if (commandExists("notify-send")) {
    spawn(`notify-send "System Maintenance" ${shellQuote("pkexec is required to drop filesystem caches safely")}`)
  }
}
