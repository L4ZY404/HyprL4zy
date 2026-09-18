import { CONFIG_HOME } from "../lib/paths"
import GLib from "gi://GLib?version=2.0"

import { commandExists, execAsync, shellQuote, spawn } from "../lib/shell"

export type IdleInhibitorStatus = "idle" | "checking" | "ready" | "error"

export type IdleInhibitorState = {
  available: boolean
  inhibited: boolean
  swayidleRunning: boolean
  scriptPath: string
  lockTimeLabel: string
  screenOffTimeLabel: string
  status: IdleInhibitorStatus
  error: string
  lastChecked: number
  lastCheckedLabel: string
}

const IDLE_SCRIPT = `${CONFIG_HOME}/ags/scripts/idle/swayidle.sh`

const REFRESH_THROTTLE_MS = 1200
const START_LOCK_TIME_SECONDS = 1800
const START_SCREEN_OFF_SECONDS = 1830

export const EMPTY_IDLE_INHIBITOR: IdleInhibitorState = {
  available: false,
  inhibited: false,
  swayidleRunning: false,
  scriptPath: IDLE_SCRIPT,
  lockTimeLabel: "30 min",
  screenOffTimeLabel: "30.5 min",
  status: "idle",
  error: "",
  lastChecked: 0,
  lastCheckedLabel: "Never",
}

let cachedIdleState = EMPTY_IDLE_INHIBITOR
let idleRefreshPromise: Promise<IdleInhibitorState> | null = null
let lastRefreshRequestMs = 0

function formatTime(timestamp: number) {
  if (timestamp <= 0) return "Never"

  const dateTime = GLib.DateTime.new_from_unix_local(Math.floor(timestamp / 1000))
  const formatted = dateTime?.format("%H:%M")

  return formatted ?? "Unknown"
}

function formatDuration(seconds: number) {
  if (seconds % 60 === 0) {
    return `${Math.round(seconds / 60)} min`
  }

  return `${Math.round((seconds / 60) * 10) / 10} min`
}

async function sh(script: string) {
  return execAsync(["bash", "-c", script])
}


async function isSwayidleRunning() {
  const output = await sh("pgrep -x swayidle >/dev/null 2>&1 && echo yes || true")

  return output.trim() === "yes"
}

async function readIdleStateFromSystem(): Promise<IdleInhibitorState> {
  const timestamp = Date.now()
  const available = commandExists("swayidle")
  const swayidleRunning = available ? await isSwayidleRunning() : false
  const scriptPath = IDLE_SCRIPT

  return {
    available,
    inhibited: available && !swayidleRunning,
    swayidleRunning,
    scriptPath,
    lockTimeLabel: formatDuration(START_LOCK_TIME_SECONDS),
    screenOffTimeLabel: formatDuration(START_SCREEN_OFF_SECONDS),
    status: "ready",
    error: available ? "" : "swayidle is not installed",
    lastChecked: timestamp,
    lastCheckedLabel: formatTime(timestamp),
  }
}

function createErrorState(error: unknown): IdleInhibitorState {
  const timestamp = Date.now()

  return {
    ...cachedIdleState,
    status: "error",
    error: String(error || "Unknown idle inhibitor error"),
    lastChecked: timestamp,
    lastCheckedLabel: formatTime(timestamp),
  }
}

export function readIdleInhibitor(): IdleInhibitorState {
  return cachedIdleState
}

export async function refreshIdleInhibitor(force = false): Promise<IdleInhibitorState> {
  const now = Date.now()

  if (!force && idleRefreshPromise) {
    return idleRefreshPromise
  }

  if (!force && now - lastRefreshRequestMs < REFRESH_THROTTLE_MS) {
    return cachedIdleState
  }

  lastRefreshRequestMs = now
  cachedIdleState = {
    ...cachedIdleState,
    status: "checking",
    error: "",
  }

  idleRefreshPromise = readIdleStateFromSystem()
    .then((state) => {
      cachedIdleState = state
      return state
    })
    .catch((error) => {
      console.error("Idle inhibitor refresh error:", error)
      cachedIdleState = createErrorState(error)
      return cachedIdleState
    })
    .finally(() => {
      idleRefreshPromise = null
    })

  return idleRefreshPromise
}

function spawnShell(script: string) {
  spawn(`bash -lc ${shellQuote(script)}`)
}

export function enableIdleInhibitor() {
  cachedIdleState = {
    ...cachedIdleState,
    inhibited: true,
    swayidleRunning: false,
  }

  spawnShell(`
pkill -u "$(id -u)" -x swayidle 2>/dev/null || true
hyprctl dispatch dpms on >/dev/null 2>&1 || true
notify-send -a HyprLazy "Idle Inhibitor" "Screen idle actions disabled" 2>/dev/null || true
  `.trim())
}

export function disableIdleInhibitor(state = cachedIdleState) {
  if (!state.available) {
    spawnShell('notify-send -a HyprLazy "Idle Inhibitor" "swayidle is not installed" 2>/dev/null || true')
    return
  }

  cachedIdleState = {
    ...cachedIdleState,
    inhibited: false,
    swayidleRunning: true,
  }

  const scriptPath = state.scriptPath || IDLE_SCRIPT
  const lockCommand = `${CONFIG_HOME}/ags/scripts/lock.sh`

  spawnShell(`
if [ -f ${shellQuote(scriptPath)} ]; then
  bash ${shellQuote(scriptPath)} >/dev/null 2>&1 &
else
  pkill -u "$(id -u)" -x swayidle 2>/dev/null || true
  swayidle -w \
    timeout ${START_LOCK_TIME_SECONDS} ${shellQuote(lockCommand)} \
    timeout ${START_SCREEN_OFF_SECONDS} 'hyprctl dispatch dpms off' \
    resume 'hyprctl dispatch dpms on' \
    before-sleep ${shellQuote(lockCommand)} &
fi
  `.trim())
}

export function toggleIdleInhibitor(state = cachedIdleState) {
  if (state.inhibited) {
    disableIdleInhibitor(state)
    return
  }

  enableIdleInhibitor()
}

export function openPowerSettings() {
  if (commandExists("gnome-control-center")) {
    spawn("gnome-control-center power")
    return
  }

  if (commandExists("xfce4-power-manager-settings")) {
    spawn("xfce4-power-manager-settings")
    return
  }

  spawn("notify-send -a HyprLazy \"Power Settings\" \"No supported power settings app found\" 2>/dev/null || true")
}

export function getIdleInhibitorIcon(state: IdleInhibitorState) {
  if (!state.available || state.status === "error") return "󰅙"
  if (state.status === "checking") return "󰑓"
  if (state.inhibited) return "󰅶"

  return "󰾪"
}

export function getIdleInhibitorClass(state: IdleInhibitorState) {
  if (!state.available || state.status === "error") return "connection-offline"
  if (state.inhibited) return "connection-warning"

  return "connection-online"
}

export function getIdleInhibitorValue(state: IdleInhibitorState) {
  if (state.status === "checking") return "Checking"
  if (state.status === "error") return "Error"
  if (!state.available) return "Unavailable"
  if (state.inhibited) return "Enabled"

  return "Disabled"
}

export function getIdleInhibitorDetail(state: IdleInhibitorState) {
  if (state.status === "error") return state.error || "Unable to read idle state"
  if (!state.available) return "swayidle is not installed"
  if (state.inhibited) return "Screen idle actions are blocked"

  return "swayidle is managing lock and DPMS"
}
