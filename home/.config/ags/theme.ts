import { CACHE_HOME } from "./lib/paths"
import { Gdk } from "ags/gtk4"
import { clamp, round } from "./lib/math"
import { getHomeDir, readFile } from "./lib/shell"

/* =============================================================================
 * Types
 * ============================================================================= */

type ScaleMode = "auto" | "fixed"
type UiBucket = "sm" | "md" | "lg" | "xl"
type CssProfile = "auto" | "compact" | "normal" | "large" | "xlarge" | "huge"

type MonitorInfo = {
  connector: string
  manufacturer: string
  model: string
  fallbackKey: string
  monitorKey: string
}

type MonitorOverride = {
  widgetScale?: number
  dialScale?: number
  musicScale?: number
  cssProfile?: CssProfile
  bucket?: UiBucket
}

export type UiColors = {
  bg: string
  fg: string
  muted: string
  warning: string
  critical: string
}

export type UiScale = {
  factor: number
  bucket: UiBucket
  cssClass: string

  monitorKey: string
  connector: string
  model: string

  dialSize: number
  dialArcWidth: number

  musicWidth: number
  musicHeight: number

  colors: UiColors
}

/* =============================================================================
 * Global scale controls
 * ============================================================================= */

const DEBUG_SCALE = false

const SCALE_MODE: ScaleMode = "auto"

/*
 * Used only when SCALE_MODE is "fixed".
 * Example values:
 * 0.90 = smaller
 * 1.00 = normal
 * 1.15 = larger
 */
const FIXED_SCALE = 1.15

/*
 * Used only when SCALE_MODE is "auto".
 * This lets you make the automatic result globally larger or smaller.
 */
const GLOBAL_WIDGET_SCALE = 1.2

const REFERENCE_HEIGHT = 1080
const HIDPI_WEIGHT = 0.15
const AUTO_SCALE_POWER = 0.75

const MIN_SCALE = 0.82
const MAX_SCALE = 1.7

const BUCKET_SM_MAX = 0.95
const BUCKET_MD_MAX = 1.12
const BUCKET_LG_MAX = 1.3

/* =============================================================================
 * Base widget sizes
 * ============================================================================= */

const BASE_DIAL_SIZE = 37
const BASE_DIAL_ARC_WIDTH = 4.5

const BASE_MUSIC_WIDTH = 32
const BASE_MUSIC_HEIGHT = 44

/* =============================================================================
 * Monitor overrides
 * ============================================================================= */

/*
 * Keys can be:
 * - connector, for example "DP-1", "HDMI-A-1", "eDP-1"
 * - model name
 * - "monitor-0", "monitor-1", etc.
 */

const MONITOR_OVERRIDES: Record<string, MonitorOverride> = {
  /*
  "monitor-0": {
    widgetScale: 1.0,
    dialScale: 1.0,
    musicScale: 1.0,
    bucket: "md",
    cssProfile: "auto",
  },
  */
}

/* =============================================================================
 * Fallback values
 * ============================================================================= */

export const FALLBACK_COLORS: UiColors = {
  bg: "#191619",
  fg: "#f0d6ad",
  muted: "#f0d6ad",
  warning: "#f0d6ad",
  critical: "#f0d6ad",
}

export const FALLBACK_UI: UiScale = {
  factor: 1,
  bucket: "md",
  cssClass: "scale-md",

  monitorKey: "fallback",
  connector: "",
  model: "",

  dialSize: 42,
  dialArcWidth: 5,

  musicWidth: 34,
  musicHeight: 42,

  colors: FALLBACK_COLORS,
}

/* =============================================================================
 * Cache
 * ============================================================================= */

let cachedWalColors: UiColors | null = null
const uiScaleCache = new Map<string, UiScale>()

/* =============================================================================
 * Color helpers
 * ============================================================================= */

function readWalColors(): UiColors {
  if (cachedWalColors) {
    return cachedWalColors
  }

  const raw = readFile(`${CACHE_HOME}/wal/colors.json`)

  if (!raw) {
    cachedWalColors = FALLBACK_COLORS
    return cachedWalColors
  }

  try {
    const json = JSON.parse(raw)

    cachedWalColors = {
      bg: json.special?.background ?? FALLBACK_COLORS.bg,
      fg: json.colors?.color11 ?? FALLBACK_COLORS.fg,
      muted: json.colors?.color11 ?? FALLBACK_COLORS.muted,
      warning: json.colors?.color11 ?? FALLBACK_COLORS.warning,
      critical: json.colors?.color11 ?? FALLBACK_COLORS.critical,
    }
  } catch {
    cachedWalColors = FALLBACK_COLORS
  }

  return cachedWalColors
}

/* =============================================================================
 * Scale helpers
 * ============================================================================= */

function getBucket(factor: number): UiBucket {
  if (factor < BUCKET_SM_MAX) return "sm"
  if (factor < BUCKET_MD_MAX) return "md"
  if (factor < BUCKET_LG_MAX) return "lg"

  return "xl"
}

function getCssClass(bucket: UiBucket, profile?: CssProfile) {
  if (profile && profile !== "auto") {
    return `profile-${profile}`
  }

  return `scale-${bucket}`
}

