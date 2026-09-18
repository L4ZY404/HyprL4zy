import { onCleanup, timeout, idle } from "../../lib/lifecycle"
import { monitorForSlot } from "../../services/monitors"
import { preferences } from "../../services/preferences"
import { loadBarSettings } from "../../services/barSettings"
import { matchDesktopApp, readDesktopApps, type DesktopApplication } from "../../services/apps"
import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

import {
  focusWorkspace,
  readHyprlandState,
  watchHyprlandWorkspaceEvents,
  type HyprClient,
  type HyprMonitor,
} from "../../services/hyprland"

const WORKSPACES = Array.from({ length: preferences.workspaceCount }, (_, i) => i + 1)
const WORKSPACE_IDS = new Set(WORKSPACES)

const REFRESH_BURST_DELAYS = [90, 900]
const OPTIMISTIC_TIMEOUT = 1200
const EVENT_REFRESH_DELAY = 30
const WORKSPACE_REVEAL_DURATION = 150
const ICON_REVEAL_DURATION = 115
const ICON_STAGGER_DELAY = 18
const MONITOR_ICON = "video-display-symbolic"
const FALLBACK_APP_ICON = "application-x-executable"

type WorkspaceState = "active" | "visible" | "occupied"

type WorkspaceApp = {
  key: string
  name: string
  icon: string
}

type WorkspaceIconItem = {
  key: string
  name: string
  icon: string
  image: Gtk.Image
  revealer: Gtk.Revealer
}

type WorkspaceItem = {
  id: number
  revealer: Gtk.Revealer
  button: Gtk.Button
  content: Gtk.Box
  icons: Map<string, WorkspaceIconItem>
  state: WorkspaceState
  visible: boolean
  monitorOnly: boolean
  visibilityToken: number
  signature: string
}

type WorkspacesProps = {
  monitorIndex: number
}

function setImageSource(image: Gtk.Image, icon: string) {
  if (icon.startsWith("/")) image.set_from_file(icon)
  else image.set_from_icon_name(icon || FALLBACK_APP_ICON)
}

function clientIdentity(client: HyprClient) {
  return [client.class, client.initialClass].filter(Boolean).join("|").toLocaleLowerCase()
}

function resolveWorkspaceApps(
  workspaceId: number,
  clients: HyprClient[],
  desktopApps: DesktopApplication[],
  cache: Map<string, DesktopApplication | null>,
) {
  const result: WorkspaceApp[] = []
  const seen = new Set<string>()

  for (const client of clients) {
    if (client.workspace?.id !== workspaceId) continue
    const identity = clientIdentity(client)
    if (!identity) continue

    let app = cache.get(identity)
    if (app === undefined) {
      app = matchDesktopApp(desktopApps, client.class, client.initialClass, client.title, client.initialTitle)
      cache.set(identity, app)
    }

    const key = app?.id || identity
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      key,
      name: app?.name || client.class || client.initialClass || "Application",
      icon: app?.icon || FALLBACK_APP_ICON,
    })
  }

  return result
}

function createWorkspaceItem(id: number, onClick: (id: number) => void, iconSpacing: number): WorkspaceItem {
  // Keep the icon stack inside a real centering container. CSS min-height on a
  // Gtk.Box does not guarantee that a single child is optically centered in
  // the extra allocation; Gtk.CenterBox does. This is especially visible when
  // a workspace contains only the monitor indicator.
  const content = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["workspace-pill-content"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    spacing: iconSpacing,
  })
  const pill = new Gtk.CenterBox({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["workspace-pill"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })
  pill.set_center_widget(content)

  const button = new Gtk.Button({
    css_classes: ["workspace-button", "workspace-occupied"],
    focusable: false,
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })
  button.set_child(pill)
  button.connect("clicked", () => onClick(id))

  // Keep every workspace allocated through a native revealer. Empty workspaces
  // collapse to zero, while appearing/disappearing pills smoothly reflow the
  // island instead of popping the remaining workspaces into place.
  const revealer = new Gtk.Revealer({
    reveal_child: false,
    transition_duration: WORKSPACE_REVEAL_DURATION,
    transition_type: Gtk.RevealerTransitionType.SLIDE_DOWN,
    css_classes: ["workspace-revealer"],
    halign: Gtk.Align.CENTER,
  })
  revealer.set_child(button)
  revealer.set_visible(false)

  return {
    id,
    revealer,
    button,
    content,
    icons: new Map<string, WorkspaceIconItem>(),
    state: "occupied",
    visible: false,
    monitorOnly: false,
    visibilityToken: 0,
    signature: "",
  }
}

function createAnimatedIcon(key: string, name: string, icon: string, iconSize: number, className: string): WorkspaceIconItem {
  const image = new Gtk.Image({ css_classes: [className] })
  setImageSource(image, icon)
  image.set_pixel_size(iconSize)
  image.set_halign(Gtk.Align.CENTER)
  image.set_valign(Gtk.Align.CENTER)

  const revealer = new Gtk.Revealer({
    reveal_child: false,
    transition_duration: ICON_REVEAL_DURATION,
    transition_type: Gtk.RevealerTransitionType.SLIDE_DOWN,
    css_classes: ["workspace-icon-revealer"],
    halign: Gtk.Align.CENTER,
  })
  revealer.set_child(image)

  return { key, name, icon, image, revealer }
}

