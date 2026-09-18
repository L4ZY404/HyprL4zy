import GLib from "gi://GLib?version=2.0"

import { commandExists, execAsyncStrict } from "../lib/shell"

export type UpdateSeverity = "green" | "yellow" | "red" | "checking" | "error"
export type UpdateStatus = "idle" | "checking" | "ready" | "error"
export type AurHelper = "paru" | "yay" | "pikaur" | "trizen" | "none"
export type OfficialUpdateBackend = "checkupdates" | "pacman-cache" | "none"

export type UpdatesState = {
  total: number
  official: number
  aur: number
  severity: UpdateSeverity
  status: UpdateStatus
  helper: AurHelper
  officialBackend: OfficialUpdateBackend
  officialWarning: string
  aurWarning: string
  tooltip: string
  error: string
  lastChecked: number
  lastCheckedLabel: string
  officialPackages: string[]
  aurPackages: string[]
}

export const EMPTY_UPDATES: UpdatesState = {
  total: 0,
  official: 0,
  aur: 0,
  severity: "green",
  status: "idle",
  helper: "none",
  officialBackend: "none",
  officialWarning: "",
  aurWarning: "",
  tooltip: "System is up to date",
  error: "",
  lastChecked: 0,
  lastCheckedLabel: "Never",
  officialPackages: [],
  aurPackages: [],
}

const WARNING_THRESHOLD = 10
const CRITICAL_THRESHOLD = 30
const REFRESH_THROTTLE_MS = 30000

let cachedUpdatesState: UpdatesState = EMPTY_UPDATES
let updatesRefreshPromise: Promise<UpdatesState> | null = null
let lastRefreshRequestMs = 0
let autoRefreshStarted = false

type UpdatesListener = (state: UpdatesState) => void
const updatesListeners = new Set<UpdatesListener>()

function notifyUpdatesListeners() {
  for (const listener of updatesListeners) {
    try {
      listener(cachedUpdatesState)
    } catch (error) {
      console.error("Updates listener error:", error)
    }
  }
}

function updateLines(output: string) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function formatTime(timestamp: number) {
  if (timestamp <= 0) return "Never"

  const dateTime = GLib.DateTime.new_from_unix_local(Math.floor(timestamp / 1000))
  const formatted = dateTime?.format("%H:%M")

  return formatted ?? "Unknown"
}

function getSeverity(total: number): UpdateSeverity {
  if (total >= CRITICAL_THRESHOLD) return "red"
  if (total >= WARNING_THRESHOLD) return "yellow"

  return "green"
}

function getAurHelper(): AurHelper {
  if (commandExists("paru")) return "paru"
  if (commandExists("yay")) return "yay"
  if (commandExists("pikaur")) return "pikaur"
  if (commandExists("trizen")) return "trizen"

  return "none"
}

function getAurCheckCommand(helper: AurHelper) {
  switch (helper) {
    case "paru":
    case "yay":
    case "pikaur":
      return `timeout 90 ${helper} -Qua`
    case "trizen":
      return "timeout 90 trizen -Qua"
    case "none":
      return ""
  }
}

async function runPackageList(command: string, emptyExitCodes: number[] = []) {
  const accepted = emptyExitCodes.length ? emptyExitCodes.join(" ") : ""
  const script = `
set +e
output="$(${command} 2>&1)"
status=$?
if [ "$status" -eq 0 ]; then
  printf '%s' "$output"
  exit 0
fi
for accepted in ${accepted || "999"}; do
  if [ "$status" -eq "$accepted" ] && [ -z "$output" ]; then
    exit 0
  fi
done
printf '%s\\n' "$output" >&2
exit "$status"
`
  return updateLines(await execAsyncStrict(["bash", "-c", script]))
}

async function listOfficialUpdates() {
  let checkupdatesWarning = ""

  if (commandExists("checkupdates")) {
    try {
      // checkupdates returns 2 when the isolated sync database has no updates.
      return {
        packages: await runPackageList("timeout 90 checkupdates", [2]),
        backend: "checkupdates" as OfficialUpdateBackend,
        warning: "",
      }
    } catch (error) {
      // A temporary mirror/network/cache failure should not make the whole bar
      // unusable when pacman's already-synced database can still be inspected.
      checkupdatesWarning = String(error || "checkupdates failed")
    }
  }

  if (commandExists("pacman")) {
    // Read-only fallback. Never run pacman -Sy here: doing so without upgrading
    // would create the partial-upgrade state Arch explicitly warns against.
    return {
      packages: await runPackageList("timeout 45 pacman -Qu", [1]),
      backend: "pacman-cache" as OfficialUpdateBackend,
      warning: checkupdatesWarning
        ? "checkupdates unavailable; showing the current pacman sync cache"
        : "pacman-contrib is not installed; showing the current pacman sync cache",
    }
  }

  if (checkupdatesWarning) throw new Error(checkupdatesWarning)
  throw new Error("Neither checkupdates nor pacman is available")
}