function getAutoScaleFactor(baseHeight: number) {
  return clamp(
    Math.pow(baseHeight / REFERENCE_HEIGHT, AUTO_SCALE_POWER) *
      GLOBAL_WIDGET_SCALE,
    MIN_SCALE,
    MAX_SCALE,
  )
}

function getFixedScaleFactor() {
  return clamp(FIXED_SCALE, MIN_SCALE, MAX_SCALE)
}

function getBaseScaleFactor(baseHeight: number) {
  if (SCALE_MODE === "fixed") {
    return getFixedScaleFactor()
  }

  return getAutoScaleFactor(baseHeight)
}

function getHiDpiAdjustedHeight(height: number, scaleFactor: number) {
  const hidpiBoost = 1 + (scaleFactor - 1) * HIDPI_WEIGHT
  return height * hidpiBoost
}

/* =============================================================================
 * Monitor helpers
 * ============================================================================= */

function getMonitorString(gdkmonitor: Gdk.Monitor, getter: string) {
  try {
    const method = (gdkmonitor as any)[getter]
    const value = typeof method === "function" ? method.call(gdkmonitor) : ""

    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  } catch {
    // Ignore unsupported monitor getters.
  }

  return ""
}

function getMonitorInfo(gdkmonitor: Gdk.Monitor, monitorIndex: number): MonitorInfo {
  const connector = getMonitorString(gdkmonitor, "get_connector")
  const manufacturer = getMonitorString(gdkmonitor, "get_manufacturer")
  const model = getMonitorString(gdkmonitor, "get_model")

  const fallbackKey = `monitor-${monitorIndex}`
  const modelKey = manufacturer && model ? `${manufacturer}-${model}` : model
  const monitorKey = connector || modelKey || fallbackKey

  return {
    connector,
    manufacturer,
    model,
    fallbackKey,
    monitorKey,
  }
}

function getMonitorOverride(info: MonitorInfo): MonitorOverride {
  return (
    MONITOR_OVERRIDES[info.monitorKey] ??
    MONITOR_OVERRIDES[info.connector] ??
    MONITOR_OVERRIDES[info.model] ??
    MONITOR_OVERRIDES[info.fallbackKey] ??
    {}
  )
}

function getCacheKey(
  info: MonitorInfo,
  geometry: Gdk.Rectangle,
  scaleFactor: number,
) {
  return [
    info.monitorKey,
    info.fallbackKey,
    geometry.width,
    geometry.height,
    scaleFactor,
    SCALE_MODE,
    FIXED_SCALE,
    GLOBAL_WIDGET_SCALE,
  ].join(":")
}

/* =============================================================================
 * Public API
 * ============================================================================= */

export function clearThemeCache() {
  cachedWalColors = null
  uiScaleCache.clear()
}

export function getUiScale(gdkmonitor: Gdk.Monitor, monitorIndex = 0): UiScale {
  const geometry = gdkmonitor.get_geometry()
  const scaleFactor = gdkmonitor.get_scale_factor()

  const info = getMonitorInfo(gdkmonitor, monitorIndex)
  const cacheKey = getCacheKey(info, geometry, scaleFactor)

  const cached = uiScaleCache.get(cacheKey)

  if (cached) {
    return cached
  }

  const override = getMonitorOverride(info)

  const baseHeight = getHiDpiAdjustedHeight(geometry.height, scaleFactor)
  const baseFactor = getBaseScaleFactor(baseHeight)

  const factor = clamp(
    baseFactor * (override.widgetScale ?? 1),
    MIN_SCALE,
    MAX_SCALE,
  )

  const bucket = override.bucket ?? getBucket(factor)
  const cssClass = getCssClass(bucket, override.cssProfile)

  const dialFactor = factor * (override.dialScale ?? 1)
  const musicFactor = factor * (override.musicScale ?? 1)

  const ui: UiScale = {
    factor,
    bucket,
    cssClass,

    monitorKey: info.monitorKey,
    connector: info.connector,
    model: info.model,

    dialSize: round(BASE_DIAL_SIZE * dialFactor),
    dialArcWidth: round(BASE_DIAL_ARC_WIDTH * dialFactor),

    musicWidth: round(BASE_MUSIC_WIDTH * musicFactor),
    musicHeight: round(BASE_MUSIC_HEIGHT * musicFactor),

    colors: readWalColors(),
  }

  if (DEBUG_SCALE) {
    console.log(
      `[AGS scale] key=${info.monitorKey} fallback=${info.fallbackKey} ${geometry.width}x${geometry.height} scale=${scaleFactor} baseHeight=${baseHeight.toFixed(0)} base=${baseFactor.toFixed(2)} factor=${factor.toFixed(2)} bucket=${bucket} css=${cssClass}`,
    )
  }

  uiScaleCache.set(cacheKey, ui)
  return ui
}
export function withUserScale(ui: UiScale, multiplier: number): UiScale {
  const scale = clamp(Number.isFinite(multiplier) ? multiplier : 1, 0.7, 2.4)

  if (Math.abs(scale - 1) < 0.0001) {
    return ui
  }

  return {
    ...ui,
    factor: ui.factor * scale,
    dialSize: Math.max(1, round(ui.dialSize * scale)),
    dialArcWidth: Math.max(1, round(ui.dialArcWidth * scale)),
    musicWidth: Math.max(1, round(ui.musicWidth * scale)),
    musicHeight: Math.max(1, round(ui.musicHeight * scale)),
  }
}

