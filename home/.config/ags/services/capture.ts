import { CONFIG_HOME } from "../lib/paths"
import { commandExists, getHomeDir, shellQuote, spawn } from "../lib/shell"

export type CaptureState = {
  directory: string
  grim: boolean
  slurp: boolean
  wlCopy: boolean
  dunstify: boolean
  notifySend: boolean
  status: "ready" | "missing"
  detail: string
}

const SCREENSHOT_SCRIPT = `${CONFIG_HOME}/ags/scripts/screenshot.sh`
const SCREENSHOT_DIR = `${getHomeDir()}/Pictures/Screenshots`

let cachedCaptureState: CaptureState | null = null
let lastCaptureStateMs = 0

const CAPTURE_STATE_CACHE_MS = 15000

function buildCaptureState(): CaptureState {
  const grim = commandExists("grim")
  const slurp = commandExists("slurp")
  const wlCopy = commandExists("wl-copy")
  const missing = [
    grim ? "" : "grim",
    slurp ? "" : "slurp",
    wlCopy ? "" : "wl-copy",
  ].filter(Boolean)

  return {
    directory: SCREENSHOT_DIR,
    grim,
    slurp,
    wlCopy,
    dunstify: commandExists("dunstify"),
    notifySend: commandExists("notify-send"),
    status: missing.length === 0 ? "ready" : "missing",
    detail: missing.length === 0 ? "Ready to capture" : `Missing: ${missing.join(", ")}`,
  }
}

export function readCaptureState(force = false): CaptureState {
  const now = Date.now()

  if (
    !force &&
    cachedCaptureState &&
    now - lastCaptureStateMs < CAPTURE_STATE_CACHE_MS
  ) {
    return cachedCaptureState
  }

  cachedCaptureState = buildCaptureState()
  lastCaptureStateMs = now

  return cachedCaptureState
}

function runCaptureArg(arg: string) {
  spawn(`${shellQuote(SCREENSHOT_SCRIPT)} ${arg}`)
}

export function captureArea() {
  runCaptureArg("--sel")
}

export function captureScreen() {
  runCaptureArg("--now")
}

export function captureDelayed(seconds = 5) {
  runCaptureArg(seconds >= 10 ? "--in10" : "--in5")
}

export function openCapturesFolder() {
  spawn(`xdg-open ${shellQuote(SCREENSHOT_DIR)}`)
}

export function getCaptureIcon(state: CaptureState) {
  return state.status === "ready" ? "󰄀" : "󰅙"
}

export function getCaptureClass(state: CaptureState) {
  return state.status === "ready" ? "connection-online" : "connection-offline"
}