async function listAurUpdates(helper: AurHelper) {
  const command = getAurCheckCommand(helper)
  if (!command) return []

  // Several AUR helpers use exit 1 for an empty query. Only an empty stdout/stderr
  // is accepted as that condition; real error text still propagates as a warning.
  return runPackageList(command, [1])
}

function createReadyState(
  officialPackages: string[],
  aurPackages: string[],
  helper: AurHelper,
  officialBackend: OfficialUpdateBackend,
  officialWarning = "",
  aurWarning = "",
): UpdatesState {
  const official = officialPackages.length
  const aur = aurPackages.length
  const total = official + aur
  const timestamp = Date.now()
  const severity = getSeverity(total)
  const aurSummary = aurWarning ? "unavailable" : `${aur}`

  return {
    total,
    official,
    aur,
    severity,
    status: "ready",
    helper,
    officialBackend,
    officialWarning,
    aurWarning,
    error: "",
    lastChecked: timestamp,
    lastCheckedLabel: formatTime(timestamp),
    tooltip: `Official: ${official} | AUR: ${aurSummary}`,
    officialPackages,
    aurPackages,
  }
}

function createErrorState(error: unknown): UpdatesState {
  const timestamp = Date.now()
  const message = String(error || "Unknown update check error")

  return {
    ...cachedUpdatesState,
    severity: "error",
    status: "error",
    error: message,
    lastChecked: timestamp,
    lastCheckedLabel: formatTime(timestamp),
    tooltip: message,
  }
}

async function readUpdatesFromSystem() {
  const helper = getAurHelper()
  const [officialResult, aurResult] = await Promise.allSettled([
    listOfficialUpdates(),
    listAurUpdates(helper),
  ])

  // Official repositories are the authoritative baseline on Arch. A failure
  // there remains visible. AUR is optional: its failure must not turn a valid
  // official result into the red "!" state.
  if (officialResult.status === "rejected") throw officialResult.reason

  const officialPackages = officialResult.value.packages
  const officialBackend = officialResult.value.backend
  const officialWarning = officialResult.value.warning
  const aurPackages = aurResult.status === "fulfilled" ? aurResult.value : []
  const aurWarning = aurResult.status === "rejected" ? String(aurResult.reason || "AUR check failed") : ""

  return createReadyState(
    officialPackages,
    aurPackages,
    helper,
    officialBackend,
    officialWarning,
    aurWarning,
  )
}

export function readUpdatesState() {
  return cachedUpdatesState
}

export async function refreshUpdates(force = false): Promise<UpdatesState> {
  const now = Date.now()

  if (updatesRefreshPromise) {
    return updatesRefreshPromise
  }

  if (!force && now - lastRefreshRequestMs < REFRESH_THROTTLE_MS) {
    return cachedUpdatesState
  }

  lastRefreshRequestMs = now
  cachedUpdatesState = {
    ...cachedUpdatesState,
    severity: "checking",
    status: "checking",
    error: "",
    tooltip: "Checking for updates...",
  }
  notifyUpdatesListeners()

  updatesRefreshPromise = readUpdatesFromSystem()
    .then((state) => {
      cachedUpdatesState = state
      notifyUpdatesListeners()
      return state
    })
    .catch((error) => {
      console.error("Updates refresh error:", error)
      cachedUpdatesState = createErrorState(error)
      notifyUpdatesListeners()
      return cachedUpdatesState
    })
    .finally(() => {
      updatesRefreshPromise = null
    })

  return updatesRefreshPromise
}

export async function readUpdates(): Promise<UpdatesState> {
  return refreshUpdates()
}

export function subscribeUpdates(listener: UpdatesListener) {
  updatesListeners.add(listener)
  listener(cachedUpdatesState)

  return () => {
    updatesListeners.delete(listener)
  }
}

export function startUpdatesAutoRefresh() {
  if (autoRefreshStarted) return

  autoRefreshStarted = true

  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 9000, () => {
    void refreshUpdates(true)
    return GLib.SOURCE_REMOVE
  })

  GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60 * 60 * 1000, () => {
    void refreshUpdates()
    return GLib.SOURCE_CONTINUE
  })
}

export function getUpdateHelperLabel(helper: AurHelper) {
  return helper === "none" ? "None" : helper
}

export function getOfficialBackendLabel(backend: OfficialUpdateBackend) {
  if (backend === "checkupdates") return "checkupdates"
  if (backend === "pacman-cache") return "pacman cache"
  return "Unavailable"
}
