import { Gdk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"
import { CONFIG_HOME } from "../lib/paths"
import { readFile, readJson, writeFile } from "../lib/shell"

const path = `${CONFIG_HOME}/ags/generated/monitor-slots.json`
const parsed = readJson<Record<string, number>>(readFile(path), {})
const slots: Record<string, number> = {}
const occupied = new Set<number>()
for (const [key, value] of Object.entries(parsed || {})) {
  if (Number.isInteger(value) && value >= 0 && value < 32 && !occupied.has(value)) {
    slots[key] = value; occupied.add(value)
  }
}
const connected = new Map<number, Gdk.Monitor>()

export type MonitorProfile = {
  slot: number
  connector: string
  model: string
  manufacturer: string
  width: number
  height: number
  scale: number
  connected: boolean
}

function profileFromMonitor(slot: number, monitor: Gdk.Monitor): MonitorProfile {
  const geometry = monitor.get_geometry()
  return {
    slot,
    connector: monitor.get_connector?.() || `Monitor ${slot + 1}`,
    model: monitor.get_model?.() || "Display",
    manufacturer: monitor.get_manufacturer?.() || "",
    width: geometry.width,
    height: geometry.height,
    scale: monitor.get_scale_factor?.() || 1,
    connected: true,
  }
}
export function registerMonitor(monitor: Gdk.Monitor, fallback: number) {
  // Connectors identify a port on this machine; mappings are intentionally local.
  const key = monitor.get_connector?.() || `${monitor.get_model() || "display"}-${fallback}`
  let slot = slots[key]
  if (slot === undefined) {
    slot = 0
    while (occupied.has(slot)) slot++
    slots[key] = slot; occupied.add(slot)
    GLib.mkdir_with_parents(`${CONFIG_HOME}/ags/generated`, 0o755)
    writeFile(path, JSON.stringify(slots, null, 2) + "\n")
  }
  connected.set(slot, monitor)
  return slot
}
export function unregisterMonitor(slot: number) { connected.delete(slot) }
export function monitorForSlot(slot: number) { return connected.get(slot) }
export function monitorBounds(slot: number) {
  return connected.get(slot)?.get_geometry() || { width: 1280, height: 800 }
}

export function monitorProfile(slot: number): MonitorProfile {
  const monitor = connected.get(slot)
  if (monitor) return profileFromMonitor(slot, monitor)
  const bounds = monitorBounds(slot)
  return {
    slot,
    connector: `Monitor ${slot + 1}`,
    model: "Saved profile",
    manufacturer: "",
    width: bounds.width,
    height: bounds.height,
    scale: 1,
    connected: false,
  }
}

export function connectedMonitorProfiles() {
  return [...connected.entries()]
    .sort(([a], [b]) => a - b)
    .map(([slot, monitor]) => profileFromMonitor(slot, monitor))
}
