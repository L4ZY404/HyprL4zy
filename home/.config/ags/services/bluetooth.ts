import { clamp } from "../lib/math"
import { commandExists, execAsync, shellQuote, spawn } from "../lib/shell"

const REFRESH_THROTTLE_MS = 1200
const LOG_FILE = "/tmp/ags-bluetooth-toggle.log"

const DEVICE_ICONS: Record<string, string> = {
  mouse: "󰍽",
  keyboard: "⌨️",
  audio: "󰋋",
  head: "󰋋",
  headset: "󰋋",
  headphones: "󰋋",
  joy: "󰊴",
  game: "󰊴",
  phone: "",
  computer: "󰌢",
  laptop: "󰌢",
  default: "",
}

const BATTERY_LEVELS = [
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

export type BluetoothDevice = {
  mac: string
  alias: string
  iconType: string
  icon: string
  battery: number | null
}

export type BluetoothStatus = "idle" | "checking" | "ready" | "toggling" | "error"

export type BluetoothState = {
  available: boolean
  powered: boolean
  blocked: boolean
  connectedDevices: BluetoothDevice[]
  status: BluetoothStatus
  error: string
  lastChecked: number
}

export const EMPTY_BLUETOOTH: BluetoothState = {
  available: false,
  powered: false,
  blocked: false,
  connectedDevices: [],
  status: "idle",
  error: "",
  lastChecked: 0,
}

let cachedBluetoothState: BluetoothState = EMPTY_BLUETOOTH
let bluetoothRefreshPromise: Promise<BluetoothState> | null = null
let lastRefreshRequestMs = 0
let togglePromise: Promise<void> | null = null

function sh(command: string) {
  return execAsync(["bash", "-c", command])
}

function writeLog(message: string) {
  const script = `printf '[%s] %s\n' "$(date '+%F %T')" ${shellQuote(
    message,
  )} >> ${shellQuote(LOG_FILE)}`

  void sh(script)
}

function notifyBluetooth(message: string) {
  if (commandExists("notify-send")) {
    spawn(`notify-send "Bluetooth" ${shellQuote(message)}`)
  }
}

async function runBluetoothctl(commands: string[]) {
  const quotedCommands = commands.map((command) => shellQuote(command)).join(" ")
  const script = `printf '%s\n' ${quotedCommands} | bluetoothctl 2>/dev/null || true`

  return sh(script)
}

async function getBluetoothAdapters() {
  const output = await sh(
    `for h in /sys/class/bluetooth/hci*; do [ -e "$h" ] && basename "$h"; done`,
  )

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

async function getBluetoothControllers() {
  if (!commandExists("bluetoothctl")) {
    return []
  }

  const output = await sh("bluetoothctl list 2>/dev/null || true")

  return output
    .split("\n")
    .map((line) => line.match(/^Controller\s+([A-Fa-f0-9:]+)\s+/)?.[1] ?? "")
    .filter(Boolean)
}

async function hasBluetoothAsync() {
  if (!commandExists("bluetoothctl")) {
    return false
  }

  const [adapters, controllers] = await Promise.all([
    getBluetoothAdapters(),
    getBluetoothControllers(),
  ])

  return adapters.length > 0 || controllers.length > 0
}

async function isBluetoothBlocked() {
  if (!commandExists("rfkill")) {
    return false
  }

  const rfkill = await sh("rfkill list bluetooth 2>/dev/null || true")

  return (
    /Soft blocked:\s+yes/i.test(rfkill) ||
    /Hard blocked:\s+yes/i.test(rfkill)
  )
}

async function getControllerPowered(controller: string) {
  const show = await runBluetoothctl([
    `select ${controller}`,
    "show",
    "quit",
  ])

  return /Powered:\s+yes/i.test(show)
}

async function getBluetoothPowered() {
  const controllers = await getBluetoothControllers()

  if (controllers.length > 0) {
    const states = await Promise.all(controllers.map(getControllerPowered))

    return states.some(Boolean)
  }

  const show = await sh("bluetoothctl show 2>/dev/null || true")

  if (/Powered:\s+yes/i.test(show)) return true
  if (/Powered:\s+no/i.test(show)) return false

  return !(await isBluetoothBlocked())
}

function getInfoField(info: string, field: string) {
  const regex = new RegExp(`^\\s*${field}:\\s*(.+)$`, "mi")

  return info.match(regex)?.[1]?.trim() ?? ""
}

function getDeviceIcon(iconType: string, alias = "") {
  const lowered = `${iconType} ${alias}`.toLowerCase()

  for (const key of Object.keys(DEVICE_ICONS)) {
    if (key !== "default" && lowered.includes(key)) {
      return DEVICE_ICONS[key]
    }
  }

  return DEVICE_ICONS.default
}

export function getBatteryIcon(percent: number | null) {
  if (percent === null) return ""

  const safePercent = clamp(percent)
  const index = Math.floor((safePercent / 100) * (BATTERY_LEVELS.length - 1))

  return BATTERY_LEVELS[index]
}

function parseDeviceLine(line: string) {
  const match = line.match(/^Device\s+([A-Fa-f0-9:]+)\s+(.+)$/)

  if (!match) return null

  return {
    mac: match[1],
    name: match[2],
  }
}

function getBatteryFromInfo(info: string) {
  const line =
    getInfoField(info, "Battery Percentage") ||
    getInfoField(info, "Battery")

  if (!line) return null

  const value = line.match(/\((\d+)\)/)?.[1] ?? line.match(/(\d+)/)?.[1]

  return value ? clamp(Number(value)) : null
}

function parseDeviceLines(output: string) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("Device "))
}

