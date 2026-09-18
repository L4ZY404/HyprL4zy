import Gio from "gi://Gio?version=2.0"
import { preferences } from "./preferences"
import { CONFIG_HOME, CACHE_HOME } from "../lib/paths"
import GLib from "gi://GLib?version=2.0"

import {
  commandExists,
  execAsync,
  fileExists,
  getHomeDir,
  readFile,
  shellQuote,
  spawn,
} from "../lib/shell"

export const WALLPAPER_THUMB_WIDTH = 640
const WALLPAPER_THUMB_HEIGHT = 360
const WALLPAPER_THUMB_REV = "v2"

type ThemeState = {
  wallDir: string
  currentPath: string
  fileName: string
  kind: "image" | "video" | "unknown"
  previewPath: string
  cacheImagePath: string
  thumbnailPath: string
  status: "ready" | "missing" | "empty"
  detail: string
  awww: boolean
  swww: boolean
  wal: boolean
  nemo: boolean
  ranger: boolean
  fileManager: string
  ffmpeg: boolean
  mpvpaper: boolean
  magick: boolean
}

export type WallpaperEntry = {
  path: string
  fileName: string
  kind: ThemeState["kind"]
  thumbnailPath: string
  isCurrent: boolean
}

const HOME = getHomeDir()
const WALL_DIR = preferences.wallpaperDir
const CACHE_IMG = `${CACHE_HOME}/current_wallpaper.jpg`
const CACHE_PATH = `${CACHE_HOME}/current_wall_path`
const CACHE_TBL = `${CACHE_HOME}/current_bg_tbl.jpg`
const WALLPAPER_SCRIPT = `${CONFIG_HOME}/ags/scripts/theme/wallpaper_manager.sh`
const WALLPAPER_PREVIEW_DIR = `${CACHE_HOME}/ags/wallpaper-previews`

let cachedThemeState: ThemeState | null = null
let lastThemeStateMs = 0
let cachedWallpaperEntries: WallpaperEntry[] | null = null
let lastWallpaperEntriesMs = 0
let wallpaperEntriesPromise: Promise<WallpaperEntry[]> | null = null
let lastWallpaperApplyPath = ""
let lastWallpaperApplyMs = 0

const THEME_STATE_CACHE_MS = 3500
const WALLPAPER_ENTRY_CACHE_MS = 30000

function getFileName(path: string) {
  const parts = path.split("/").filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : "No wallpaper"
}

function getExtension(path: string) {
  const name = getFileName(path)
  const parts = name.split(".")

  return (parts.length > 1 ? parts[parts.length - 1] : "").toLowerCase()
}

function getWallpaperKind(path: string): ThemeState["kind"] {
  const extension = getExtension(path)

  if (["mp4", "mkv", "webm"].includes(extension)) {
    return "video"
  }

  if (["jpg", "jpeg", "png", "webp"].includes(extension)) {
    return "image"
  }

  return "unknown"
}

function getCurrentPath() {
  const stored = readFile(CACHE_PATH)

  if (stored && fileExists(stored)) {
    return stored
  }

  return ""
}

function getPreviewPath() {
  if (fileExists(CACHE_TBL)) {
    return CACHE_TBL
  }

  if (fileExists(CACHE_IMG)) {
    return CACHE_IMG
  }

  return ""
}

function getThumbKey(path: string) {
  try {
    const checksum = (GLib as any).compute_checksum_for_string?.(
      GLib.ChecksumType.SHA1,
      path,
      -1,
    )

    if (checksum) {
      return checksum
    }
  } catch {
    // Fall back to a sanitized filename below.
  }

  return path.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-96)
}

function buildThemeState(): ThemeState {
  const currentPath = getCurrentPath()
  const previewPath = getPreviewPath()
  const hasWallDir = fileExists(WALL_DIR)
  const hasScript = fileExists(WALLPAPER_SCRIPT)
  const awww = commandExists("awww") || commandExists("awww-daemon")
  const swww = commandExists("swww") || commandExists("swww-daemon")
  const wal = commandExists("wal")
  const missing = [
    hasScript ? "" : "wallpaper manager",
    hasWallDir ? "" : "wallpaper folder",
    awww || swww ? "" : "awww/swww",
    wal ? "" : "wal",
  ].filter(Boolean)

  let status: ThemeState["status"] = "ready"
  let detail = "Theme manager ready"

  if (missing.length > 0) {
    status = "missing"
    detail = `Missing: ${missing.join(", ")}`
  } else if (!currentPath && !previewPath) {
    status = "empty"
    detail = "No current wallpaper cache found"
  }

  return {
    wallDir: WALL_DIR,
    currentPath,
    fileName: currentPath ? getFileName(currentPath) : "No wallpaper",
    kind: currentPath ? getWallpaperKind(currentPath) : "unknown",
    previewPath,
    cacheImagePath: CACHE_IMG,
    thumbnailPath: CACHE_TBL,
    status,
    detail,
    awww,
    swww,
    wal,
    nemo: commandExists("nemo"),
    ranger: commandExists("ranger"),
    fileManager: getPreferredWallpaperBrowser(),
    ffmpeg: commandExists("ffmpeg"),
    mpvpaper: commandExists("mpvpaper"),
    magick: commandExists("magick") || commandExists("convert"),
  }
}

