import { clamp } from "../lib/math"
import { commandExists, execAsync, shellQuote, spawn } from "../lib/shell"

export type VolumeState = {
  volume: number
  muted: boolean
  sink: string
  sourceVolume: number
  sourceMuted: boolean
  source: string
  activeInputs: number
  status: "idle" | "checking" | "ready" | "error"
  error: string
}

export const EMPTY_VOLUME: VolumeState = {
  volume: 0,
  muted: false,
  sink: "Default sink",
  sourceVolume: 0,
  sourceMuted: false,
  source: "Default source",
  activeInputs: 0,
  status: "idle",
  error: "",
}

let cachedVolumeState = EMPTY_VOLUME
let volumeRefreshPromise: Promise<VolumeState> | null = null

function notifyOutputStateScript() {
  return `
if ! command -v notify-send >/dev/null 2>&1; then
  exit 0
fi
sink_volume=$(pactl get-sink-volume @DEFAULT_SINK@ 2>/dev/null | head -n1)
sink_mute=$(pactl get-sink-mute @DEFAULT_SINK@ 2>/dev/null)
progress=$(printf '%s' "$sink_volume" | grep -oE '[0-9]+%' | head -n1 | tr -d '%')
progress=\${progress:-0}
if printf '%s' "$sink_mute" | grep -qi yes; then
  icon="audio-volume-muted-symbolic"
  body="Muted"
  progress=0
elif [ "$progress" -lt 35 ]; then
  icon="audio-volume-low-symbolic"
  body="$progress%"
elif [ "$progress" -lt 70 ]; then
  icon="audio-volume-medium-symbolic"
  body="$progress%"
else
  icon="audio-volume-high-symbolic"
  body="$progress%"
fi
notify-send -a HyprLazy -h string:x-canonical-private-synchronous:ags-volume -h int:value:"$progress" -i "$icon" "Volume" "$body" 2>/dev/null || true
`.trim()
}

function runOutputCommand(command: string) {
  const script = `${command}
sleep 0.05
${notifyOutputStateScript()}`
  spawn(`bash -lc ${shellQuote(script)}`)
}

function parsePercent(value: string, fallback: number) {
  const match = value.match(/(\d+)%/)
  const number = match ? Number(match[1]) : fallback

  return clamp(Number.isFinite(number) ? number : fallback, 0, 150)
}

function parseVolumeState(output: string): VolumeState {
  const [
    sinkVolumeOutput = "",
    sinkMuteOutput = "",
    sinkOutput = "",
    sourceVolumeOutput = "",
    sourceMuteOutput = "",
    sourceOutput = "",
    activeInputsOutput = "",
  ] = output.split("\n")

  return {
    volume: parsePercent(sinkVolumeOutput, cachedVolumeState.volume),
    muted: /yes/i.test(sinkMuteOutput),
    sink: sinkOutput.trim() || cachedVolumeState.sink || "Default sink",
    sourceVolume: parsePercent(sourceVolumeOutput, cachedVolumeState.sourceVolume),
    sourceMuted: /yes/i.test(sourceMuteOutput),
    source: sourceOutput.trim() || cachedVolumeState.source || "Default source",
    activeInputs: Number(activeInputsOutput.trim()) || 0,
    status: "ready",
    error: "",
  }
}

export function readVolume(): VolumeState {
  return cachedVolumeState
}

