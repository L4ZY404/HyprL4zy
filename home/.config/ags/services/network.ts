import { clamp } from "../lib/math"
import { commandExists, execAsync, shellQuote, spawn } from "../lib/shell"

export type NetworkKind = "wifi" | "ethernet" | "disconnected"
export type NetworkStatus = "idle" | "checking" | "ready" | "error"

export type NetworkState = {
  connected: boolean
  type: NetworkKind
  iface: string
  name: string
  signal: number
  ip: string
  wifiAvailable: boolean
  wifiBlocked: boolean
  rxBytes: number
  txBytes: number
  downBps: number
  upBps: number
  status: NetworkStatus
  error: string
  lastChecked: number
}

export const EMPTY_NETWORK: NetworkState = {
  connected: false,
  type: "disconnected",
  iface: "",
  name: "No connection",
  signal: 0,
  ip: "",
  wifiAvailable: false,
  wifiBlocked: false,
  rxBytes: 0,
  txBytes: 0,
  downBps: 0,
  upBps: 0,
  status: "idle",
  error: "",
  lastChecked: 0,
}

const REFRESH_THROTTLE_MS = 1400

let cachedNetworkState: NetworkState = EMPTY_NETWORK
let networkRefreshPromise: Promise<NetworkState> | null = null
let lastRefreshRequestMs = 0
let lastCounterSample: {
  iface: string
  rxBytes: number
  txBytes: number
  timestamp: number
} | null = null

function parseKeyValueOutput(output: string) {
  const values: Record<string, string> = {}

  for (const line of output.split("\n")) {
    const separator = line.indexOf("=")

    if (separator < 0) continue

    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()

    if (key) {
      values[key] = value
    }
  }

  return values
}

function parseBool(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true" || value === "yes"
}

function parseNumber(value: string | undefined) {
  const number = Number(value ?? "0")

  return Number.isFinite(number) ? number : 0
}

function sanitizeName(value: string, fallback: string) {
  const cleaned = value.trim()

  if (!cleaned) return fallback
  if (cleaned === "--") return fallback
  if (["unknown", "off", "not connected"].includes(cleaned.toLowerCase())) {
    return fallback
  }

  return cleaned
}

