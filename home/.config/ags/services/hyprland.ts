import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"

import { commandExists, execAsync, readJson, shellQuote, spawn } from "../lib/shell"

export type HyprWorkspace = {
  id: number
  name: string
  monitor?: string
  monitorID?: number
  windows?: number
}

export type HyprClient = {
  address?: string
  class?: string
  initialClass?: string
  title?: string
  initialTitle?: string
  monitor?: number
  workspace?: {
    id: number
    name?: string
  }
}

export type HyprMonitor = {
  id?: number
  monitorID?: number
  name: string
  focused?: boolean
  activeWorkspace?: {
    id: number
    name: string
  }
}

export type HyprlandState = {
  monitors: HyprMonitor[]
  workspaces: HyprWorkspace[]
  clients: HyprClient[]
}

export const EMPTY_HYPRLAND_STATE: HyprlandState = {
  monitors: [],
  workspaces: [],
  clients: [],
}

export function getMonitorId(monitor: HyprMonitor) {
  return monitor.id ?? monitor.monitorID ?? -1
}

let stateCache = EMPTY_HYPRLAND_STATE
let readPromise: Promise<HyprlandState> | null = null
let lastRead = 0
export function readHyprlandState(): Promise<HyprlandState> {
  if (readPromise) return readPromise
  if (Date.now() - lastRead < 100) return Promise.resolve(stateCache)
  readPromise = Promise.all([
    execAsync(["hyprctl", "monitors", "-j"]),
    execAsync(["hyprctl", "workspaces", "-j"]),
    execAsync(["hyprctl", "clients", "-j"]),
  ]).then(([monitors, workspaces, clients]) => {
    if (monitors && workspaces) {
      stateCache = {
        monitors: readJson(monitors, stateCache.monitors),
        workspaces: readJson(workspaces, stateCache.workspaces),
        clients: clients ? readJson(clients, stateCache.clients) : stateCache.clients,
      }
    }
    lastRead = Date.now()
    return stateCache
  }).finally(() => { readPromise = null })
  return readPromise
}

export function focusWorkspace(workspaceId: number, monitorName = "") {
  if (monitorName) {
    spawn(
      `hyprctl --batch ${shellQuote(
        `dispatch focusmonitor ${monitorName}; dispatch workspace ${workspaceId}`,
      )}`,
    )

    return
  }

  spawn(`hyprctl dispatch workspace ${workspaceId}`)
}

const HYPRLAND_WORKSPACE_EVENTS = [
  "workspace>>",
  "workspacev2>>",
  "focusedmon>>",
  "focusedmonv2>>",
  "createworkspace>>",
  "destroyworkspace>>",
  "movewindow>>",
  "movewindowv2>>",
  "openwindow>>",
  "closewindow>>",
  "monitoradded>>",
  "monitorremoved>>",
  "moveworkspace>>",
  "moveworkspacev2>>",
]

function isWorkspaceEvent(line: string) {
  return HYPRLAND_WORKSPACE_EVENTS.some((event) => line.startsWith(event))
}

function openWorkspaceEvents(onEvent: () => void, onClosed: () => void) {
  const runtimeDir = GLib.getenv("XDG_RUNTIME_DIR") ?? ""
  const signature = GLib.getenv("HYPRLAND_INSTANCE_SIGNATURE") ?? ""

  if (!runtimeDir || !signature) {
    console.error("Hyprland event watcher is missing runtime information")
    return () => {}
  }

  const socketPath = `${runtimeDir}/hypr/${signature}/.socket2.sock`

  let stopped = false

  const process = new Gio.Subprocess({
    argv: [
      "socat",
      "-U",
      "-",
      `UNIX-CONNECT:${socketPath}`,
    ],
    flags:
      Gio.SubprocessFlags.STDOUT_PIPE |
      Gio.SubprocessFlags.STDERR_SILENCE,
  })

  try {
    process.init(null)
  } catch (error) {
    console.error("Failed to watch Hyprland events:", error)
    return () => {}
  }

  const stdout = process.get_stdout_pipe()

  if (!stdout) {
    console.error("Hyprland event watcher has no stdout pipe")
    return () => {}
  }

  const stream = new Gio.DataInputStream({
    base_stream: stdout,
  })

  function readNextLine() {
    if (stopped) {
      return
    }

    stream.read_line_async(GLib.PRIORITY_DEFAULT, null, (_, result) => {
      if (stopped) {
        return
      }

      try {
        const [line] = stream.read_line_finish_utf8(result)

        if (line === null) {
          if (!stopped) onClosed()
          return
        }

        if (isWorkspaceEvent(line)) {
          onEvent()
        }

        readNextLine()
      } catch (error) {
        if (!stopped) {
          console.error("Failed to read Hyprland event:", error)
        }
      }
    })
  }

  readNextLine()

  return () => {
    stopped = true

    try {
      process.force_exit()
    } catch {
      // Ignore shutdown errors.
    }
  }
}
const subscribers = new Set<() => void>()
let closeEvents: (() => void) | null = null
let pollSource = 0
let debounceSource = 0
let reconnectSource = 0
function broadcast() { for (const callback of subscribers) callback() }
function queueRefresh() {
  if (debounceSource) return
  debounceSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 45, () => {
    debounceSource = 0
    lastRead = 0
    void readHyprlandState().then(broadcast)
    return GLib.SOURCE_REMOVE
  })
}
function connectEvents() {
  if (!commandExists("socat")) return
  closeEvents = openWorkspaceEvents(queueRefresh, () => {
    if (reconnectSource || subscribers.size === 0) return
    reconnectSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
      reconnectSource = 0
      closeEvents?.()
      if (subscribers.size) connectEvents()
      return GLib.SOURCE_REMOVE
    })
  })
}
export function watchHyprlandWorkspaceEvents(callback: () => void) {
  subscribers.add(callback)
  if (subscribers.size === 1) {
    connectEvents()
    pollSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
      queueRefresh()
      return GLib.SOURCE_CONTINUE
    })
  }
  return () => {
    subscribers.delete(callback)
    if (subscribers.size) return
    closeEvents?.(); closeEvents = null
    for (const id of [pollSource, debounceSource, reconnectSource]) if (id) GLib.source_remove(id)
    pollSource = debounceSource = reconnectSource = 0
  }
}
