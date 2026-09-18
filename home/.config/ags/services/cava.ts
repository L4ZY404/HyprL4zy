import { CACHE_HOME } from "../lib/paths"
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"

import { commandExists, execAsync, shellQuote } from "../lib/shell"

const CAVA_BAR_COUNT = 6
const CAVA_MAX_VALUE = 64
const CAVA_FRAMERATE = 30

const CAVA_CONFIG = `${CACHE_HOME}/ags/cava.conf`
const CAVA_LOG = `${CACHE_HOME}/ags/cava.log`

const SOURCE_REFRESH_INTERVAL_MS = 30000
const CAVA_ENSURE_INTERVAL_MS = 30000
const SILENCE_GRACE_MS = 1800

let currentCavaSource = ""
let cachedPulseSource = ""
let lastSourceCheckMs = 0
let lastCavaEnsureMs = 0
let lastConfigContent = ""
let lastFrameMs = 0

let cavaProcess: Gio.Subprocess | null = null
let cavaStream: Gio.DataInputStream | null = null
let cavaAlive = false

let lastCavaValues = readFallbackValues(CAVA_BAR_COUNT)

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

async function sh(command: string) {
  return execAsync(["sh", "-c", command])
}

function writeFile(path: string, content: string) {
  try {
    GLib.mkdir_with_parents(`${CACHE_HOME}/ags`, 0o700)
    GLib.file_set_contents(path, content)
  } catch {
    // Ignore write failures.
  }
}

async function getPulseMonitorSource() {
  if (!commandExists("pactl")) {
    return "auto"
  }

  const defaultSink = await sh("pactl get-default-sink 2>/dev/null")

  if (defaultSink) {
    const monitorSource = `${defaultSink}.monitor`

    const detectedSource = await sh(
      `pactl list short sources 2>/dev/null | awk '{print $2}' | grep -Fx ${shellQuote(
        monitorSource,
      )} | head -n1`,
    )

    if (detectedSource) {
      return detectedSource
    }
  }

  const runningMonitor = await sh(
    `pactl list short sources 2>/dev/null | awk '$2 ~ /\\.monitor$/ && $NF == "RUNNING" {print $2; exit}'`,
  )

  if (runningMonitor) {
    return runningMonitor
  }

  const firstMonitor = await sh(
    `pactl list short sources 2>/dev/null | awk '$2 ~ /\\.monitor$/ {print $2; exit}'`,
  )

  return firstMonitor || "auto"
}

async function getCachedPulseMonitorSource(force = false) {
  const now = Date.now()

  if (
    !force &&
    cachedPulseSource &&
    now - lastSourceCheckMs < SOURCE_REFRESH_INTERVAL_MS
  ) {
    return cachedPulseSource
  }

  lastSourceCheckMs = now
  cachedPulseSource = await getPulseMonitorSource()

  return cachedPulseSource
}

function buildCavaConfig(source: string) {
  return `
[general]
bars = ${CAVA_BAR_COUNT}
framerate = ${CAVA_FRAMERATE}
autosens = 1
sensitivity = 100

[input]
method = pulse
source = ${source}

[output]
method = raw
raw_target = /dev/stdout
data_format = ascii
ascii_max_range = ${CAVA_MAX_VALUE}
bar_delimiter = 59
frame_delimiter = 10
`.trim()
}

function readFallbackValues(count = CAVA_BAR_COUNT) {
  const time = Date.now() / 260

  return Array.from({ length: count }, (_, index) => {
    const wave = (Math.sin(time + index * 1.65) + 1) / 2
    const pulse = (Math.sin(time * 0.55 + index * 0.9) + 1) / 2

    return clamp01(0.14 + wave * 0.48 + pulse * 0.14)
  })
}

function normalizeCavaValues(values: number[], count: number) {
  if (values.length === 0) {
    return lastCavaValues.length === count
      ? lastCavaValues
      : readFallbackValues(count)
  }

  const normalized = values.map((value) => clamp01(value / CAVA_MAX_VALUE))

  if (normalized.length === count) {
    return normalized
  }

  if (normalized.length > count) {
    return normalized.slice(0, count)
  }

  return Array.from({ length: count }, (_, index) => {
    return normalized[index] ?? normalized[normalized.length - 1] ?? 0
  })
}

function parseCavaLine(line: string) {
  const values = line
    .split(";")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value))

  lastCavaValues = normalizeCavaValues(values, CAVA_BAR_COUNT)
  lastFrameMs = Date.now()
}