export async function refreshVolume(): Promise<VolumeState> {
  if (volumeRefreshPromise) {
    return volumeRefreshPromise
  }

  if (!commandExists("pactl")) {
    cachedVolumeState = {
      ...cachedVolumeState,
      status: "error",
      error: "pactl not found",
    }
    return cachedVolumeState
  }

  cachedVolumeState = {
    ...cachedVolumeState,
    status: "checking",
    error: "",
  }

  volumeRefreshPromise = execAsync([
    "bash",
    "-lc",
    `
sink_volume=$(pactl get-sink-volume @DEFAULT_SINK@ 2>/dev/null | head -n1)
sink_mute=$(pactl get-sink-mute @DEFAULT_SINK@ 2>/dev/null)
sink=$(pactl get-default-sink 2>/dev/null || pactl info 2>/dev/null | sed -n 's/^Default Sink: //p')
source_volume=$(pactl get-source-volume @DEFAULT_SOURCE@ 2>/dev/null | head -n1)
source_mute=$(pactl get-source-mute @DEFAULT_SOURCE@ 2>/dev/null)
source=$(pactl get-default-source 2>/dev/null || pactl info 2>/dev/null | sed -n 's/^Default Source: //p')
active_inputs=$(pactl list short source-outputs 2>/dev/null | wc -l)
printf '%s\n%s\n%s\n%s\n%s\n%s\n%s\n' "$sink_volume" "$sink_mute" "$sink" "$source_volume" "$source_mute" "$source" "$active_inputs"
`.trim(),
  ])
    .then((output) => {
      cachedVolumeState = parseVolumeState(output)
      return cachedVolumeState
    })
    .catch((error) => {
      console.error("Volume refresh error:", error)
      cachedVolumeState = {
        ...cachedVolumeState,
        status: "error",
        error: String(error || "Unknown audio error"),
      }
      return cachedVolumeState
    })
    .finally(() => {
      volumeRefreshPromise = null
    })

  return volumeRefreshPromise
}

export function getVolumeIcon(state: VolumeState) {
  if (state.muted || state.volume === 0) return "󰝟"
  if (state.volume < 35) return ""
  if (state.volume < 70) return ""
  return ""
}

export function getMicrophoneIcon(state: VolumeState) {
  if (state.sourceMuted || state.sourceVolume === 0) return "󰍭"

  return "󰍬"
}

export function getVolumeClass(state: VolumeState) {
  if (state.status === "error") return "connection-offline"
  if (state.muted || state.volume === 0) return "connection-offline"
  if (state.sourceMuted && state.activeInputs > 0) return "connection-warning"
  if (state.volume >= 100) return "connection-warning"

  return "connection-online"
}

export function getVolumeDetail(state: VolumeState) {
  if (state.status === "error") return state.error || "Unable to read audio"
  if (state.muted) return "Output muted"
  if (state.volume >= 100) return "Amplified volume"

  return state.sink
}

export function getOutputMuteLabel(state: VolumeState) {
  return state.muted ? "Yes" : "No"
}

export function getInputMuteLabel(state: VolumeState) {
  return state.sourceMuted ? "Yes" : "No"
}

export function getInputActiveLabel(state: VolumeState) {
  if (state.activeInputs <= 0) return "No"

  return `${state.activeInputs} stream${state.activeInputs === 1 ? "" : "s"}`
}

export function getMicrophoneDetail(state: VolumeState) {
  if (state.sourceMuted && state.activeInputs > 0) return "Mic muted while input is active"
  if (state.sourceMuted) return "Microphone muted"
  if (state.activeInputs > 0) return "Microphone in use"

  return "Microphone ready"
}

export function toggleMute() {
  runOutputCommand("pactl set-sink-mute @DEFAULT_SINK@ toggle")
}

export function toggleMicMute() {
  spawn("pactl set-source-mute @DEFAULT_SOURCE@ toggle")
}

export function changeVolume(delta: number) {
  const sign = delta > 0 ? "+" : "-"
  runOutputCommand(`pactl set-sink-volume @DEFAULT_SINK@ ${sign}${Math.abs(delta)}%`)
}

export function openMixer() {
  spawn("pavucontrol")
}

export function setVolume(percent: number) {
  const value = clamp(Math.round(percent), 0, 150)
  runOutputCommand(`pactl set-sink-volume @DEFAULT_SINK@ ${value}%`)
}

export function setMicVolume(percent: number) {
  const value = clamp(Math.round(percent), 0, 150)
  spawn(`pactl set-source-volume @DEFAULT_SOURCE@ ${value}%`)
}
