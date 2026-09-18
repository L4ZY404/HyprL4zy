import { commandExists, execAsync, shellQuote, spawn } from "../lib/shell"

export type DiskKind = "safe" | "warn" | "critical" | "offline"

export type DiskState = {
  path: string
  filesystem: string
  usedPercent: number | null
  totalBytes: number | null
  usedBytes: number | null
  availableBytes: number | null
  kind: DiskKind
  icon: string
  label: string
  fetchedAt: number
}

export const DISK_REFRESH_MS = 60 * 1000

export const DISK_CONFIG = {
  path: "/",
  warningPercent: 75,
  criticalPercent: 90,
}

export const EMPTY_DISK: DiskState = {
  path: DISK_CONFIG.path,
  filesystem: "--",
  usedPercent: null,
  totalBytes: null,
  usedBytes: null,
  availableBytes: null,
  kind: "offline",
  icon: "󰋊",
  label: "--%",
  fetchedAt: 0,
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

function getDiskKind(usedPercent: number | null): DiskKind {
  if (usedPercent === null) {
    return "offline"
  }

  if (usedPercent >= DISK_CONFIG.criticalPercent) {
    return "critical"
  }

  if (usedPercent >= DISK_CONFIG.warningPercent) {
    return "warn"
  }

  return "safe"
}

function formatPercent(value: number | null) {
  return value === null ? "--%" : `${Math.round(value)}%`
}

function kibToBytes(value: number | null) {
  return value === null ? null : value * 1024
}

export function formatBytes(value: number | null) {
  if (value === null) {
    return "--"
  }

  const units = ["B", "KiB", "MiB", "GiB", "TiB"]
  let size = value
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const decimals = unitIndex <= 1 ? 0 : 1

  return `${size.toFixed(decimals)} ${units[unitIndex]}`
}

export function getDiskClass(state: DiskState) {
  return `disk-${state.kind}`
}

export function formatDiskLabel(state: DiskState) {
  return state.label
}

export function formatDiskValue(state: DiskState) {
  return `${formatPercent(state.usedPercent)} used`
}

export function formatDiskDetail(state: DiskState) {
  if (state.kind === "offline") {
    return "Disk data unavailable"
  }

  return [
    `Used: ${formatBytes(state.usedBytes)}`,
    `Free: ${formatBytes(state.availableBytes)}`,
    `Total: ${formatBytes(state.totalBytes)}`,
  ].join(" | ")
}

export function formatDiskExtra(state: DiskState) {
  if (state.kind === "offline") {
    return `Path: ${state.path}`
  }

  return `Filesystem: ${state.filesystem} | Path: ${state.path}`
}

async function fetchDisk(): Promise<DiskState> {
  try {
    const output = await execAsync([
      "bash",
      "-c",
      `df -kP ${shellQuote(DISK_CONFIG.path)} | tail -n 1`,
    ])

    const line = output.trim()

    if (!line) {
      return {
        ...EMPTY_DISK,
        fetchedAt: Date.now(),
      }
    }

    const parts = line.split(/\s+/)

    if (parts.length < 6) {
      return {
        ...EMPTY_DISK,
        fetchedAt: Date.now(),
      }
    }

    const filesystem = parts[0] ?? "--"
    const totalKib = numberOrNull(parts[1])
    const usedKib = numberOrNull(parts[2])
    const availableKib = numberOrNull(parts[3])
    const usedPercentRaw = parts[4]?.replace("%", "")
    const usedPercent = numberOrNull(usedPercentRaw)
    const kind = getDiskKind(usedPercent)

    return {
      path: DISK_CONFIG.path,
      filesystem,
      usedPercent,
      totalBytes: kibToBytes(totalKib),
      usedBytes: kibToBytes(usedKib),
      availableBytes: kibToBytes(availableKib),
      kind,
      icon: "󰋊",
      label: formatPercent(usedPercent),
      fetchedAt: Date.now(),
    }
  } catch (error) {
    console.error("Disk read error:", error)

    return {
      ...EMPTY_DISK,
      fetchedAt: Date.now(),
    }
  }
}
export function openDiskPath() {
  spawn(`xdg-open ${shellQuote(DISK_CONFIG.path)}`)
}

export function openDiskUtility() {
  if (commandExists("gnome-disks")) {
    spawn("gnome-disks")
    return
  }

  if (commandExists("baobab")) {
    spawn("baobab")
    return
  }

  openDiskPath()
}

// All monitor widgets share one snapshot and one in-flight probe.
let diskCache = EMPTY_DISK
let diskPromise: Promise<DiskState> | null = null
export function readDisk(): Promise<DiskState> {
  if (diskPromise) return diskPromise
  if (diskCache.fetchedAt && Date.now() - diskCache.fetchedAt < DISK_REFRESH_MS)
    return Promise.resolve(diskCache)
  diskPromise = fetchDisk().then(state => {
    diskCache = state
    return state
  }).finally(() => { diskPromise = null })
  return diskPromise
}