export function readThemeState(force = false): ThemeState {
  const now = Date.now()

  if (
    !force &&
    cachedThemeState &&
    now - lastThemeStateMs < THEME_STATE_CACHE_MS
  ) {
    return cachedThemeState
  }

  cachedThemeState = buildThemeState()
  lastThemeStateMs = now

  return cachedThemeState
}

async function sh(script: string) {
  return execAsync(["bash", "-c", script])
}

function runWallpaperScript(arg = "") {
  const suffix = arg ? ` ${arg}` : ""
  const started = spawn(`${shellQuote(WALLPAPER_SCRIPT)}${suffix}`)
  if (started) invalidateThemeCache()
  return started
}

function getPreferredTerminal() {
  for (const command of ["alacritty", "kitty", "foot", "wezterm", "ghostty", "xterm", "x-terminal-emulator"]) {
    if (commandExists(command)) {
      return command
    }
  }

  return ""
}

function getPreferredWallpaperBrowser() {
  if (commandExists("nemo")) {
    return "nemo"
  }

  if (commandExists("ranger")) {
    return "ranger"
  }

  return "xdg-open"
}

function openTerminalCommand(command: string, title = "Wallpaper Folder") {
  const terminal = getPreferredTerminal()
  const quoted = shellQuote(command)

  switch (terminal) {
    case "alacritty":
      spawn(`alacritty --title ${shellQuote(title)} -e bash -lc ${quoted}`)
      return true
    case "kitty":
      spawn(`kitty --title ${shellQuote(title)} -e bash -lc ${quoted}`)
      return true
    case "foot":
      spawn(`foot -T ${shellQuote(title)} bash -lc ${quoted}`)
      return true
    case "wezterm":
      spawn(`wezterm start -- bash -lc ${quoted}`)
      return true
    case "ghostty":
      spawn(`ghostty -e bash -lc ${quoted}`)
      return true
    case "xterm":
      spawn(`xterm -T ${shellQuote(title)} -e bash -lc ${quoted}`)
      return true
    case "x-terminal-emulator":
      spawn(`x-terminal-emulator -e bash -lc ${quoted}`)
      return true
    default:
      return false
  }
}

function invalidateThemeCache() {
  cachedThemeState = null
  lastThemeStateMs = 0
  cachedWallpaperEntries = null
  lastWallpaperEntriesMs = 0
}

async function findWallpaperPaths() {
  if (!fileExists(WALL_DIR)) {
    return []
  }

  const output = await sh(`
find ${shellQuote(WALL_DIR)} -type f \\( \
  -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" -o \
  -iname "*.mp4" -o -iname "*.mkv" -o -iname "*.webm" \
\\) -printf '%T@ %p\\n' 2>/dev/null | sort -nr | cut -d' ' -f2-
`.trim())

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && fileExists(line))
}

async function ensureWallpaperThumbnail(path: string, kind: ThemeState["kind"]) {
  let stamp = ""
  try {
    const info = Gio.File.new_for_path(path).query_info("time::modified,standard::size", Gio.FileQueryInfoFlags.NONE, null)
    stamp = `${info.get_attribute_uint64("time::modified")}:${info.get_size()}`
  } catch {}
  const thumbPath = `${WALLPAPER_PREVIEW_DIR}/${getThumbKey(`${path}:${stamp}:${WALLPAPER_THUMB_WIDTH}x${WALLPAPER_THUMB_HEIGHT}:${WALLPAPER_THUMB_REV}`)}.jpg`

  if (fileExists(thumbPath)) {
    return thumbPath
  }

  const quotedPath = shellQuote(path)
  const quotedThumb = shellQuote(thumbPath)
  let command = ""

  if (kind === "video") {
    if (!commandExists("ffmpeg")) {
      return ""
    }

    command = `timeout 20 ffmpeg -threads 1 -y -ss 00:00:01 -i ${quotedPath} -vframes 1 -vf 'scale=${WALLPAPER_THUMB_WIDTH}:${WALLPAPER_THUMB_HEIGHT}:force_original_aspect_ratio=increase,crop=${WALLPAPER_THUMB_WIDTH}:${WALLPAPER_THUMB_HEIGHT}' -q:v 2 ${quotedThumb} >/dev/null 2>&1`
  } else if (commandExists("magick")) {
    command = `timeout 20 magick -limit thread 1 ${quotedPath} -auto-orient -resize '${WALLPAPER_THUMB_WIDTH}x${WALLPAPER_THUMB_HEIGHT}^' -gravity center -extent ${WALLPAPER_THUMB_WIDTH}x${WALLPAPER_THUMB_HEIGHT} -quality 86 ${quotedThumb} >/dev/null 2>&1`
  } else if (commandExists("convert")) {
    command = `timeout 20 convert -limit thread 1 ${quotedPath} -auto-orient -resize '${WALLPAPER_THUMB_WIDTH}x${WALLPAPER_THUMB_HEIGHT}^' -gravity center -extent ${WALLPAPER_THUMB_WIDTH}x${WALLPAPER_THUMB_HEIGHT} -quality 86 ${quotedThumb} >/dev/null 2>&1`
  } else {
    return kind === "image" ? path : ""
  }

  await sh(`mkdir -p ${shellQuote(WALLPAPER_PREVIEW_DIR)} && ${command} || true`)

  return fileExists(thumbPath) ? thumbPath : ""
}