function readNextLine() {
  if (!cavaStream) {
    return
  }

  const stream = cavaStream
  stream.read_line_async(
    GLib.PRIORITY_DEFAULT,
    null,
    (_stream, result) => {
      if (!cavaStream || cavaStream !== stream) {
        return
      }

      try {
        const [line] = stream.read_line_finish_utf8(result)

        if (line === null) {
          return
        }

        parseCavaLine(line)
        readNextLine()
      } catch (error) {
        console.error("Cava stream read error:", error)
      }
    },
  )
}

function isManagedCavaRunning() {
  return cavaProcess !== null && cavaAlive
}

function watchManagedCava(process: Gio.Subprocess) {
  process.wait_async(null, (_process, result) => {
    try {
      process.wait_finish(result)
    } catch {
      // Ignore wait failures.
    }

    if (cavaProcess === process) {
      cavaAlive = false
      cavaProcess = null
      cavaStream = null
    }
  })
}

function stopManagedCava() {
  const process = cavaProcess

  cavaAlive = false
  cavaProcess = null
  cavaStream = null

  try {
    process?.force_exit()
  } catch {
    // Ignore stop failures.
  }
}

function startManagedCava() {
  try {
    const process = new Gio.Subprocess({
      argv: ["cava", "-p", CAVA_CONFIG],
      flags:
        Gio.SubprocessFlags.STDOUT_PIPE |
        Gio.SubprocessFlags.STDERR_SILENCE,
    })

    process.init(null)

    const stdout = process.get_stdout_pipe()

    if (!stdout) {
      writeFile(CAVA_LOG, "Cava stdout pipe unavailable\n")
      return
    }

    cavaProcess = process
    cavaAlive = true
    cavaStream = new Gio.DataInputStream({
      base_stream: stdout,
    })

    watchManagedCava(process)
    readNextLine()
  } catch (error) {
    writeFile(CAVA_LOG, `Cava start error: ${String(error)}\n`)
    cavaAlive = false
    cavaProcess = null
    cavaStream = null
  }
}

async function ensureCava(force = false) {
  const now = Date.now()
  if (shuttingDown) return

  if (!force && now - lastCavaEnsureMs < CAVA_ENSURE_INTERVAL_MS) {
    return
  }

  lastCavaEnsureMs = now

  if (!commandExists("cava")) {
    writeFile(CAVA_LOG, "cava binary was not found\n")
    return
  }

  const running = isManagedCavaRunning()
  const source = await getCachedPulseMonitorSource(force || !running)
  if (shuttingDown || visualizerConsumers.size === 0) return
  const configContent = buildCavaConfig(source)

  const sourceChanged = currentCavaSource !== "" && currentCavaSource !== source
  const configChanged = lastConfigContent !== "" && lastConfigContent !== configContent

  if (force || sourceChanged || configChanged) {
    stopManagedCava()
  }

  currentCavaSource = source

  if (lastConfigContent !== configContent) {
    lastConfigContent = configContent
    writeFile(CAVA_CONFIG, configContent)
  }

  if (isManagedCavaRunning()) {
    return
  }

  startManagedCava()
}

const visualizerConsumers = new Set<object>()
export function setVisualizerActive(consumer: object, active: boolean) {
  if (active) {
    if (!visualizerConsumers.has(consumer)) lastCavaEnsureMs = 0
    visualizerConsumers.add(consumer)
    ensureCavaRunning()
  } else {
    visualizerConsumers.delete(consumer)
    if (!visualizerConsumers.size) stopManagedCava()
  }
}
let ensurePromise: Promise<void> | null = null
let shuttingDown = false
export function ensureCavaRunning() {
  if (ensurePromise || shuttingDown || visualizerConsumers.size === 0) return
  ensurePromise = ensureCava().catch(error => console.error("Cava:", error))
    .finally(() => { ensurePromise = null })
}
export function shutdownCava() {
  shuttingDown = true
  stopManagedCava()
}


export function readCavaValues(count = CAVA_BAR_COUNT) {
  const now = Date.now()

  if (now - lastFrameMs > SILENCE_GRACE_MS) {
    return lastCavaValues.length === count
      ? lastCavaValues
      : readFallbackValues(count)
  }

  if (lastCavaValues.length === count) {
    return lastCavaValues
  }

  return normalizeCavaValues(lastCavaValues, count)
}

export function restartCava() {
  currentCavaSource = ""
  cachedPulseSource = ""
  lastSourceCheckMs = 0
  lastCavaEnsureMs = 0
  lastConfigContent = ""
  lastFrameMs = 0

  stopManagedCava()
  ensureCavaRunning()
}