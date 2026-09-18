import GLib from "gi://GLib?version=2.0"

import { commandExists, execAsync, shellQuote, spawn } from "../lib/shell"

export type NotificationDaemon = "swaync" | "dunst" | "mako" | "none"
export type NotificationStatus = "idle" | "checking" | "ready" | "error"

export type NotificationsState = {
  available: boolean
  daemon: NotificationDaemon
  dnd: boolean | null
  count: number
  status: NotificationStatus
  error: string
  lastChecked: number
  lastCheckedLabel: string
}

export const EMPTY_NOTIFICATIONS: NotificationsState = {
  available: false,
  daemon: "none",
  dnd: null,
  count: 0,
  status: "idle",
  error: "",
  lastChecked: 0,
  lastCheckedLabel: "Never",
}

const REFRESH_THROTTLE_MS = 1200

let cachedNotificationsState = EMPTY_NOTIFICATIONS
let notificationsRefreshPromise: Promise<NotificationsState> | null = null
let lastRefreshRequestMs = 0

function formatTime(timestamp: number) {
  if (timestamp <= 0) return "Never"

  const dateTime = GLib.DateTime.new_from_unix_local(Math.floor(timestamp / 1000))
  const formatted = dateTime?.format("%H:%M")

  return formatted ?? "Unknown"
}

function parseCount(output: string) {
  const match = output.match(/\d+/)
  const count = match ? Number(match[0]) : 0

  return Number.isFinite(count) ? Math.max(0, count) : 0
}

function getDaemon(): NotificationDaemon {
  if (commandExists("swaync-client")) return "swaync"
  if (commandExists("dunstctl")) return "dunst"
  if (commandExists("makoctl")) return "mako"

  return "none"
}

async function sh(script: string) {
  return execAsync(["bash", "-c", script])
}

async function readDunstState(): Promise<NotificationsState> {
  const [countOutput, pausedOutput] = await Promise.all([
    sh("dunstctl count waiting 2>/dev/null || true"),
    sh("dunstctl is-paused 2>/dev/null || true"),
  ])

  const timestamp = Date.now()

  return {
    available: true,
    daemon: "dunst",
    dnd: /true|yes|1/i.test(pausedOutput),
    count: parseCount(countOutput),
    status: "ready",
    error: "",
    lastChecked: timestamp,
    lastCheckedLabel: formatTime(timestamp),
  }
}

async function readMakoState(): Promise<NotificationsState> {
  const modeOutput = await sh("makoctl mode 2>/dev/null || true")
  const timestamp = Date.now()
  const normalizedMode = modeOutput.toLowerCase()

  return {
    available: true,
    daemon: "mako",
    dnd:
      normalizedMode.includes("do-not-disturb") ||
      normalizedMode.includes("dnd"),
    count: 0,
    status: "ready",
    error: "",
    lastChecked: timestamp,
    lastCheckedLabel: formatTime(timestamp),
  }
}

async function readSwayncState(): Promise<NotificationsState> {
  const countOutput = await sh("swaync-client -c 2>/dev/null || true")
  const timestamp = Date.now()

  return {
    available: true,
    daemon: "swaync",
    dnd: null,
    count: parseCount(countOutput),
    status: "ready",
    error: "",
    lastChecked: timestamp,
    lastCheckedLabel: formatTime(timestamp),
  }
}

async function readNotificationsFromSystem(): Promise<NotificationsState> {
  const daemon = getDaemon()

  switch (daemon) {
    case "dunst":
      return readDunstState()
    case "mako":
      return readMakoState()
    case "swaync":
      return readSwayncState()
    case "none": {
      const timestamp = Date.now()

      return {
        ...EMPTY_NOTIFICATIONS,
        status: "ready",
        lastChecked: timestamp,
        lastCheckedLabel: formatTime(timestamp),
      }
    }
  }
}

