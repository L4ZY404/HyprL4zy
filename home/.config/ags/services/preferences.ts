import GLib from "gi://GLib?version=2.0"
import { AGS_DIR } from "../lib/paths"
import { readFile, readJson, writeFile } from "../lib/shell"

export const LOCAL_PREFERENCES_SCHEMA_VERSION = 1
export const LOCAL_PREFERENCES_PATH = `${AGS_DIR}/local.json`

export type WeatherPreferences = {
  latitude: number | null
  longitude: number | null
  location: string
}

export type SessionPreferences = {
  lockSeconds: number
  screenOffSeconds: number
}

export type LocalPreferences = {
  schemaVersion: number
  workspaceCount: number
  visualizerFps: number
  visualizerBatteryFps: number
  terminal: string
  fileManager: string
  browser: string
  wallpaperDir: string
  weather: WeatherPreferences
  session: SessionPreferences
}

export type LocalPreferencesMeta = {
  sourceVersion: number
  currentVersion: number
  migrated: boolean
  future: boolean
}

const pictures = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES)
  || `${GLib.get_home_dir()}/Pictures`

export const DEFAULT_LOCAL_PREFERENCES: LocalPreferences = {
  schemaVersion: LOCAL_PREFERENCES_SCHEMA_VERSION,
  workspaceCount: 10,
  visualizerFps: 30,
  visualizerBatteryFps: 15,
  terminal: "",
  fileManager: "",
  browser: "",
  wallpaperDir: "",
  weather: {
    latitude: null,
    longitude: null,
    location: "",
  },
  session: {
    lockSeconds: 1800,
    screenOffSeconds: 1830,
  },
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function number(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback
}

function nullableNumber(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  if (value < min || value > max) return null
  return value
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback
}

function sourceVersion(raw: Record<string, any>) {
  const value = raw.schemaVersion
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0
}

export function normalizeLocalPreferences(input: unknown): LocalPreferences {
  const raw = isObject(input) ? input : {}
  const weather = isObject(raw.weather) ? raw.weather : {}
  const session = isObject(raw.session) ? raw.session : {}

  // Legacy builds had no schemaVersion and may have stored idle values at the root.
  const lockSeconds = Math.round(number(
    session.lockSeconds ?? raw.lockSeconds,
    DEFAULT_LOCAL_PREFERENCES.session.lockSeconds,
    60,
    86400,
  ))
  const screenOffSeconds = Math.round(number(
    session.screenOffSeconds ?? raw.screenOffSeconds,
    DEFAULT_LOCAL_PREFERENCES.session.screenOffSeconds,
    lockSeconds + 5,
    86400,
  ))

  return {
    schemaVersion: LOCAL_PREFERENCES_SCHEMA_VERSION,
    workspaceCount: Math.round(number(raw.workspaceCount, DEFAULT_LOCAL_PREFERENCES.workspaceCount, 1, 20)),
    visualizerFps: Math.round(number(raw.visualizerFps, DEFAULT_LOCAL_PREFERENCES.visualizerFps, 10, 60)),
    visualizerBatteryFps: Math.round(number(raw.visualizerBatteryFps, DEFAULT_LOCAL_PREFERENCES.visualizerBatteryFps, 5, 30)),
    terminal: text(raw.terminal),
    fileManager: text(raw.fileManager),
    browser: text(raw.browser),
    wallpaperDir: text(raw.wallpaperDir),
    weather: {
      latitude: nullableNumber(weather.latitude, -90, 90),
      longitude: nullableNumber(weather.longitude, -180, 180),
      location: text(weather.location),
    },
    session: {
      lockSeconds,
      screenOffSeconds,
    },
  }
}

function rawDocument() {
  const parsed = readJson<unknown>(readFile(LOCAL_PREFERENCES_PATH), {})
  return isObject(parsed) ? parsed : {}
}

export function getLocalPreferencesMeta(): LocalPreferencesMeta {
  const raw = rawDocument()
  const version = sourceVersion(raw)
  return {
    sourceVersion: version,
    currentVersion: LOCAL_PREFERENCES_SCHEMA_VERSION,
    migrated: version < LOCAL_PREFERENCES_SCHEMA_VERSION,
    future: version > LOCAL_PREFERENCES_SCHEMA_VERSION,
  }
}

export function loadLocalPreferences(): LocalPreferences {
  return normalizeLocalPreferences(rawDocument())
}

export function saveLocalPreferences(next: LocalPreferences) {
  const current = rawDocument()
  if (sourceVersion(current) > LOCAL_PREFERENCES_SCHEMA_VERSION) return false
  const normalized = normalizeLocalPreferences(next)
  const currentWeather = isObject(current.weather) ? current.weather : {}
  const currentSession = isObject(current.session) ? current.session : {}
  const merged = {
    ...current,
    ...normalized,
    weather: {
      ...currentWeather,
      ...normalized.weather,
    },
    session: {
      ...currentSession,
      ...normalized.session,
    },
  }

  // Remove legacy aliases after the values have been migrated into session.
  delete merged.lockSeconds
  delete merged.screenOffSeconds
  return writeFile(LOCAL_PREFERENCES_PATH, `${JSON.stringify(merged, null, 2)}\n`)
}

export function resetLocalPreferences() {
  const reset = normalizeLocalPreferences(DEFAULT_LOCAL_PREFERENCES)
  return saveLocalPreferences(reset) ? reset : loadLocalPreferences()
}

const stored = loadLocalPreferences()
const latitude = stored.weather.latitude
const longitude = stored.weather.longitude

// Runtime modules keep the historical shape so existing consumers do not need to
// understand the persistence format. Values that require a restart are resolved once.
export const preferences = {
  workspaceCount: stored.workspaceCount,
  visualizerFps: stored.visualizerFps,
  visualizerBatteryFps: stored.visualizerBatteryFps,
  terminal: stored.terminal,
  fileManager: stored.fileManager,
  browser: stored.browser,
  wallpaperDir: (stored.wallpaperDir || `${pictures}/Wallpapers`).replace(/^~(?=\/|$)/, GLib.get_home_dir()),
  weather: {
    enabled: latitude !== null && longitude !== null,
    latitude: latitude ?? 0,
    longitude: longitude ?? 0,
    location: stored.weather.location || "Weather",
  },
  session: stored.session,
}