export default function Workspaces({ monitorIndex }: WorkspacesProps) {
  let targetMonitorName = monitorForSlot(monitorIndex)?.get_connector?.() || ""
  let disposed = false
  let refreshing = false
  let refreshQueued = false
  let eventRefreshQueued = false
  let optimisticActiveId: number | null = null
  let optimisticUntil = 0
  let lastDesktopCatalog: DesktopApplication[] | null = null
  const appMatchCache = new Map<string, DesktopApplication | null>()

  const settings = loadBarSettings(monitorIndex)
  const workspaceSpacing = Math.max(2, Math.round(settings.global.scaleMd * 0.32))
  // Keep workspace app/monitor glyphs close to 70% of the pill width.
  // The pill itself remains content-driven, so additional icons extend it vertically.
  const iconSize = Math.max(18, Math.round(settings.global.scaleMd * 1.45))
  const iconSpacing = Math.max(2, Math.round(settings.global.scaleMd * 0.22))

  const container = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["workspaces"],
    spacing: workspaceSpacing,
    halign: Gtk.Align.CENTER,
  })

  function scheduleRefreshBurst() {
    for (const delay of REFRESH_BURST_DELAYS) {
      timeout(GLib.PRIORITY_DEFAULT, delay, () => {
        void refresh()
        return GLib.SOURCE_REMOVE
      })
    }
  }

  function requestEventRefresh() {
    if (eventRefreshQueued) return
    eventRefreshQueued = true
    timeout(GLib.PRIORITY_DEFAULT, EVENT_REFRESH_DELAY, () => {
      eventRefreshQueued = false
      void refresh()
      return GLib.SOURCE_REMOVE
    })
  }

  function updateButtonClasses(item: WorkspaceItem) {
    item.button.set_css_classes([
      "workspace-button",
      `workspace-${item.state}`,
      ...(item.monitorOnly ? ["monitor-only"] : []),
    ])
  }

  function setState(item: WorkspaceItem, state: WorkspaceState) {
    if (item.state === state) return
    item.state = state
    updateButtonClasses(item)
  }

  function setMonitorOnly(item: WorkspaceItem, monitorOnly: boolean) {
    if (item.monitorOnly === monitorOnly) return
    item.monitorOnly = monitorOnly
    updateButtonClasses(item)
  }

  function setWorkspaceVisible(item: WorkspaceItem, visible: boolean) {
    if (item.visible === visible) return
    item.visible = visible
    item.visibilityToken += 1
    const token = item.visibilityToken

    if (visible) {
      // Gtk.Box spacing is applied between visible Revealer widgets even when a
      // revealer has collapsed its child. Make the wrapper visible only for the
      // reveal itself so hidden workspaces leave no dead gap at all.
      item.revealer.set_visible(true)
      item.revealer.set_reveal_child(true)
      return
    }

    item.revealer.set_reveal_child(false)
    timeout(GLib.PRIORITY_DEFAULT, WORKSPACE_REVEAL_DURATION + 18, () => {
      if (!item.visible && item.visibilityToken === token) item.revealer.set_visible(false)
      return GLib.SOURCE_REMOVE
    })
  }

  function syncIcons(item: WorkspaceItem, apps: WorkspaceApp[], hasMonitor: boolean) {
    const desired = [
      ...apps.map(app => ({
        key: `app:${app.key}`,
        name: app.name,
        icon: app.icon,
        className: "workspace-app-icon",
      })),
      ...(hasMonitor ? [{
        key: "monitor",
        name: "Monitor",
        icon: MONITOR_ICON,
        className: "workspace-monitor-icon",
      }] : []),
    ]
    const desiredKeys = new Set(desired.map(entry => entry.key))

    // Collapse removed icons before detaching them. The surrounding pill then
    // shrinks with the same native GTK geometry animation.
    for (const [key, entry] of item.icons) {
      if (desiredKeys.has(key)) continue
      entry.revealer.set_reveal_child(false)
      timeout(GLib.PRIORITY_DEFAULT, ICON_REVEAL_DURATION + 16, () => {
        const current = item.icons.get(key)
        if (current === entry && !entry.revealer.get_reveal_child()) {
          item.content.remove(entry.revealer)
          item.icons.delete(key)
        }
        return GLib.SOURCE_REMOVE
      })
    }

    let previous: Gtk.Widget | null = null
    desired.forEach((next, index) => {
      let entry = item.icons.get(next.key)
      if (!entry) {
        entry = createAnimatedIcon(next.key, next.name, next.icon, iconSize, next.className)
        item.icons.set(next.key, entry)
        item.content.append(entry.revealer)
        const created = entry
        timeout(GLib.PRIORITY_DEFAULT, 16 + index * ICON_STAGGER_DELAY, () => {
          if (item.icons.get(next.key) === created) created.revealer.set_reveal_child(true)
          return GLib.SOURCE_REMOVE
        })
      } else {
        if (entry.icon !== next.icon) {
          entry.icon = next.icon
          setImageSource(entry.image, next.icon)
        }
        entry.name = next.name
        entry.revealer.set_reveal_child(true)
      }

      // Preserve app order and keep the monitor indicator last without
      // rebuilding the whole pill on every Hyprland event.
      const box = item.content as any
      if (typeof box.reorder_child_after === "function") box.reorder_child_after(entry.revealer, previous)
      previous = entry.revealer
    })
  }

  function renderWorkspace(
    item: WorkspaceItem,
    state: WorkspaceState,
    apps: WorkspaceApp[],
    hasMonitor: boolean,
    occupiedFallback: boolean,
  ) {
    const shownApps = apps.length ? apps : occupiedFallback ? [{ key: "fallback", name: "Application", icon: FALLBACK_APP_ICON }] : []
    const visible = hasMonitor || shownApps.length > 0

    setState(item, state)
    setMonitorOnly(item, hasMonitor && shownApps.length === 0)
    const signature = `${hasMonitor ? "monitor" : ""}|${shownApps.map(app => `${app.key}:${app.icon}`).join(",")}`
    if (item.signature !== signature) {
      item.signature = signature
      syncIcons(item, shownApps, hasMonitor)
    }

    const parts = [`Workspace ${item.id}`]
    if (hasMonitor) parts.push("visible on a monitor")
    if (shownApps.length) parts.push(shownApps.map(app => app.name).join(", "))
    item.button.set_tooltip_text(parts.join(" • "))

    // Reveal only after content/state are ready so the pill enters fully
    // painted. Hiding uses the same revealer, giving the remaining pills a
    // smooth native reflow.
    setWorkspaceVisible(item, visible)
  }

  const items = WORKSPACES.map((id) => createWorkspaceItem(id, handleWorkspaceClick, iconSpacing))
  for (const item of items) container.append(item.revealer)

  function handleWorkspaceClick(id: number) {
    optimisticActiveId = id
    optimisticUntil = Date.now() + OPTIMISTIC_TIMEOUT
    const item = items.find(candidate => candidate.id === id)
    if (item) setState(item, "active")
    focusWorkspace(id, targetMonitorName)
    scheduleRefreshBurst()
  }

  async function refresh() {
    if (disposed) return
    if (refreshing) {
      refreshQueued = true
      return
    }

    refreshing = true
    try {
      const [hyprland, desktopApps] = await Promise.all([readHyprlandState(), readDesktopApps()])
      if (disposed) return

      if (desktopApps !== lastDesktopCatalog) {
        lastDesktopCatalog = desktopApps
        appMatchCache.clear()
      }

      const { monitors, workspaces, clients } = hyprland
      const currentMonitor =
        monitors.find((monitor) => monitor.name === targetMonitorName) ??
        (!targetMonitorName ? monitors.find((monitor: HyprMonitor) => monitor.focused) : undefined)

      targetMonitorName = currentMonitor?.name ?? targetMonitorName
      const realActiveId = currentMonitor?.activeWorkspace?.id ?? -1
      const visibleIds = new Set(
        monitors
          .map(monitor => monitor.activeWorkspace?.id)
          .filter((id): id is number => typeof id === "number" && WORKSPACE_IDS.has(id)),
      )
      const occupiedIds = new Set(
        workspaces
          .filter(workspace => WORKSPACE_IDS.has(workspace.id) && (workspace.windows ?? 0) > 0)
          .map(workspace => workspace.id),
      )

      let activeId = realActiveId
      if (optimisticActiveId !== null) {
        const reached = realActiveId === optimisticActiveId
        const expired = Date.now() >= optimisticUntil
        if (reached || expired) {
          optimisticActiveId = null
          optimisticUntil = 0
        } else {
          activeId = optimisticActiveId
        }
      }

      for (const item of items) {
        const hasMonitor = visibleIds.has(item.id)
        const apps = resolveWorkspaceApps(item.id, clients, desktopApps, appMatchCache)
        const state: WorkspaceState = item.id === activeId ? "active" : hasMonitor ? "visible" : "occupied"
        renderWorkspace(item, state, apps, hasMonitor, occupiedIds.has(item.id))
      }
    } finally {
      refreshing = false
      if (refreshQueued) {
        refreshQueued = false
        idle(GLib.PRIORITY_DEFAULT_IDLE, () => {
          void refresh()
          return GLib.SOURCE_REMOVE
        })
      }
    }
  }

  idle(GLib.PRIORITY_DEFAULT_IDLE, () => {
    void refresh()
    return GLib.SOURCE_REMOVE
  })

  onCleanup(() => { disposed = true })
  onCleanup(watchHyprlandWorkspaceEvents(requestEventRefresh))

  return container
}
