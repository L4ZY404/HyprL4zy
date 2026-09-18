import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { commandExists, shellQuote, spawn } from "../lib/shell"

export type DesktopApplication = {
  id: string
  name: string
  comment: string
  icon: string
  exec: string
  desktopFile: string
  categories: string
}
const nativeApps = new Map<string, Gio.AppInfo>()
let cachedApps: DesktopApplication[] | null = null
let appsPromise: Promise<DesktopApplication[]> | null = null
let monitor: Gio.AppInfoMonitor | null = null
let lastRead = 0
function ensureMonitor() {
  if (monitor) return
  monitor = Gio.AppInfoMonitor.get()
  monitor.connect("changed", () => { cachedApps = null })
}
export function readDesktopApps(force = false): Promise<DesktopApplication[]> {
  ensureMonitor()
  if (appsPromise) return appsPromise
  if (!force && cachedApps && Date.now() - lastRead < 45000) return Promise.resolve(cachedApps)
  appsPromise = new Promise<DesktopApplication[]>(resolve => {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      const result: DesktopApplication[] = []
      const seen = new Set<string>()
      nativeApps.clear()
      for (const info of Gio.AppInfo.get_all()) {
        if (!info.should_show()) continue
        const id = info.get_id() || info.get_executable()
        if (!id || seen.has(id)) continue
        seen.add(id); nativeApps.set(id, info)
        const desktop = info as any
        const icon = info.get_icon()
        const iconName = icon instanceof Gio.ThemedIcon ? icon.get_names()[0]
          : icon instanceof Gio.FileIcon ? icon.get_file().get_path() : "application-x-executable"
        result.push({ id, name: info.get_display_name(), comment: info.get_description() || "Application",
          icon: iconName || "application-x-executable", exec: info.get_commandline() || "",
          desktopFile: desktop.get_filename?.() || "", categories: desktop.get_categories?.() || "" })
      }
      result.sort((left, right) => left.name.localeCompare(right.name))
      cachedApps = result; lastRead = Date.now(); resolve(result)
      return GLib.SOURCE_REMOVE
    })
  }).finally(() => { appsPromise = null })
  return appsPromise
}
export function filterDesktopApps(apps: DesktopApplication[], query: string) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  return apps.filter(item => {
    const haystack = `${item.name} ${item.comment} ${item.categories} ${item.id}`.toLocaleLowerCase()
    return words.every(word => haystack.includes(word))
  }).slice(0, 120)
}

function normalizeAppIdentity(value = "") {
  return value
    .toLocaleLowerCase()
    .replace(/\.desktop$/i, "")
    .replace(/^.*[\/]/, "")
    .replace(/[^a-z0-9]+/g, "")
}

function executableIdentity(command = "") {
  const first = command.trim().split(/\s+/)[0] ?? ""
  return normalizeAppIdentity(first)
}

/** Resolve a Hyprland window class to the closest desktop entry.
 * Exact desktop-id / executable matches win; fuzzy matching is only used as a
 * fallback for applications whose Wayland class differs slightly from the
 * .desktop id.
 */
export function matchDesktopApp(
  apps: DesktopApplication[],
  ...candidates: Array<string | null | undefined>
): DesktopApplication | null {
  const wanted = [...new Set(candidates.map(value => normalizeAppIdentity(value ?? "")).filter(Boolean))]
  if (!wanted.length) return null

  let best: DesktopApplication | null = null
  let bestScore = 0

  for (const app of apps) {
    const identities = [
      normalizeAppIdentity(app.id),
      normalizeAppIdentity(app.name),
      normalizeAppIdentity(app.desktopFile),
      executableIdentity(app.exec),
    ].filter(Boolean)

    for (const candidate of wanted) {
      for (const identity of identities) {
        let score = 0
        if (candidate === identity) score = 100
        else if (candidate.length >= 4 && identity.length >= 4 && (candidate.endsWith(identity) || identity.endsWith(candidate))) score = 82
        else if (candidate.length >= 5 && identity.length >= 5 && (candidate.includes(identity) || identity.includes(candidate))) score = 64
        if (score > bestScore) {
          best = app
          bestScore = score
        }
      }
    }
  }

  return best
}

export function launchDesktopApp(app: DesktopApplication) {
  try {
    const info = nativeApps.get(app.id)
    if (info) { info.launch([], null); return }
  } catch (error) { console.error("Application launch:", error) }
  if (commandExists("gtk-launch")) spawn(`gtk-launch ${shellQuote(app.id)}`)
}