function formatSpeed(bytesPerSecond: number) {
  const value = Math.max(0, bytesPerSecond)

  if (value >= 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB/s`
  }

  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB/s`
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB/s`
  }

  return `${Math.round(value)} B/s`
}

function applySpeeds(state: NetworkState) {
  const now = Date.now()
  const sample = {
    iface: state.iface,
    rxBytes: state.rxBytes,
    txBytes: state.txBytes,
    timestamp: now,
  }

  if (
    !state.connected ||
    !state.iface ||
    !lastCounterSample ||
    lastCounterSample.iface !== state.iface ||
    now <= lastCounterSample.timestamp
  ) {
    lastCounterSample = sample
    return {
      ...state,
      downBps: 0,
      upBps: 0,
    }
  }

  const elapsedSeconds = Math.max(0.001, (now - lastCounterSample.timestamp) / 1000)
  const downBps = Math.max(0, (state.rxBytes - lastCounterSample.rxBytes) / elapsedSeconds)
  const upBps = Math.max(0, (state.txBytes - lastCounterSample.txBytes) / elapsedSeconds)

  lastCounterSample = sample

  return {
    ...state,
    downBps,
    upBps,
  }
}

function buildNetworkProbeScript() {
  return String.raw`
set +e

is_wifi() {
  [ -n "$1" ] && [ -d "/sys/class/net/$1/wireless" ]
}

get_operstate() {
  [ -n "$1" ] && cat "/sys/class/net/$1/operstate" 2>/dev/null || true
}

get_carrier() {
  [ -n "$1" ] && cat "/sys/class/net/$1/carrier" 2>/dev/null || true
}

get_ip() {
  [ -n "$1" ] && ip -4 -o addr show dev "$1" 2>/dev/null | awk '{print $4; exit}' || true
}

get_ssid() {
  iface="$1"
  [ -z "$iface" ] && return 0

  if command -v iwgetid >/dev/null 2>&1; then
    ssid=$(iwgetid -r "$iface" 2>/dev/null | head -n1)
    [ -n "$ssid" ] && printf '%s\n' "$ssid" && return 0
  fi

  if command -v iw >/dev/null 2>&1; then
    iw dev "$iface" link 2>/dev/null | awk -F': ' '/SSID:/ {print $2; exit}'
  fi
}

get_signal() {
  iface="$1"
  [ -z "$iface" ] && { echo 0; return 0; }

  quality=$(awk -v iface="$iface:" '$1 == iface {gsub("\\.", "", $3); print $3; exit}' /proc/net/wireless 2>/dev/null)

  if [ -n "$quality" ]; then
    awk -v q="$quality" 'BEGIN {v=int((q / 70) * 100 + 0.5); if (v < 0) v = 0; if (v > 100) v = 100; print v}'
    return 0
  fi

  if command -v iw >/dev/null 2>&1; then
    dbm=$(iw dev "$iface" link 2>/dev/null | awk '/signal:/ {print $2; exit}')
    if [ -n "$dbm" ]; then
      awk -v dbm="$dbm" 'BEGIN {v=int(((dbm + 90) / 60) * 100 + 0.5); if (v < 0) v = 0; if (v > 100) v = 100; print v}'
      return 0
    fi
  fi

  echo 0
}

interfaces=$(find /sys/class/net -maxdepth 1 -mindepth 1 -printf '%f\n' 2>/dev/null | grep -v '^lo$' || true)
wifi_available=0

for item in $interfaces; do
  if is_wifi "$item"; then
    wifi_available=1
    break
  fi
done

wifi_blocked=0
if command -v rfkill >/dev/null 2>&1; then
  if rfkill list wifi 2>/dev/null | grep -Eiq 'Soft blocked:\s+yes|Hard blocked:\s+yes'; then
    wifi_blocked=1
  fi
fi

route_iface=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if ($i=="dev") {print $(i+1); exit}}')
iface=""

for item in $interfaces; do
  if is_wifi "$item" && [ -n "$(get_ssid "$item")" ]; then
    iface="$item"
    break
  fi
done

[ -z "$iface" ] && iface="$route_iface"

if [ -z "$iface" ]; then
  for item in $interfaces; do
    oper=$(get_operstate "$item")
    carrier=$(get_carrier "$item")
    if [ "$oper" = "up" ] || [ "$carrier" = "1" ]; then
      iface="$item"
      break
    fi
  done
fi

type="disconnected"
connected=0
name="No connection"
signal=0
ip=""
rx_bytes=0
tx_bytes=0

if [ -n "$iface" ]; then
  oper=$(get_operstate "$iface")
  carrier=$(get_carrier "$iface")
  ip=$(get_ip "$iface")

  if [ "$oper" = "up" ] || [ "$carrier" = "1" ] || [ -n "$ip" ]; then
    connected=1
  fi

  if is_wifi "$iface"; then
    type="wifi"
    name=$(get_ssid "$iface")
    [ -z "$name" ] && name="Wi-Fi"
    signal=$(get_signal "$iface")
  else
    type="ethernet"
    name="$iface"
    signal=100
  fi

  rx_bytes=$(cat "/sys/class/net/$iface/statistics/rx_bytes" 2>/dev/null || echo 0)
  tx_bytes=$(cat "/sys/class/net/$iface/statistics/tx_bytes" 2>/dev/null || echo 0)
fi

if [ "$connected" != "1" ]; then
  type="disconnected"
  name="No connection"
  signal=0
  ip=""
fi

printf 'connected=%s\n' "$connected"
printf 'type=%s\n' "$type"
printf 'iface=%s\n' "$iface"
printf 'name=%s\n' "$name"
printf 'signal=%s\n' "$signal"
printf 'ip=%s\n' "$ip"
printf 'wifi_available=%s\n' "$wifi_available"
printf 'wifi_blocked=%s\n' "$wifi_blocked"
printf 'rx_bytes=%s\n' "$rx_bytes"
printf 'tx_bytes=%s\n' "$tx_bytes"
`.trim()
}

async function readNetworkFromSystem(): Promise<NetworkState> {
  const output = await execAsync(["bash", "-c", buildNetworkProbeScript()])
  const values = parseKeyValueOutput(output)
  const connected = parseBool(values.connected)
  const wifiBlocked = parseBool(values.wifi_blocked)
  const wifiAvailable = parseBool(values.wifi_available)
  const type = ["wifi", "ethernet"].includes(values.type ?? "") && connected
    ? (values.type as NetworkKind)
    : "disconnected"

  const state: NetworkState = {
    connected,
    type,
    iface: values.iface ?? "",
    name: connected
      ? sanitizeName(values.name ?? "", type === "wifi" ? "Wi-Fi" : "Ethernet")
      : wifiBlocked
        ? "Wi-Fi blocked"
        : "No connection",
    signal: clamp(parseNumber(values.signal), 0, 100),
    ip: values.ip ?? "",
    wifiAvailable,
    wifiBlocked,
    rxBytes: parseNumber(values.rx_bytes),
    txBytes: parseNumber(values.tx_bytes),
    downBps: 0,
    upBps: 0,
    status: "ready",
    error: "",
    lastChecked: Date.now(),
  }

  return applySpeeds(state)
}

function createErrorState(error: unknown): NetworkState {
  return {
    ...cachedNetworkState,
    status: "error",
    error: String(error || "Unknown network error"),
    lastChecked: Date.now(),
  }
}

export function readNetwork(): NetworkState {
  return cachedNetworkState
}

export async function refreshNetwork(force = false): Promise<NetworkState> {
  const now = Date.now()

  if (!force && networkRefreshPromise) {
    return networkRefreshPromise
  }

  if (!force && now - lastRefreshRequestMs < REFRESH_THROTTLE_MS) {
    return cachedNetworkState
  }

  lastRefreshRequestMs = now
  cachedNetworkState = {
    ...cachedNetworkState,
    status: "checking",
    error: "",
  }

  networkRefreshPromise = readNetworkFromSystem()
    .then((state) => {
      cachedNetworkState = state
      return state
    })
    .catch((error) => {
      console.error("Network refresh error:", error)
      cachedNetworkState = createErrorState(error)
      return cachedNetworkState
    })
    .finally(() => {
      networkRefreshPromise = null
    })

  return networkRefreshPromise
}

export function getNetworkIcon(state: NetworkState) {
  if (!state.connected) {
    if (state.wifiBlocked) return "󰤮"

    return "󰤭"
  }

  if (state.type === "ethernet") return "󰈀"
  if (state.signal >= 75) return "󰤨"
  if (state.signal >= 50) return "󰤥"
  if (state.signal >= 25) return "󰤢"

  return "󰤟"
}

export function getNetworkClass(state: NetworkState) {
  if (state.status === "error") return "connection-offline"
  if (!state.connected) return "connection-offline"
  if (state.type === "wifi" && state.signal < 35) return "connection-warning"

  return "connection-online"
}

export function getNetworkTitle(state: NetworkState) {
  if (state.status === "error") return "Network"
  if (!state.connected) return "Network"
  if (state.type === "ethernet") return "Ethernet"

  return "Wi-Fi"
}

export function getNetworkValue(state: NetworkState) {
  if (state.status === "checking" && !state.connected) return "Checking"
  if (state.status === "error") return "Error"

  if (!state.connected) {
    if (state.wifiBlocked) return "Wi-Fi off"

    return "Offline"
  }

  if (state.type === "ethernet") return state.iface || "Ethernet"

  return `${state.signal}%`
}

export function getNetworkDetail(state: NetworkState) {
  if (state.status === "error") return state.error || "Unable to read network"

  if (!state.connected) {
    if (state.wifiBlocked) return "Wi-Fi is blocked by rfkill"
    if (state.wifiAvailable) return "No active Wi-Fi connection"

    return "No active network route"
  }

  const speed = `↓ ${formatSpeed(state.downBps)} · ↑ ${formatSpeed(state.upBps)}`
  const address = state.ip ? ` • ${state.ip}` : ""

  return `${state.name}${address} • ${speed}`
}

export function getNetworkInterfaceLabel(state: NetworkState) {
  return state.iface || "—"
}

export function getNetworkNameLabel(state: NetworkState) {
  if (!state.connected) return state.name || "—"

  return state.name || "—"
}

export function getNetworkSignalLabel(state: NetworkState) {
  if (!state.connected) return "—"
  if (state.type !== "wifi") return "Wired"

  return `${state.signal}%`
}

export function getNetworkIpLabel(state: NetworkState) {
  return state.ip || "—"
}

export function getNetworkDownloadLabel(state: NetworkState) {
  return state.connected ? formatSpeed(state.downBps) : "—"
}

export function getNetworkUploadLabel(state: NetworkState) {
  return state.connected ? formatSpeed(state.upBps) : "—"
}

export function toggleWifi(state = cachedNetworkState) {
  if (!commandExists("rfkill")) {
    return
  }

  if (state.wifiBlocked) {
    spawn("rfkill unblock wifi")
    return
  }

  spawn("rfkill block wifi")
}

export function openNetworkManager() {
  if (commandExists("nm-connection-editor")) {
    spawn("nm-connection-editor")
    return
  }

  if (commandExists("iwgtk")) {
    spawn("iwgtk")
    return
  }

  if (commandExists("kitty") && commandExists("iwctl")) {
    spawn("kitty -e iwctl")
    return
  }

  if (commandExists("alacritty") && commandExists("iwctl")) {
    spawn("alacritty -e iwctl")
    return
  }

  if (commandExists("foot") && commandExists("iwctl")) {
    spawn("foot iwctl")
    return
  }

  if (commandExists("notify-send")) {
    spawn(`notify-send "Network" ${shellQuote("No network manager was found")}`)
  }
}

export type WifiNetwork = {
  ssid: string
  signal: number
  security: string
  active: boolean
}

export async function scanWifiNetworks(): Promise<WifiNetwork[]> {
  if (!commandExists("nmcli")) return []

  try {
    const output = await execAsync([
      "bash",
      "-c",
      "timeout 12 nmcli -t --escape no -f IN-USE,SSID,SIGNAL,SECURITY device wifi list --rescan yes 2>/dev/null",
    ])

    const seen = new Set<string>()
    const networks: WifiNetwork[] = []

    for (const rawLine of output.split("\n")) {
      const line = rawLine.trim()
      if (!line) continue
      const [inUse = "", ssid = "", signalRaw = "0", ...securityParts] = line.split(":")
      const name = ssid.trim()
      if (!name || seen.has(name)) continue
      seen.add(name)
      networks.push({
        ssid: name,
        signal: clamp(Number(signalRaw) || 0, 0, 100),
        security: securityParts.join(":").trim() || "Open",
        active: inUse.trim() === "*",
      })
    }

    return networks
      .sort((left, right) => Number(right.active) - Number(left.active) || right.signal - left.signal)
      .slice(0, 8)
  } catch (error) {
    console.error("Wi-Fi scan error:", error)
    return []
  }
}
export function connectWifiNetwork(ssid: string) {
  if (!commandExists("nmcli") || !ssid.trim()) return
  spawn(`nmcli device wifi connect ${shellQuote(ssid.trim())}`)
}