async function getConnectedDeviceLines() {
  const output = await sh("bluetoothctl devices Connected 2>/dev/null || true")

  return parseDeviceLines(output)
}

async function getDeviceInfo(mac: string) {
  return sh(`bluetoothctl info ${shellQuote(mac)} 2>/dev/null || true`)
}

async function getConnectedDevices() {
  const lines = await getConnectedDeviceLines()
  const devices: BluetoothDevice[] = []

  for (const line of lines) {
    const parsed = parseDeviceLine(line)

    if (!parsed) continue

    const info = await getDeviceInfo(parsed.mac)

    if (!/Connected:\s+yes/i.test(info)) {
      continue
    }

    const alias =
      getInfoField(info, "Alias") ||
      getInfoField(info, "Name") ||
      parsed.name ||
      "Unknown device"

    const iconType =
      getInfoField(info, "Icon") ||
      getInfoField(info, "Class") ||
      "audio"

    const battery = getBatteryFromInfo(info)

    devices.push({
      mac: parsed.mac,
      alias,
      iconType,
      battery,
      icon: getDeviceIcon(iconType, alias),
    })
  }

  return devices
}

async function readBluetoothFromSystem(): Promise<BluetoothState> {
  const available = await hasBluetoothAsync()

  if (!available) {
    return {
      ...EMPTY_BLUETOOTH,
      status: "ready",
      lastChecked: Date.now(),
    }
  }

  const blocked = await isBluetoothBlocked()
  const [powered, connectedDevices] = blocked
    ? [false, [] as BluetoothDevice[]]
    : await Promise.all([getBluetoothPowered(), getConnectedDevices()])

  const realPowered = !blocked && (powered || connectedDevices.length > 0)

  return {
    available,
    powered: realPowered,
    blocked,
    connectedDevices: realPowered ? connectedDevices : [],
    status: "ready",
    error: "",
    lastChecked: Date.now(),
  }
}

function createErrorState(error: unknown): BluetoothState {
  return {
    ...cachedBluetoothState,
    status: "error",
    error: String(error || "Unknown Bluetooth error"),
    lastChecked: Date.now(),
  }
}

export function hasBluetooth() {
  return cachedBluetoothState.available
}

export function readBluetooth(): BluetoothState {
  return cachedBluetoothState
}

export async function refreshBluetooth(force = false): Promise<BluetoothState> {
  const now = Date.now()

  if (!force && bluetoothRefreshPromise) {
    return bluetoothRefreshPromise
  }

  if (!force && now - lastRefreshRequestMs < REFRESH_THROTTLE_MS) {
    return cachedBluetoothState
  }

  lastRefreshRequestMs = now

  if (cachedBluetoothState.status !== "toggling") {
    cachedBluetoothState = {
      ...cachedBluetoothState,
      status: "checking",
      error: "",
    }
  }

  bluetoothRefreshPromise = readBluetoothFromSystem()
    .then((state) => {
      cachedBluetoothState = state
      return state
    })
    .catch((error) => {
      console.error("Bluetooth refresh error:", error)
      cachedBluetoothState = createErrorState(error)
      return cachedBluetoothState
    })
    .finally(() => {
      bluetoothRefreshPromise = null
    })

  return bluetoothRefreshPromise
}

async function powerOnAll() {
  if (commandExists("rfkill")) {
    await sh("rfkill unblock bluetooth 2>/dev/null || true")
  }

  await runBluetoothctl(["power on", "agent on", "default-agent", "quit"])

  const controllers = await getBluetoothControllers()

  for (const controller of controllers) {
    await runBluetoothctl([
      `select ${controller}`,
      "power on",
      "agent on",
      "default-agent",
      "quit",
    ])
  }
}

async function powerOffAll() {
  const controllers = await getBluetoothControllers()

  for (const controller of controllers) {
    await runBluetoothctl([
      `select ${controller}`,
      "power off",
      "quit",
    ])
  }

  await runBluetoothctl(["power off", "quit"])
}