async function buildWallpaperEntries() {
  const currentPath = getCurrentPath()
  const foundPaths = await findWallpaperPaths()
  const uniquePaths = [currentPath, ...foundPaths]
    .filter(Boolean)
    .filter((path, index, list) => list.indexOf(path) === index)

  const entries: WallpaperEntry[] = new Array(uniquePaths.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < uniquePaths.length) {
      const index = nextIndex++
      const path = uniquePaths[index]
      const kind = getWallpaperKind(path)
      const thumbnailPath = await ensureWallpaperThumbnail(path, kind)
      entries[index] = { path, fileName: getFileName(path), kind, thumbnailPath,
        isCurrent: Boolean(currentPath && path === currentPath) }
    }
  }
  await Promise.all([worker(), worker()])

  return entries
}

export async function readWallpaperEntries(force = false): Promise<WallpaperEntry[]> {
  const now = Date.now()

  if (
    !force &&
    cachedWallpaperEntries &&
    now - lastWallpaperEntriesMs < WALLPAPER_ENTRY_CACHE_MS
  ) {
    return cachedWallpaperEntries
  }

  if (wallpaperEntriesPromise) {
    return wallpaperEntriesPromise
  }

  wallpaperEntriesPromise = buildWallpaperEntries()
    .then((entries) => {
      cachedWallpaperEntries = entries
      lastWallpaperEntriesMs = Date.now()
      return entries
    })
    .finally(() => {
      wallpaperEntriesPromise = null
    })

  return wallpaperEntriesPromise
}

export function applyWallpaper(path: string) {
  const normalized = path.trim()
  if (!normalized) return false
  const now = Date.now()
  if (normalized === lastWallpaperApplyPath && now - lastWallpaperApplyMs < 1800) return false
  lastWallpaperApplyPath = normalized
  lastWallpaperApplyMs = now
  return runWallpaperScript(shellQuote(normalized))
}

export function applyRandomWallpaper() {
  runWallpaperScript("--random")
}

export function selectWallpaper() {
  openWallpapersFolder()
}

export function regenerateTheme() {
  const state = readThemeState(true)

  if (state.currentPath) {
    runWallpaperScript(shellQuote(state.currentPath))
    return
  }

  runWallpaperScript("")
}

export function restoreWallpaper() {
  runWallpaperScript("")
}

export function openCurrentWallpaper() {
  const state = readThemeState(true)

  if (state.currentPath) {
    spawn(`xdg-open ${shellQuote(state.currentPath)}`)
    return
  }

  openWallpapersFolder()
}

export function openWallpapersFolder() {
  if (commandExists("nemo")) {
    spawn(`nemo ${shellQuote(WALL_DIR)}`)
    return
  }

  if (commandExists("ranger") && openTerminalCommand(`ranger ${shellQuote(WALL_DIR)}`, "Wallpapers")) {
    return
  }

  spawn(`xdg-open ${shellQuote(WALL_DIR)}`)
}

export function getThemeKindLabel(state: ThemeState) {
  switch (state.kind) {
    case "image":
      return "Image"
    case "video":
      return "Video"
    default:
      return "Unknown"
  }
}

export function getWallpaperEntryKindLabel(entry: WallpaperEntry) {
  switch (entry.kind) {
    case "image":
      return "Image"
    case "video":
      return "Video"
    default:
      return "Unknown"
  }
}

export function getThemeStatusLabel(state: ThemeState) {
  switch (state.status) {
    case "ready":
      return "Ready"
    case "missing":
      return "Setup incomplete"
    case "empty":
      return "No wallpaper cache"
  }
}