function createErrorState(error: unknown): NotificationsState {
  const timestamp = Date.now()

  return {
    ...cachedNotificationsState,
    status: "error",
    error: String(error || "Unknown notification error"),
    lastChecked: timestamp,
    lastCheckedLabel: formatTime(timestamp),
  }
}

export function readNotifications(): NotificationsState {
  return cachedNotificationsState
}

export async function refreshNotifications(force = false): Promise<NotificationsState> {
  const now = Date.now()

  if (!force && notificationsRefreshPromise) {
    return notificationsRefreshPromise
  }

  if (!force && now - lastRefreshRequestMs < REFRESH_THROTTLE_MS) {
    return cachedNotificationsState
  }

  lastRefreshRequestMs = now
  cachedNotificationsState = {
    ...cachedNotificationsState,
    status: "checking",
    error: "",
  }

  notificationsRefreshPromise = readNotificationsFromSystem()
    .then((state) => {
      cachedNotificationsState = state
      return state
    })
    .catch((error) => {
      console.error("Notifications refresh error:", error)
      cachedNotificationsState = createErrorState(error)
      return cachedNotificationsState
    })
    .finally(() => {
      notificationsRefreshPromise = null
    })

  return notificationsRefreshPromise
}

export function getNotificationsIcon(state: NotificationsState) {
  if (!state.available) return "󰂜"
  if (state.dnd === true) return "󰂛"
  if (state.count > 0) return "󰂚"

  return "󰂜"
}

export function getNotificationsClass(state: NotificationsState) {
  if (!state.available || state.status === "error") return "connection-offline"
  if (state.dnd === true) return "connection-warning"

  return "connection-online"
}

export function getNotificationsValue(state: NotificationsState) {
  if (state.status === "checking") return "Checking"
  if (state.status === "error") return "Error"
  if (!state.available) return "Unavailable"
  if (state.dnd === true) return "DND on"
  if (state.count > 0) return `${state.count} waiting`

  return "Ready"
}

export function getNotificationsDetail(state: NotificationsState) {
  if (state.status === "error") return state.error || "Unable to read notifications"
  if (!state.available) return "No supported daemon found"
  if (state.daemon === "swaync" && state.dnd === null) {
    return "DND state depends on swaync-client support"
  }

  return `Daemon: ${getNotificationDaemonLabel(state.daemon)}`
}

export function getNotificationDaemonLabel(daemon: NotificationDaemon) {
  switch (daemon) {
    case "swaync":
      return "SwayNC"
    case "dunst":
      return "Dunst"
    case "mako":
      return "Mako"
    case "none":
      return "None"
  }
}

export function getDndLabel(state: NotificationsState) {
  if (state.dnd === null) return "Unknown"

  return state.dnd ? "On" : "Off"
}

export function openNotificationCenter(state = cachedNotificationsState) {
  switch (state.daemon) {
    case "swaync":
      spawn("swaync-client -t")
      return
    case "dunst":
      spawn("dunstctl history-pop")
      return
    case "mako":
      if (commandExists("notify-send")) {
        spawn(`notify-send "Notifications" ${shellQuote("Mako has no notification center")}`)
      }
      return
    case "none":
      if (commandExists("notify-send")) {
        spawn(`notify-send "Notifications" ${shellQuote("No supported notification daemon was found")}`)
      }
  }
}

export function toggleDnd(state = cachedNotificationsState) {
  switch (state.daemon) {
    case "swaync":
      spawn("swaync-client -d")
      return
    case "dunst":
      spawn("dunstctl set-paused toggle")
      return
    case "mako":
      spawn("makoctl mode -t do-not-disturb")
      return
    case "none":
      return
  }
}

export function clearNotifications(state = cachedNotificationsState) {
  switch (state.daemon) {
    case "swaync":
      spawn("swaync-client -C")
      return
    case "dunst":
      spawn("dunstctl close-all")
      return
    case "mako":
      spawn("makoctl dismiss -a")
      return
    case "none":
      return
  }
}