export function toggleBluetooth(state = cachedBluetoothState) {
  if (togglePromise) return togglePromise

  const willPowerOn = state.blocked || !state.powered

  cachedBluetoothState = {
    ...state,
    blocked: false,
    powered: willPowerOn,
    connectedDevices: willPowerOn ? state.connectedDevices : [],
    status: "toggling",
    error: "",
  }

  notifyBluetooth(willPowerOn ? "Turning Bluetooth on..." : "Turning Bluetooth off...")
  writeLog(willPowerOn ? "Turning Bluetooth on" : "Turning Bluetooth off")

  togglePromise = (willPowerOn ? powerOnAll() : powerOffAll())
    .then(async () => {
      notifyBluetooth(willPowerOn ? "Bluetooth enabled" : "Bluetooth disabled")
      await refreshBluetooth(true)
    })
    .catch((error) => {
      console.error("Bluetooth toggle error:", error)
      notifyBluetooth("Bluetooth toggle failed")
      cachedBluetoothState = createErrorState(error)
    })
    .finally(() => {
      togglePromise = null
    })

  return togglePromise
}

export function getBluetoothIcon(state: BluetoothState) {
  if (!state.available || state.blocked || !state.powered) return "󰂲"
  if (state.connectedDevices.length > 0) return "󰂱"

  return ""
}

export function getBluetoothClass(state: BluetoothState) {
  if (!state.available || state.blocked || !state.powered) {
    return "connection-offline"
  }

  if (state.connectedDevices.length === 0) {
    return "connection-warning"
  }

  return "connection-online"
}

export function getBluetoothValue(state: BluetoothState) {
  if (state.status === "checking") return "Checking"
  if (state.status === "toggling") return "Switching"
  if (state.status === "error") return "Error"
  if (!state.available) return "No adapter"
  if (state.blocked) return "Blocked"
  if (!state.powered) return "Off"
  if (state.connectedDevices.length === 0) return "On"

  return `${state.connectedDevices.length} connected`
}

export function getBluetoothDetail(state: BluetoothState) {
  if (state.status === "error") return state.error || "Unable to read Bluetooth"
  if (!state.available) return "No adapter detected"
  if (state.blocked) return "Blocked by rfkill"
  if (!state.powered) return "Bluetooth is powered off"
  if (state.connectedDevices.length === 0) return "No connected devices"

  return state.connectedDevices
    .map((device) => device.alias)
    .join(", ")
}

export function openBluetoothManager() {
  spawn("blueman-manager")
}

export type BluetoothManagedDevice = BluetoothDevice & {
  paired: boolean
  connected: boolean
  trusted: boolean
}

export async function listBluetoothDevices(scan = false): Promise<BluetoothManagedDevice[]> {
  if (!commandExists("bluetoothctl")) return []

  try {
    if (scan) {
      await sh("timeout 5 bluetoothctl --timeout 4 scan on >/dev/null 2>&1 || true")
    }

    const output = await sh("bluetoothctl devices 2>/dev/null || true")
    const parsed = output
      .split("\n")
      .map(parseDeviceLine)
      .filter((item): item is { mac: string; name: string } => item !== null)
      .slice(0, 10)

    const devices = await Promise.all(parsed.map(async (item) => {
      const info = await sh(`bluetoothctl info ${shellQuote(item.mac)} 2>/dev/null || true`)
      const alias = getInfoField(info, "Alias") || getInfoField(info, "Name") || item.name || item.mac
      const iconType = getInfoField(info, "Icon") || getInfoField(info, "Class") || "default"
      return {
        mac: item.mac,
        alias,
        iconType,
        icon: getDeviceIcon(iconType, alias),
        battery: getBatteryFromInfo(info),
        paired: /Paired:\s*yes/i.test(info),
        connected: /Connected:\s*yes/i.test(info),
        trusted: /Trusted:\s*yes/i.test(info),
      }
    }))

    return devices.sort((left, right) => Number(right.connected) - Number(left.connected) || Number(right.paired) - Number(left.paired) || left.alias.localeCompare(right.alias))
  } catch (error) {
    console.error("Bluetooth device scan error:", error)
    return []
  }
}

export function connectBluetoothDevice(mac: string) {
  spawn(`bluetoothctl connect ${shellQuote(mac)}`)
}

export function disconnectBluetoothDevice(mac: string) {
  spawn(`bluetoothctl disconnect ${shellQuote(mac)}`)
}

export function pairBluetoothDevice(mac: string) {
  spawn(`sh -c ${shellQuote(`bluetoothctl pair ${mac} && bluetoothctl trust ${mac} && bluetoothctl connect ${mac}`)}`)
}

export function forgetBluetoothDevice(mac: string) {
  spawn(`bluetoothctl remove ${shellQuote(mac)}`)
}
