import GLib from "gi://GLib?version=2.0"

import { commandExists, execAsync, shellQuote, spawn } from "../lib/shell"

export type ClipboardPicker = "fuzzel" | "rofi" | "none"
export type ClipboardStatus = "idle" | "checking" | "ready" | "error"

export type ClipboardState = {
  available: boolean
  cliphist: boolean
  wlCopy: boolean
  wlPaste: boolean
  picker: ClipboardPicker
  items: number
  lastItem: string
  status: ClipboardStatus
  error: string
  lastChecked: number
  lastCheckedLabel: string
}

export const EMPTY_CLIPBOARD: ClipboardState = {
  available: false,
  cliphist: false,
  wlCopy: false,
  wlPaste: false,
  picker: "none",
  items: 0,
  lastItem: "—",
  status: "idle",
  error: "",
  lastChecked: 0,
  lastCheckedLabel: "Never",
}

const REFRESH_THROTTLE_MS = 1200
const MAX_LAST_ITEM_LENGTH = 48

let cachedClipboardState = EMPTY_CLIPBOARD
let clipboardRefreshPromise: Promise<ClipboardState> | null = null
let lastRefreshRequestMs = 0

function formatTime(timestamp: number) {
  if (timestamp <= 0) return "Never"

  const dateTime = GLib.DateTime.new_from_unix_local(Math.floor(timestamp / 1000))
  const formatted = dateTime?.format("%H:%M")

  return formatted ?? "Unknown"
}

function getPicker(): ClipboardPicker {
  if (commandExists("fuzzel")) return "fuzzel"
  if (commandExists("rofi")) return "rofi"

  return "none"
}

function sanitizeLastItem(value: string) {
  const clean = value
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!clean) return "—"

  return clean.length > MAX_LAST_ITEM_LENGTH
    ? `${clean.slice(0, MAX_LAST_ITEM_LENGTH - 1)}…`
    : clean
}

async function sh(script: string) {
  return execAsync(["bash", "-c", script])
}

async function readClipboardFromSystem(): Promise<ClipboardState> {
  const cliphist = commandExists("cliphist")
  const wlCopy = commandExists("wl-copy")
  const wlPaste = commandExists("wl-paste")
  const picker = getPicker()
  const timestamp = Date.now()

  if (!cliphist) {
    return {
      ...EMPTY_CLIPBOARD,
      cliphist,
      wlCopy,
      wlPaste,
      picker,
      status: "ready",
      error: "",
      lastChecked: timestamp,
      lastCheckedLabel: formatTime(timestamp),
    }
  }

  const listOutput = await sh("cliphist list 2>/dev/null || true")
  const lines = listOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  return {
    available: cliphist && wlCopy,
    cliphist,
    wlCopy,
    wlPaste,
    picker,
    items: lines.length,
    lastItem: sanitizeLastItem(lines[0] ?? ""),
    status: "ready",
    error: "",
    lastChecked: timestamp,
    lastCheckedLabel: formatTime(timestamp),
  }
}

function createErrorState(error: unknown): ClipboardState {
  const timestamp = Date.now()

  return {
    ...cachedClipboardState,
    status: "error",
    error: String(error || "Unknown clipboard error"),
    lastChecked: timestamp,
    lastCheckedLabel: formatTime(timestamp),
  }
}

export function readClipboard(): ClipboardState {
  return cachedClipboardState
}

export async function refreshClipboard(force = false): Promise<ClipboardState> {
  const now = Date.now()

  if (!force && clipboardRefreshPromise) {
    return clipboardRefreshPromise
  }

  if (!force && now - lastRefreshRequestMs < REFRESH_THROTTLE_MS) {
    return cachedClipboardState
  }

  lastRefreshRequestMs = now
  cachedClipboardState = {
    ...cachedClipboardState,
    status: "checking",
    error: "",
  }

  clipboardRefreshPromise = readClipboardFromSystem()
    .then((state) => {
      cachedClipboardState = state
      return state
    })
    .catch((error) => {
      console.error("Clipboard refresh error:", error)
      cachedClipboardState = createErrorState(error)
      return cachedClipboardState
    })
    .finally(() => {
      clipboardRefreshPromise = null
    })

  return clipboardRefreshPromise
}

export function openClipboardPicker(state = cachedClipboardState) {
  if (!state.cliphist || !state.wlCopy) {
    spawn(`notify-send "Clipboard" ${shellQuote("cliphist and wl-copy are required")}`)
    return
  }

  if (state.picker === "fuzzel") {
    spawn("bash -lc 'cliphist list | fuzzel --dmenu --prompt Clipboard | cliphist decode | wl-copy'")
    return
  }

  if (state.picker === "rofi") {
    spawn("bash -lc 'cliphist list | rofi -dmenu -p Clipboard | cliphist decode | wl-copy'")
    return
  }

  spawn(`notify-send "Clipboard" ${shellQuote("Install fuzzel or rofi to open the clipboard picker")}`)
}

export function clearClipboardHistory(state = cachedClipboardState) {
  if (!state.cliphist) {
    return
  }

  cachedClipboardState = {
    ...cachedClipboardState,
    items: 0,
    lastItem: "—",
  }

  spawn("bash -lc 'cliphist wipe 2>/dev/null || true'")
}

export function copyLastClipboardItem(state = cachedClipboardState) {
  if (!state.cliphist || !state.wlCopy || state.items <= 0) {
    return
  }

  spawn("bash -lc 'cliphist list | head -n 1 | cliphist decode | wl-copy'")
}

export function getClipboardIcon(state: ClipboardState) {
  if (!state.cliphist) return "󰅙"
  if (state.items > 0) return ""

  return "󰅌"
}

export function getClipboardClass(state: ClipboardState) {
  if (state.status === "error" || !state.cliphist || !state.wlCopy) return "connection-offline"
  if (state.items <= 0) return "connection-warning"

  return "connection-online"
}

export function getClipboardValue(state: ClipboardState) {
  if (state.status === "checking") return "Checking"
  if (state.status === "error") return "Error"
  if (!state.cliphist) return "Unavailable"
  if (state.items <= 0) return "Empty"

  return `${state.items} items`
}

export function getClipboardDetail(state: ClipboardState) {
  if (state.status === "error") return state.error || "Unable to read clipboard"
  if (!state.cliphist) return "cliphist is not installed"
  if (!state.wlCopy) return "wl-copy is not installed"

  return state.lastItem === "—" ? "No clipboard history yet" : state.lastItem
}

export function getClipboardPickerLabel(picker: ClipboardPicker) {
  switch (picker) {
    case "fuzzel":
      return "Fuzzel"
    case "rofi":
      return "Rofi"
    case "none":
      return "None"
  }
}
