import GLib from "gi://GLib?version=2.0"

import { commandExists, execAsync, shellQuote, spawn } from "../lib/shell"

const COVER_CACHE_PREFIX = "/tmp/ags_music_cover"
const PLAYER_REFRESH_THROTTLE_MS = 350

export type PlayerStatus = "Playing" | "Paused" | "Stopped"

export type PlayerState = {
  available: boolean
  player: string
  status: PlayerStatus
  title: string
  artist: string
  album: string
  artUrl: string
  artPath: string
}

export const EMPTY_PLAYER: PlayerState = {
  available: false,
  player: "",
  status: "Stopped",
  title: "No media",
  artist: "No active player",
  album: "",
  artUrl: "",
  artPath: "",
}

let cachedPlayerState: PlayerState = EMPTY_PLAYER
let playerRefreshPromise: Promise<PlayerState> | null = null
let lastPlayerRefreshMs = 0

function fileExists(path: string) {
  return GLib.file_test(path, GLib.FileTest.EXISTS)
}

async function shAsync(command: string) {
  return execAsync(["bash", "-c", command])
}

function simpleHash(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }

  return hash.toString(16)
}

function decodeFileUrl(url: string) {
  try {
    return decodeURIComponent(url.replace(/^file:\/\//, ""))
  } catch {
    return url.replace(/^file:\/\//, "")
  }
}

function getCachedRemoteCoverPath(url: string) {
  const cachePath = `${COVER_CACHE_PREFIX}_${simpleHash(url)}.img`

  if (fileExists(cachePath)) {
    return cachePath
  }

  const tmpPath = `${cachePath}.tmp`

  if (commandExists("curl")) {
    spawn(
      `sh -c ${shellQuote(
        `curl -L --silent --fail --max-time 5 --output ${shellQuote(
          tmpPath,
        )} ${shellQuote(url)} && mv ${shellQuote(tmpPath)} ${shellQuote(cachePath)}`,
      )}`,
    )
  } else if (commandExists("wget")) {
    spawn(
      `sh -c ${shellQuote(
        `wget -q -T 5 -O ${shellQuote(tmpPath)} ${shellQuote(url)} && mv ${shellQuote(
          tmpPath,
        )} ${shellQuote(cachePath)}`,
      )}`,
    )
  }

  return ""
}

function resolveArtPath(artUrl: string) {
  if (!artUrl) {
    return ""
  }

  if (artUrl.startsWith("file://")) {
    const path = decodeFileUrl(artUrl)

    return fileExists(path) ? path : ""
  }

  if (artUrl.startsWith("/")) {
    return fileExists(artUrl) ? artUrl : ""
  }

  if (artUrl.startsWith("http://") || artUrl.startsWith("https://")) {
    return getCachedRemoteCoverPath(artUrl)
  }

  return ""
}

async function getPlayers() {
  if (!commandExists("playerctl")) {
    return []
  }

  const output = await shAsync("playerctl -l 2>/dev/null")

  return output
    .split("\n")
    .map((player) => player.trim())
    .filter(Boolean)
}

async function getPlayerStatus(player: string): Promise<PlayerStatus> {
  const status = await shAsync(`playerctl -p ${shellQuote(player)} status 2>/dev/null`)

  if (status === "Playing") return "Playing"
  if (status === "Paused") return "Paused"

  return "Stopped"
}

async function pickPlayer() {
  const players = await getPlayers()

  if (players.length === 0) {
    return ""
  }

  if (players.length === 1) {
    return players[0]
  }

  const states = await Promise.all(
    players.map(async (player) => ({
      player,
      status: await getPlayerStatus(player),
    })),
  )

  return (
    states.find((state) => state.status === "Playing")?.player ??
    states.find((state) => state.status === "Paused")?.player ??
    players[0]
  )
}

async function getMetadata(player: string) {
  const separator = "\u001f"
  const output = await shAsync(
    `playerctl -p ${shellQuote(player)} metadata --format '{{title}}${separator}{{artist}}${separator}{{album}}${separator}{{mpris:artUrl}}' 2>/dev/null`,
  )

  const [title = "", artist = "", album = "", artUrl = ""] = output.split(separator)

  return {
    title,
    artist,
    album,
    artUrl,
  }
}

async function readPlayerFromSystem(): Promise<PlayerState> {
  const player = await pickPlayer()

  if (!player) {
    return EMPTY_PLAYER
  }

  const [status, metadata] = await Promise.all([
    getPlayerStatus(player),
    getMetadata(player),
  ])

  return {
    available: true,
    player,
    status,
    title: metadata.title || "Unknown title",
    artist: metadata.artist || "Unknown artist",
    album: metadata.album || "",
    artUrl: metadata.artUrl,
    artPath: resolveArtPath(metadata.artUrl),
  }
}

export function readPlayer(): PlayerState {
  return cachedPlayerState
}

export async function refreshPlayerCache(force = false): Promise<PlayerState> {
  const now = Date.now()

  if (!force && playerRefreshPromise) {
    return playerRefreshPromise
  }

  if (!force && now - lastPlayerRefreshMs < PLAYER_REFRESH_THROTTLE_MS) {
    return cachedPlayerState
  }

  playerRefreshPromise = readPlayerFromSystem()
    .then((state) => {
      cachedPlayerState = state
      lastPlayerRefreshMs = Date.now()
      return state
    })
    .catch((error) => {
      console.error("Player refresh error:", error)
      cachedPlayerState = EMPTY_PLAYER
      lastPlayerRefreshMs = Date.now()
      return cachedPlayerState
    })
    .finally(() => {
      playerRefreshPromise = null
    })

  return playerRefreshPromise
}

export function hasVisibleMusic() {
  const state = readPlayer()

  return (
    state.available &&
    (state.status === "Playing" ||
      state.status === "Paused" ||
      state.title !== "No media")
  )
}

function runPlayerCommand(command: string) {
  if (!commandExists("playerctl")) {
    return
  }

  const playerArg = cachedPlayerState.available
    ? `-p ${shellQuote(cachedPlayerState.player)} `
    : ""

  spawn(`playerctl ${playerArg}${command}`)
  void refreshPlayerCache(true)
}

export function togglePlayPause() {
  runPlayerCommand("play-pause")
}

export function nextTrack() {
  runPlayerCommand("next")
}

export function previousTrack() {
  runPlayerCommand("previous")
}

export function getMusicClass(player: PlayerState) {
  if (!player.available || player.status === "Stopped") return "stopped"
  if (player.status === "Paused") return "paused"

  return "playing"
}

export function getStatusIcon(player: PlayerState) {
  if (!player.available || player.status === "Stopped") return "󰎊"
  if (player.status === "Paused") return ""

  return ""
}

export function getStatusText(player: PlayerState) {
  if (!player.available) return "No player"
  if (player.status === "Playing") return "Playing"
  if (player.status === "Paused") return "Paused"

  return "Stopped"
}
