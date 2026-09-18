import { onCleanup, scopeCallback } from "../../lib/lifecycle"
import { connectedMonitorProfiles, monitorBounds, monitorProfile } from "../../services/monitors"
import { timeout, idle } from "../../lib/lifecycle"
import app from "ags/gtk4/app"
import { Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"

import {
  DEFAULT_BAR_SETTINGS,
  generateBarSettingsScss,
  generateBarHeightFitScss,
  getMonitorSettingsKey,
  MODULE_SLOTS,
  type BarModuleId,
  type BarSettings,
  type LayoutIsland,
  type ModuleSlot,
  loadBarSettings,
  resetBarSettings,
  restartAgs,
  saveBarSettings,
} from "../../services/barSettings"

/* =============================================================================
 * Types
 * ============================================================================= */

type BarSettingsProps = {
  embedded?: boolean
  monitorIndex?: number
  monitorHeight?: number
  launcherIcon?: string
  launcherLabel?: string
  launcherCssClasses?: string[]
  onOpen?: () => void
  showSizePanel?: boolean
  showMonitorPicker?: boolean
  applyOnly?: boolean
  getViewportScrollValue?: () => number
  restoreViewportScrollValue?: (value: number) => void
}

type BarSettingsController = {
  toggle: () => string
  show: () => string
  hide: () => string
}

const barSettingsControllers = new Map<number, BarSettingsController>()
function currentSettings() { return barSettingsControllers.get(0) ?? barSettingsControllers.values().next().value }

export function toggleBarSettings() {
  return currentSettings()?.toggle() ?? "Bar Settings is not ready"
}

export function showBarSettings() {
  return currentSettings()?.show() ?? "Bar Settings is not ready"
}

export function hideBarSettings() {
  return currentSettings()?.hide() ?? "Bar Settings is not ready"
}

export function handleBarSettingsRequest(action = "toggle") {
  switch (action) {
    case "open":
    case "show":
      return showBarSettings()
    case "close":
    case "hide":
      return hideBarSettings()
    case "toggle":
    default:
      return toggleBarSettings()
  }
}

type ModuleInfo = {
  id: BarModuleId
  label: string
  icon: string
}

type SelectedItem =
  | { kind: "island"; islandId: string }
  | { kind: "module"; moduleId: BarModuleId }
  | { kind: "newIsland" }
  | null

type DragPayload =
  | { kind: "module"; moduleId: BarModuleId }
  | { kind: "island"; islandId: string }
  | { kind: "newIsland" }

const DRAG_PAYLOAD_PREFIX = "ags-studio-bar:"

// GTK4 may emit drag-end after the drop target callback returns. Rebuilding the
// editor tree before the source controller has fully ended can invalidate the
// active DnD hierarchy and stall pointer input. Keep one pending internal drop
// transaction and commit it only after drag-end, on the next idle turn.
let dragSessionActive = false
let activeDragPayload: DragPayload | null = null
let pendingDropCommit: (() => void) | null = null
let pendingDropSource = 0
let suppressSelectionClickUntil = 0

function shouldSuppressSelectionClick() {
  return Date.now() < suppressSelectionClickUntil
}

function cancelPendingDropSource() {
  if (!pendingDropSource) return
  GLib.source_remove(pendingDropSource)
  pendingDropSource = 0
}

function schedulePendingDropCommit() {
  if (dragSessionActive || !pendingDropCommit || pendingDropSource) return

  pendingDropSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
    pendingDropSource = 0
    if (dragSessionActive || !pendingDropCommit) return GLib.SOURCE_REMOVE

    const commit = pendingDropCommit
    pendingDropCommit = null
    try {
      commit()
    } catch (_error) {
      // A stale payload must never leave the editor in a blocked DnD state.
    }
    return GLib.SOURCE_REMOVE
  })
}

function queueDropCommit(commit: () => void) {
  pendingDropCommit = commit
  schedulePendingDropCommit()
}

function settingsSnapshot(settings: BarSettings) {
  return JSON.stringify(settings)
}

type EditorContext = {
  settings: BarSettings
  selected: SelectedItem
  hoveredTargetId: string | null
  monitorIndex: number
  setSelected: (selected: SelectedItem) => void
  setHoveredTarget: (targetId: string | null) => void
  render: () => void
  markChanged: () => void
  isUserScrolling: () => boolean
  captureDropScroll: () => void
  naturalLayout?: boolean
}

/* =============================================================================
 * Constants
 * ============================================================================= */

const APP_MENU_ICON = ""

const BAR_WIDTH_STEP = 0.05
const SCALE_PERCENT_STEP = 5
const ICON_PERCENT_STEP = 5
const FONT_PERCENT_STEP = 5
const DIAL_PERCENT_STEP = 5
const VERTICAL_MARGIN_STEP = 0.05

const MIN_BAR_WIDTH = 2.2
const MAX_BAR_WIDTH = 5

const MIN_VERTICAL_MARGIN = 0
const MAX_VERTICAL_MARGIN = 4

const MIN_SCALE_PERCENT = 70
const MAX_SCALE_PERCENT = 240
const MIN_ICON_PERCENT = 60
const MAX_ICON_PERCENT = 180
const MIN_FONT_PERCENT = 60
const MAX_FONT_PERCENT = 180
const MIN_DIAL_PERCENT = 60
const MAX_DIAL_PERCENT = 180

const MODULE_INFO: readonly ModuleInfo[] = [
  { id: "workspaces", label: "Workspaces", icon: "󰖲" },
  { id: "tray", label: "Tray", icon: "󰀻" },
  { id: "music", label: "Music", icon: "" },
  { id: "updates", label: "Updates", icon: "󰚰" },
  { id: "network", label: "Wi-Fi", icon: "󰤨" },
  { id: "bluetooth", label: "Bluetooth", icon: "" },
  { id: "clipboard", label: "Clipboard", icon: "" },
  { id: "idleInhibitor", label: "Idle", icon: "󰅶" },
  { id: "volume", label: "Volume", icon: " " },
  { id: "capture", label: "Capture", icon: "󰄀" },
  { id: "powerProfile", label: "Profile", icon: "󰾅" },
  { id: "notifications", label: "Notify", icon: "󰂚" },
  { id: "temperature", label: "Temp", icon: "" },
  { id: "cpu", label: "CPU", icon: "" },
  { id: "memory", label: "RAM", icon: "" },
  { id: "disk", label: "Disk", icon: "󰋊" },
  { id: "brightness", label: "Bright", icon: "󰃠" },
  { id: "battery", label: "Battery", icon: "󰁹" },
  { id: "weather", label: "Weather", icon: "" },
  { id: "clock", label: "Clock", icon: "" },
]


const FIXED_MODULE_IDS: readonly BarModuleId[] = ["powerMenu"]

function isFixedModuleId(moduleId: BarModuleId) {
  return FIXED_MODULE_IDS.includes(moduleId)
}

function getEditableIslandModules(island: LayoutIsland) {
  return island.modules.filter((moduleId) => !isFixedModuleId(moduleId))
}

const RUNTIME_CSS_PRIORITY = ((Gtk as any).STYLE_PROVIDER_PRIORITY_APPLICATION ?? 600) + 120

let runtimeCssProvider: Gtk.CssProvider | null = null
const runtimeCssTokens = new Map<number, number>()
const runtimeCssByMonitor = new Map<number, string>()

function ensureRuntimeCssProvider() {
  const display = Gdk.Display.get_default()

  if (!display) {
    return null
  }

  if (!runtimeCssProvider) {
    runtimeCssProvider = new Gtk.CssProvider()
    Gtk.StyleContext.add_provider_for_display(
      display,
      runtimeCssProvider,
      RUNTIME_CSS_PRIORITY,
    )
  }

  return runtimeCssProvider
}

function loadCssData(provider: Gtk.CssProvider, css: string) {
  const runtimeProvider = provider as any

  try {
    if (typeof runtimeProvider.load_from_string === "function") {
      runtimeProvider.load_from_string(css)
    } else {
      runtimeProvider.load_from_data(css, -1)
    }
    return true
  } catch (error) {
    console.error("Failed to load runtime CSS:", error)
    return false
  }
}

function queueLiveSettingsCss(settings: BarSettings, monitorIndex: number) {
  const token = (runtimeCssTokens.get(monitorIndex) ?? 0) + 1
  runtimeCssTokens.set(monitorIndex, token)

  idle(GLib.PRIORITY_DEFAULT_IDLE, () => {
    if (token !== runtimeCssTokens.get(monitorIndex)) {
      return GLib.SOURCE_REMOVE
    }

    const provider = ensureRuntimeCssProvider()

    if (provider) {
      const monitorKey = getMonitorSettingsKey(monitorIndex)
      const bounds = monitorBounds(monitorIndex)
      const css = `${generateBarSettingsScss(settings, monitorKey)}${generateBarHeightFitScss(settings, monitorKey, bounds.height)}`

      // Keep one cached fragment per monitor. This avoids reloading identical CSS
      // and prevents a preview update on one display from replacing another.
      if (runtimeCssByMonitor.get(monitorIndex) !== css) {
        runtimeCssByMonitor.set(monitorIndex, css)
        loadCssData(provider, [...runtimeCssByMonitor.values()].join("\n"))
      }
    }

    return GLib.SOURCE_REMOVE
  })
}

const EDITOR_TEXT_CSS_PRIORITY = RUNTIME_CSS_PRIORITY + 10

let editorTextCssProvider: Gtk.CssProvider | null = null
const editorTextCssTokens = new Map<number, number>()
const editorTextCssByMonitor = new Map<number, string>()

function ensureEditorTextCssProvider() {
  const display = Gdk.Display.get_default()

  if (!display) {
    return null
  }

  if (!editorTextCssProvider) {
    editorTextCssProvider = new Gtk.CssProvider()
    Gtk.StyleContext.add_provider_for_display(
      display,
      editorTextCssProvider,
      EDITOR_TEXT_CSS_PRIORITY,
    )
  }

  return editorTextCssProvider
}

function getEditorTextScale(settings: BarSettings) {
  return clamp(getScalePercent(settings) / 100, 0.75, 1.6)
}

function scaledEditorFont(settings: BarSettings, baseEm: number) {
  return `${Number((baseEm * getEditorTextScale(settings)).toFixed(3))}em`
}

function cssEm(value: number) {
  return `${formatNumber(value)}em`
}

function buildSizePreviewCss(settings: BarSettings, root: string) {
  const shellWidth = Math.max(settings.global.barWidth, settings.appMenu.islandWidth)
  const shellHeight = Math.max(
    settings.appMenu.buttonHeight +
      settings.appMenu.islandPadding.top +
      settings.appMenu.islandPadding.bottom,
    1.3,
  )
  const buttonWidth = Math.max(settings.appMenu.buttonWidth, 1.1)
  const buttonHeight = Math.max(settings.appMenu.buttonHeight, 1.1)
  const iconSize = Math.max(settings.appMenu.iconSize, 0.58)
  const iconNudge = 0.12
  const shellRadius = 1
  const buttonRadius = Math.max(settings.appMenu.buttonRadius, 0.42)
  const edgeHeight = 0.14
  const topGap = clamp(settings.global.edgeBarPadding.top, 0, 4)
  const bottomGap = clamp(settings.global.edgeBarPadding.bottom, 0, 4)

  return `
${root} .flow-editor-scale-preview { min-width: ${cssEm(shellWidth)}; }
${root} .flow-editor-scale-preview-shell { min-width: ${cssEm(shellWidth)}; min-height: ${cssEm(shellHeight)}; border-radius: 0 ${cssEm(shellRadius)} ${cssEm(shellRadius)} 0; }
${root} .flow-editor-scale-preview-icon-wrap { min-width: ${cssEm(buttonWidth)}; min-height: ${cssEm(buttonHeight)}; border-radius: 0 ${cssEm(buttonRadius)} ${cssEm(buttonRadius)} 0; }
${root} .flow-editor-scale-preview-icon { min-width: ${cssEm(buttonWidth)}; min-height: ${cssEm(buttonHeight)}; font-size: ${cssEm(iconSize)}; margin-top: ${cssEm(iconNudge)}; }
${root} .flow-editor-scale-preview-edge { min-width: ${cssEm(shellWidth)}; min-height: ${cssEm(edgeHeight)}; }
${root} .flow-editor-scale-preview-gap.top { min-width: ${cssEm(shellWidth)}; min-height: ${cssEm(topGap)}; }
${root} .flow-editor-scale-preview-gap.bottom { min-width: ${cssEm(shellWidth)}; min-height: ${cssEm(bottomGap)}; }
  `.trim()
}

function buildEditorTextCss(settings: BarSettings, monitorIndex: number, embedded = false) {
  const root = `.bar-settings-window.bar-settings-monitor-${monitorIndex}`
  const bounds = monitorBounds(monitorIndex)
  const fitted = Math.min(getEditorTextScale(settings), (bounds.width - 64) / 980, (bounds.height - 64) / 740)
  const scale = Number(Math.max(embedded ? 0.96 : 0.78, fitted).toFixed(3))

  return `
${buildSizePreviewCss(settings, root)}
${root} { font-size: ${scale}em; }
${root} .bar-settings-header-icon { font-size: 1.15em; }
${root} .bar-settings-header-title { font-size: 1.15em; }
${root} .bar-settings-status { font-size: 0.78em; }
${root} .theme-manager-title { font-size: 0.88em; }
${root} .theme-manager-status { font-size: 0.72em; }
${root} .theme-manager-file { font-size: 0.78em; }
${root} .theme-manager-meta { font-size: 0.72em; }
${root} .theme-manager-action label { font-size: 0.74em; }
${root} .theme-wallpaper-browser-title { font-size: 0.76em; }
${root} .theme-wallpaper-entry-name { font-size: 0.66em; }
${root} .theme-wallpaper-entry-kind { font-size: 0.6em; }
${root} .flow-editor-size-label { font-size: 0.78em; }
${root} .flow-editor-size-value { font-size: 0.78em; }
${root} .flow-editor-column-title { font-size: 0.88em; }
${root} .flow-editor-small-title { font-size: 0.78em; }
${root} .flow-editor-empty-text { font-size: 0.72em; }
${root} .flow-editor-insert-bar label { font-size: 0.68em; }
${root} .flow-editor-island-close .flow-editor-chip-icon,
${root} .flow-editor-island-close .flow-editor-chip-text { font-size: 0.72em; }
${root} .flow-editor-step-button label,
${root} .flow-editor-tool-chip label,
${root} .flow-editor-unused-widget label,
${root} .flow-editor-widget-pick label,
${root} .flow-editor-island-pick label { font-size: 0.78em; }
`.trim()
}

function queueEditorTextCss(settings: BarSettings, monitorIndex: number, embedded = false) {
  const token = (editorTextCssTokens.get(monitorIndex) ?? 0) + 1
  editorTextCssTokens.set(monitorIndex, token)

  idle(GLib.PRIORITY_DEFAULT_IDLE, () => {
    if (token !== editorTextCssTokens.get(monitorIndex)) {
      return GLib.SOURCE_REMOVE
    }

    const provider = ensureEditorTextCssProvider()

    if (provider) {
      const css = buildEditorTextCss(settings, monitorIndex, embedded)
      if (editorTextCssByMonitor.get(monitorIndex) !== css) {
        editorTextCssByMonitor.set(monitorIndex, css)
        loadCssData(provider, [...editorTextCssByMonitor.values()].join("\n"))
      }
    }

    return GLib.SOURCE_REMOVE
  })
}


/* =============================================================================
 * Generic helpers
 * ============================================================================= */

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function roundToStep(value: number, step: number) {
  const rounded = Math.round(value / step) * step
  const precision = step < 1 ? 100 : 1

  return Math.round(rounded * precision) / precision
}

function formatNumber(value: number) {
  return Number(value.toFixed(2)).toString()
}

function getEditorHeight(monitorHeight?: number) {
  const height = Number.isFinite(monitorHeight) ? Number(monitorHeight) : 900

  return clamp(Math.round(height - 32), 680, 1600)
}

function getEditorScrollHeight(editorHeight: number) {
  return Math.max(420, editorHeight - 118)
}

function createLabel(text: string, cssClass: string) {
  return new Gtk.Label({
    label: text,
    css_classes: [cssClass],
    halign: Gtk.Align.START,
    valign: Gtk.Align.CENTER,
    xalign: 0,
  })
}

function createCenteredLabel(text: string, cssClass: string) {
  return new Gtk.Label({
    label: text,
    css_classes: [cssClass],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
  })
}

function createButton(label: string, cssClasses: string[]) {
  const button = new Gtk.Button({ css_classes: cssClasses })
  button.set_focusable(false)
  button.set_child(new Gtk.Label({
    label,
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
  }))

  return button
}

function createIconTextContent(
  icon: string,
  text: string,
  extraCssClasses: string[] = [],
  centered = false,
) {
  const content = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["flow-editor-icon-text", ...extraCssClasses],
    spacing: 4,
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })

  const iconLabel = new Gtk.Label({
    label: icon,
    css_classes: ["flow-editor-chip-icon"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
  })
  const textLabel = new Gtk.Label({
    label: text,
    css_classes: ["flow-editor-chip-text"],
    halign: centered ? Gtk.Align.CENTER : Gtk.Align.START,
    valign: Gtk.Align.CENTER,
    xalign: centered ? 0.5 : 0,
  })

  textLabel.set_hexpand(!centered)
  content.set_hexpand(!centered)
  content.append(iconLabel)
  content.append(textLabel)

  return content
}

function createIconTextButton(
  icon: string,
  text: string,
  cssClasses: string[],
  extraContentCssClasses: string[] = [],
  centered = false,
) {
  const button = new Gtk.Button({ css_classes: cssClasses })
  button.set_focusable(false)
  button.set_child(createIconTextContent(icon, text, extraContentCssClasses, centered))

  return button
}

function createCenteredIconText(icon: string, text: string, cssClass: string) {
  const outer = new Gtk.CenterBox({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: [cssClass],
    valign: Gtk.Align.CENTER,
  })
  const content = createIconTextContent(icon, text, ["flow-editor-centered-icon-text"], true)

  content.set_halign(Gtk.Align.CENTER)
  content.set_valign(Gtk.Align.CENTER)
  outer.set_center_widget(content)

  return outer
}

function clearBox(box: Gtk.Box) {
  let child = box.get_first_child()

  while (child) {
    const next = child.get_next_sibling()
    box.remove(child)
    child = next
  }
}

function getModuleInfo(id: BarModuleId) {
  return MODULE_INFO.find((info) => info.id === id)
}

function getSlotLabel(slot: ModuleSlot) {
  switch (slot) {
    case "top":
      return "Top"
    case "middle":
      return "Middle"
    case "bottom":
      return "Bottom"
  }
}

function createIslandId() {
  return `island-custom-${Date.now()}`
}

function findIsland(settings: BarSettings, islandId: string | null) {
  if (!islandId) {
    return undefined
  }

  return settings.islands.find((island) => island.id === islandId && island.enabled)
}

function getOrderedItems(settings: BarSettings, slot: ModuleSlot) {
  return [...settings.islands]
    .filter((island) => island.enabled && island.slot === slot)
    .sort((left, right) => left.order - right.order)
}

function getVisibleOrderedItems(settings: BarSettings, slot: ModuleSlot) {
  return getOrderedItems(settings, slot).filter((island) => {
    return island.modules.length === 0 || getEditableIslandModules(island).length > 0
  })
}

function getSelectedLabel(selected: SelectedItem) {
  if (!selected) {
    return "Select a widget or island."
  }

  if (selected.kind === "newIsland") {
    return "Selected: new island"
  }

  if (selected.kind === "island") {
    return "Selected: island"
  }

  const info = getModuleInfo(selected.moduleId)

  return `Selected: ${info ? `${info.icon} ${info.label}` : selected.moduleId}`
}


function isSameSelection(left: SelectedItem, right: SelectedItem) {
  if (!left || !right || left.kind !== right.kind) {
    return false
  }

  if (left.kind === "newIsland") {
    return true
  }

  if (left.kind === "island" && right.kind === "island") {
    return left.islandId === right.islandId
  }

  if (left.kind === "module" && right.kind === "module") {
    return left.moduleId === right.moduleId
  }

  return false
}

function toggleSelection(context: EditorContext, nextSelected: SelectedItem) {
  context.setSelected(
    isSameSelection(context.selected, nextSelected) ? null : nextSelected,
  )
  context.setHoveredTarget(null)
  context.render()
}

function setHoveredTarget(context: EditorContext, targetId: string | null) {
  if (context.hoveredTargetId === targetId) {
    return
  }

  context.setHoveredTarget(targetId)
  context.render()
}

function isIslandInsertionTarget(targetId: string | null, islandId: string) {
  return targetId?.startsWith(`island:${islandId}:`) ?? false
}

function getOuterEdgeBand(height: number) {
  return Math.min(30, Math.max(12, height * 0.26))
}

function getOuterEdgeHoldBand(height: number) {
  return getOuterEdgeBand(height) + 6
}

function editorLogicalSize(context: EditorContext, base: number) {
  return Math.max(1, Math.round(base * getEditorTextScale(context.settings)))
}

function getSlotGapSize(context: EditorContext, _isActive: boolean) {
  return editorLogicalSize(context, 18)
}

function getSlotGapTargetId(slot: ModuleSlot, index: number) {
  return `slot:${slot}:gap:${index}`
}

/* =============================================================================
 * Direct manipulation drag and drop
 * ============================================================================= */

function encodeDragPayload(payload: DragPayload) {
  return `${DRAG_PAYLOAD_PREFIX}${JSON.stringify(payload)}`
}

function decodeDragPayload(value: unknown): DragPayload | null {
  if (typeof value !== "string" || !value.startsWith(DRAG_PAYLOAD_PREFIX)) {
    return null
  }

  try {
    const parsed = JSON.parse(value.slice(DRAG_PAYLOAD_PREFIX.length)) as Partial<DragPayload>

    if (parsed.kind === "module" && typeof parsed.moduleId === "string") {
      return { kind: "module", moduleId: parsed.moduleId as BarModuleId }
    }

    if (parsed.kind === "island" && typeof parsed.islandId === "string") {
      return { kind: "island", islandId: parsed.islandId }
    }

    if (parsed.kind === "newIsland") {
      return { kind: "newIsland" }
    }
  } catch (_error) {
    return null
  }

  return null
}

function createDragContent(payload: DragPayload) {
  const value = new GObject.Value()
  value.init(GObject.TYPE_STRING)
  value.set_string(encodeDragPayload(payload))
  return Gdk.ContentProvider.new_for_value(value)
}

function attachDragSource(widget: Gtk.Widget, payload: DragPayload) {
  const source = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE })

  source.connect("prepare", () => createDragContent(payload))
  source.connect("drag-begin", () => {
    dragSessionActive = true
    activeDragPayload = payload
    suppressSelectionClickUntil = Date.now() + 450
    pendingDropCommit = null
    cancelPendingDropSource()
    widget.add_css_class("dragging")

    try {
      const paintable = new Gtk.WidgetPaintable({ widget })
      source.set_icon(paintable, 8, 8)
    } catch (_error) {
      // GTK's default drag icon is a safe fallback on older builds.
    }
  })
  source.connect("drag-end", () => {
    widget.remove_css_class("dragging")
    dragSessionActive = false
    activeDragPayload = null
    // Gtk.Button may still emit clicked after a successful drag. Ignore that
    // synthetic click so the editor does not rebuild and disturb scroll.
    suppressSelectionClickUntil = Date.now() + 220
    schedulePendingDropCommit()
  })

  widget.add_controller(source)
}

function attachDropTarget(
  widget: Gtk.Widget,
  accepts: (payload: DragPayload) => boolean,
  onDrop: (payload: DragPayload) => void,
  beforeCommit?: () => void,
) {
  const target = Gtk.DropTarget.new(GObject.TYPE_STRING, Gdk.DragAction.MOVE)

  const acceptsActiveDrag = () => !activeDragPayload || accepts(activeDragPayload)

  // Reject unsupported internal payloads before GTK promotes this widget to an
  // active drop destination. Returning false only from the final drop callback
  // is too late: enter/motion have already advertised MOVE and nested targets
  // may keep ownership of the gesture while the drag source is unwinding.
  target.connect("accept", () => acceptsActiveDrag())
  target.connect("enter", (_target: unknown, _x: number, _y: number) => {
    if (!acceptsActiveDrag()) {
      widget.remove_css_class("drop-active")
      return 0
    }

    widget.add_css_class("drop-active")
    return Gdk.DragAction.MOVE
  })
  target.connect("motion", (_target: unknown, _x: number, _y: number) => {
    if (!acceptsActiveDrag()) {
      widget.remove_css_class("drop-active")
      return 0
    }

    return Gdk.DragAction.MOVE
  })
  target.connect("leave", () => {
    widget.remove_css_class("drop-active")
  })
  target.connect("drop", (_target: unknown, value: unknown) => {
    widget.remove_css_class("drop-active")
    const payload = decodeDragPayload(value)

    if (!payload || !accepts(payload)) {
      return false
    }

    // Capture transient viewport state while the original DnD hierarchy is
    // still intact. GTK may reset the parent adjustment while drag-end unwinds,
    // so waiting until render() starts can already be too late.
    beforeCommit?.()

    // Queue the mutation until the drag source has emitted drag-end. A single
    // idle turn is not sufficient on every GTK build: drop can be dispatched
    // before drag-end, so rebuilding here can still destroy the live target.
    queueDropCommit(() => onDrop(payload))
    return true
  })

  widget.add_controller(target)
}

/* =============================================================================
 * Layout mutations
 * ============================================================================= */

function normalizeIslandOrders(settings: BarSettings) {
  for (const slot of MODULE_SLOTS) {
    getOrderedItems(settings, slot).forEach((island, index) => {
      island.order = (index + 1) * 10

      for (const moduleId of island.modules) {
        settings.modules[moduleId].slot = island.slot
        settings.modules[moduleId].order = island.order + island.modules.indexOf(moduleId)
      }
    })
  }
}

function cleanupEmptyFloatingItems(settings: BarSettings) {
  settings.islands = settings.islands.filter((island) => {
    return island.boxed || island.modules.length > 0
  })
}

function rewriteSlotItems(
  settings: BarSettings,
  slot: ModuleSlot,
  items: LayoutIsland[],
) {
  items.forEach((island, index) => {
    island.enabled = true
    island.slot = slot
    island.order = (index + 1) * 10

    for (const moduleId of island.modules) {
      settings.modules[moduleId].slot = slot
      settings.modules[moduleId].order = island.order + island.modules.indexOf(moduleId)
    }
  })

  normalizeIslandOrders(settings)
}

function removeModuleFromItems(settings: BarSettings, moduleId: BarModuleId) {
  for (const island of settings.islands) {
    island.modules = island.modules.filter((id) => id !== moduleId)
  }

  cleanupEmptyFloatingItems(settings)
}

function insertIslandAt(
  settings: BarSettings,
  island: LayoutIsland,
  slot: ModuleSlot,
  index: number,
) {
  const previousSlot = island.slot
  const originalItems = getOrderedItems(settings, slot)
  const originalIndex = originalItems.findIndex((item) => item.id === island.id)
  const items = originalItems.filter((item) => item.id !== island.id)

  const wasAlreadyOrdered = island.order > 0
  const adjustedIndex =
    wasAlreadyOrdered && previousSlot === slot && originalIndex >= 0 && originalIndex < index
      ? index - 1
      : index
  const targetIndex = clamp(adjustedIndex, 0, items.length)

  island.enabled = true
  island.slot = slot
  items.splice(targetIndex, 0, island)
  rewriteSlotItems(settings, slot, items)
}

function createIsland(settings: BarSettings, slot: ModuleSlot, index: number) {
  const island: LayoutIsland = {
    id: createIslandId(),
    enabled: true,
    slot,
    order: 0,
    width: settings.global.islandWidth,
    boxed: true,
    modules: [],
  }

  settings.islands.push(island)
  insertIslandAt(settings, island, slot, index)

  return island
}

function createFloatingModule(
  settings: BarSettings,
  moduleId: BarModuleId,
  slot: ModuleSlot,
  index: number,
) {
  const previousIsland = settings.islands.find((item) => item.modules.includes(moduleId))
  const previousItems = previousIsland?.slot === slot ? getOrderedItems(settings, slot) : []
  const previousIndex = previousItems.findIndex((item) => item.id === previousIsland?.id)
  const adjustedIndex =
    previousIsland?.slot === slot &&
    previousIsland.boxed === false &&
    previousIndex >= 0 &&
    previousIndex < index
      ? index - 1
      : index

  removeModuleFromItems(settings, moduleId)
  settings.modules[moduleId].enabled = true
  settings.modules[moduleId].slot = slot

  const island: LayoutIsland = {
    id: `floating-${moduleId}-${Date.now()}`,
    enabled: true,
    slot,
    order: 0,
    width: settings.global.islandWidth,
    boxed: false,
    modules: [moduleId],
  }

  settings.islands.push(island)
  insertIslandAt(settings, island, slot, adjustedIndex)

  return island
}

function insertModuleIntoIsland(
  settings: BarSettings,
  moduleId: BarModuleId,
  islandId: string,
  index: number,
) {
  const island = findIsland(settings, islandId)

  if (!island || !island.boxed) {
    return
  }

  const previousIsland = settings.islands.find((item) => item.modules.includes(moduleId))
  const previousIndex = previousIsland?.modules.indexOf(moduleId) ?? -1

  removeModuleFromItems(settings, moduleId)
  settings.modules[moduleId].enabled = true
  settings.modules[moduleId].slot = island.slot

  const adjustedIndex =
    previousIsland?.id === island.id && previousIndex >= 0 && previousIndex < index
      ? index - 1
      : index
  const targetIndex = clamp(adjustedIndex, 0, island.modules.length)

  island.modules.splice(targetIndex, 0, moduleId)
  normalizeIslandOrders(settings)
}

function hideModule(settings: BarSettings, moduleId: BarModuleId) {
  settings.modules[moduleId].enabled = false
  removeModuleFromItems(settings, moduleId)
  normalizeIslandOrders(settings)
}

function deleteIsland(settings: BarSettings, islandId: string) {
  const island = findIsland(settings, islandId)

  if (!island) {
    return
  }

  for (const moduleId of island.modules) {
    settings.modules[moduleId].enabled = false
  }

  settings.islands = settings.islands.filter((item) => item.id !== islandId)
  normalizeIslandOrders(settings)
}

function applySelectedToSlot(
  context: EditorContext,
  slot: ModuleSlot,
  index: number,
) {
  const { selected, settings } = context

  if (!selected) {
    return
  }

  if (selected.kind === "module" && isFixedModuleId(selected.moduleId)) {
    return
  }

  if (selected.kind === "newIsland") {
    const island = createIsland(settings, slot, index)
    context.setSelected({ kind: "island", islandId: island.id })
  } else if (selected.kind === "island") {
    const island = findIsland(settings, selected.islandId)

    if (island) {
      insertIslandAt(settings, island, slot, index)
      context.setSelected({ kind: "island", islandId: island.id })
    }
  } else {
    const island = createFloatingModule(settings, selected.moduleId, slot, index)
    context.setSelected({ kind: "module", moduleId: island.modules[0] })
  }

  context.markChanged()
  context.render()
}

function applySelectedToIsland(
  context: EditorContext,
  island: LayoutIsland,
  index: number,
) {
  const { selected, settings } = context

  if (!selected || selected.kind !== "module" || isFixedModuleId(selected.moduleId)) {
    return
  }

  insertModuleIntoIsland(settings, selected.moduleId, island.id, index)
  context.setSelected({ kind: "module", moduleId: selected.moduleId })
  context.markChanged()
  context.render()
}

function sendSelectedToExtras(context: EditorContext) {
  const { selected, settings } = context

  if (!selected) {
    return
  }

  if (selected.kind === "module") {
    if (isFixedModuleId(selected.moduleId)) {
      return
    }

    hideModule(settings, selected.moduleId)
  } else if (selected.kind === "island") {
    deleteIsland(settings, selected.islandId)
  }

  context.setSelected(null)
  context.markChanged()
  context.render()
}

function dropPayloadIntoSlot(
  context: EditorContext,
  payload: DragPayload,
  slot: ModuleSlot,
  index: number,
) {
  if (payload.kind === "module") {
    if (isFixedModuleId(payload.moduleId)) return
    createFloatingModule(context.settings, payload.moduleId, slot, index)
    context.setSelected({ kind: "module", moduleId: payload.moduleId })
  } else if (payload.kind === "newIsland") {
    const island = createIsland(context.settings, slot, index)
    context.setSelected({ kind: "island", islandId: island.id })
  } else {
    const island = findIsland(context.settings, payload.islandId)
    if (!island) return
    insertIslandAt(context.settings, island, slot, index)
    context.setSelected({ kind: "island", islandId: island.id })
  }

  context.markChanged()
  context.render()
}

function dropModuleIntoIsland(
  context: EditorContext,
  moduleId: BarModuleId,
  island: LayoutIsland,
  index: number,
) {
  if (isFixedModuleId(moduleId)) return

  // Dropping one standalone widget onto another turns the target into an island,
  // matching the direct-manipulation mental model used by mobile home screens.
  if (!island.boxed) {
    island.boxed = true
  }

  insertModuleIntoIsland(context.settings, moduleId, island.id, index)
  context.setSelected({ kind: "module", moduleId })
  context.markChanged()
  context.render()
}

function mergeIslandIntoIsland(
  context: EditorContext,
  sourceIslandId: string,
  targetIsland: LayoutIsland,
) {
  // Standalone widgets are intentionally not island merge targets. This keeps
  // island -> widget drops as a no-op and avoids rebuilding a live child DnD
  // target on GTK4 while the source drag is still unwinding.
  if (!targetIsland.boxed || sourceIslandId === targetIsland.id) return
  const source = findIsland(context.settings, sourceIslandId)
  if (!source) return

  // Always keep the drop target in place and fold the dragged island into it.
  // This is both the most predictable direct-manipulation behavior and avoids
  // deleting the widget that owns the active DropTarget. A standalone target
  // simply becomes boxed and gains the dragged modules before its own module.
  const sourceModules = [...source.modules]
  const targetModules = [...targetIsland.modules]

  context.settings.islands = context.settings.islands.filter(item => item.id !== source.id)
  targetIsland.boxed = true
  targetIsland.modules = [
    ...sourceModules,
    ...targetModules.filter(id => !sourceModules.includes(id)),
  ]

  for (const moduleId of targetIsland.modules) {
    context.settings.modules[moduleId].enabled = true
    context.settings.modules[moduleId].slot = targetIsland.slot
  }

  normalizeIslandOrders(context.settings)
  context.setSelected({ kind: "island", islandId: targetIsland.id })

  cleanupEmptyFloatingItems(context.settings)
  context.markChanged()
  context.render()
}

function dropPayloadToExtras(context: EditorContext, payload: DragPayload) {
  if (payload.kind === "newIsland") {
    return
  }

  if (payload.kind === "module") {
    if (isFixedModuleId(payload.moduleId)) return
    hideModule(context.settings, payload.moduleId)
  } else {
    deleteIsland(context.settings, payload.islandId)
  }

  context.setSelected(null)
  context.markChanged()
  context.render()
}

/* =============================================================================
 * Size controls
 * ============================================================================= */

function setGlobalBarWidth(settings: BarSettings, value: number) {
  const width = clamp(roundToStep(value, BAR_WIDTH_STEP), MIN_BAR_WIDTH, MAX_BAR_WIDTH)

  settings.global.barWidth = width
  settings.global.islandWidth = width
  settings.appMenu.islandWidth = width

  for (const island of settings.islands) {
    island.width = width
  }
}

function getScalePercent(settings: BarSettings) {
  return Math.round(
    (settings.global.scaleMd / DEFAULT_BAR_SETTINGS.global.scaleMd) * 100,
  )
}

function setScalePercent(settings: BarSettings, percent: number) {
  const normalized = clamp(percent, MIN_SCALE_PERCENT, MAX_SCALE_PERCENT) / 100

  settings.global.scaleSm = roundToStep(
    DEFAULT_BAR_SETTINGS.global.scaleSm * normalized,
    0.5,
  )
  settings.global.scaleMd = roundToStep(
    DEFAULT_BAR_SETTINGS.global.scaleMd * normalized,
    0.5,
  )
  settings.global.scaleLg = roundToStep(
    DEFAULT_BAR_SETTINGS.global.scaleLg * normalized,
    0.5,
  )
  settings.global.scaleXl = roundToStep(
    DEFAULT_BAR_SETTINGS.global.scaleXl * normalized,
    0.5,
  )
}

function adjustScalePercent(settings: BarSettings, direction: -1 | 1) {
  setScalePercent(settings, getScalePercent(settings) + SCALE_PERCENT_STEP * direction)
}

function getIconPercent(settings: BarSettings) {
  return Math.round((settings.appMenu.iconSize / DEFAULT_BAR_SETTINGS.appMenu.iconSize) * 100)
}

function setIconPercent(settings: BarSettings, percent: number) {
  const factor = clamp(percent, MIN_ICON_PERCENT, MAX_ICON_PERCENT) / 100
  settings.appMenu.iconSize = roundToStep(DEFAULT_BAR_SETTINGS.appMenu.iconSize * factor, 0.01)
  settings.tray.iconSize = roundToStep(DEFAULT_BAR_SETTINGS.tray.iconSize * factor, 0.01)
  settings.updates.iconSize = roundToStep(DEFAULT_BAR_SETTINGS.updates.iconSize * factor, 0.01)
  settings.connectivity.iconSize = roundToStep(DEFAULT_BAR_SETTINGS.connectivity.iconSize * factor, 0.01)
  settings.weather.iconSize = roundToStep(DEFAULT_BAR_SETTINGS.weather.iconSize * factor, 0.01)
  settings.exit.iconSize = roundToStep(DEFAULT_BAR_SETTINGS.exit.iconSize * factor, 0.01)
}

function adjustIconPercent(settings: BarSettings, direction: -1 | 1) {
  setIconPercent(settings, getIconPercent(settings) + ICON_PERCENT_STEP * direction)
}

function getFontPercent(settings: BarSettings) {
  return Math.round((settings.clock.labelSize / DEFAULT_BAR_SETTINGS.clock.labelSize) * 100)
}

function setFontPercent(settings: BarSettings, percent: number) {
  const factor = clamp(percent, MIN_FONT_PERCENT, MAX_FONT_PERCENT) / 100
  settings.updates.countSize = roundToStep(DEFAULT_BAR_SETTINGS.updates.countSize * factor, 0.01)
  settings.weather.tempSize = roundToStep(DEFAULT_BAR_SETTINGS.weather.tempSize * factor, 0.01)
  settings.clock.labelSize = roundToStep(DEFAULT_BAR_SETTINGS.clock.labelSize * factor, 0.01)
}

function adjustFontPercent(settings: BarSettings, direction: -1 | 1) {
  setFontPercent(settings, getFontPercent(settings) + FONT_PERCENT_STEP * direction)
}

function getDialPercent(settings: BarSettings) {
  return Math.round((settings.dials.dialSize / DEFAULT_BAR_SETTINGS.dials.dialSize) * 100)
}

function setDialPercent(settings: BarSettings, percent: number) {
  const factor = clamp(percent, MIN_DIAL_PERCENT, MAX_DIAL_PERCENT) / 100
  settings.dials.dialSize = roundToStep(DEFAULT_BAR_SETTINGS.dials.dialSize * factor, 0.05)
  settings.disk.dialSize = roundToStep(DEFAULT_BAR_SETTINGS.disk.dialSize * factor, 0.05)
}

function adjustDialPercent(settings: BarSettings, direction: -1 | 1) {
  setDialPercent(settings, getDialPercent(settings) + DIAL_PERCENT_STEP * direction)
}

function getBarVerticalMargin(settings: BarSettings) {
  return settings.global.edgeBarPadding.top
}

function setBarVerticalMargin(settings: BarSettings, value: number) {
  const margin = clamp(
    roundToStep(value, VERTICAL_MARGIN_STEP),
    MIN_VERTICAL_MARGIN,
    MAX_VERTICAL_MARGIN,
  )

  settings.global.edgeBarPadding.top = margin
  settings.global.edgeBarPadding.bottom = margin
}

/* =============================================================================
 * Editor widgets
 * ============================================================================= */

function createSizePreview(settings: BarSettings) {
  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["flow-editor-scale-preview"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })

  const topEdge = new Gtk.Box({
    css_classes: ["flow-editor-scale-preview-edge", "top"],
    halign: Gtk.Align.CENTER,
  })
  const topGap = new Gtk.Box({
    css_classes: ["flow-editor-scale-preview-gap", "top"],
    halign: Gtk.Align.CENTER,
  })
  const iconShell = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["flow-editor-scale-preview-shell"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })
  const iconWrap = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["flow-editor-scale-preview-icon-wrap"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })
  const icon = new Gtk.Label({
    label: APP_MENU_ICON,
    css_classes: ["flow-editor-scale-preview-icon"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
    yalign: 0.62,
  })
  const bottomGap = new Gtk.Box({
    css_classes: ["flow-editor-scale-preview-gap", "bottom"],
    halign: Gtk.Align.CENTER,
  })
  const bottomEdge = new Gtk.Box({
    css_classes: ["flow-editor-scale-preview-edge", "bottom"],
    halign: Gtk.Align.CENTER,
  })

  iconWrap.append(icon)
  iconShell.append(iconWrap)

  box.append(topEdge)
  box.append(topGap)
  box.append(iconShell)
  box.append(bottomGap)
  box.append(bottomEdge)

  function refresh() {
    // Geometry is intentionally owned by buildSizePreviewCss() in em units.
    // Refresh only the content here so the preview scales with the editor font
    // instead of mixing CSS proportions with fixed GTK logical-pixel requests.
    icon.set_label(APP_MENU_ICON)
  }

  refresh()

  return {
    widget: box as Gtk.Widget,
    refresh,
  }
}



/* Theme Studio owns wallpaper selection in V5. Keep the Bar Editor focused on
 * bar composition and geometry; the legacy embedded theme manager was removed
 * from this hot path to reduce parse time and widget code loaded by the editor. */

function createSizePanel(settings: BarSettings, monitorIndex: number, markChanged: () => void, embedded = false) {
  const panel = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["flow-editor-size-panel"],
    spacing: 6,
  })

  const heading = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["flow-editor-size-heading"],
    spacing: 8,
  })
  heading.append(createLabel("Bar Geometry", "flow-editor-size-heading-title"))
  const headingSpacer = new Gtk.Box({ hexpand: true })
  heading.append(headingSpacer)
  heading.append(createLabel("LIVE PREVIEW · APPLY TO REBUILD", "flow-editor-size-heading-badge"))
  panel.append(heading)

  const scaleValue = createLabel(`${getScalePercent(settings)}%`, "flow-editor-size-value")
  const widthValue = createLabel(`${formatNumber(settings.global.barWidth)}em`, "flow-editor-size-value")
  const iconValue = createLabel(`${getIconPercent(settings)}%`, "flow-editor-size-value")
  const fontValue = createLabel(`${getFontPercent(settings)}%`, "flow-editor-size-value")
  const dialValue = createLabel(`${getDialPercent(settings)}%`, "flow-editor-size-value")
  const verticalMarginValue = createLabel(`${formatNumber(getBarVerticalMargin(settings))}em`, "flow-editor-size-value")

  function refreshValues() {
    scaleValue.set_label(`${getScalePercent(settings)}%`)
    widthValue.set_label(`${formatNumber(settings.global.barWidth)}em`)
    iconValue.set_label(`${getIconPercent(settings)}%`)
    fontValue.set_label(`${getFontPercent(settings)}%`)
    dialValue.set_label(`${getDialPercent(settings)}%`)
    verticalMarginValue.set_label(`${formatNumber(getBarVerticalMargin(settings))}em`)
  }

  function applyLocalChanges() {
    refreshValues()
    queueLiveSettingsCss(settings, monitorIndex)
    queueEditorTextCss(settings, monitorIndex, embedded)
    markChanged()
  }

  function createStepper(
    title: string,
    detail: string,
    value: Gtk.Widget,
    onDown: () => void,
    onUp: () => void,
  ) {
    const control = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      css_classes: ["flow-editor-size-control"],
      spacing: 7,
      hexpand: true,
    })
    const copy = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      css_classes: ["flow-editor-size-control-copy"],
      spacing: 1,
      hexpand: true,
    })
    copy.append(createLabel(title, "flow-editor-size-label"))
    copy.append(createLabel(detail, "flow-editor-size-detail"))

    const down = createButton("−", ["flow-editor-step-button"])
    const up = createButton("+", ["flow-editor-step-button"])
    down.connect("clicked", () => { onDown(); applyLocalChanges() })
    up.connect("clicked", () => { onUp(); applyLocalChanges() })

    control.append(copy)
    control.append(value)
    control.append(down)
    control.append(up)
    return control
  }

  panel.append(createStepper(
    "Scale",
    "Scale the complete bar composition.",
    scaleValue,
    () => adjustScalePercent(settings, -1),
    () => adjustScalePercent(settings, 1),
  ))
  panel.append(createStepper(
    "Bar Width",
    "Change the width of islands and the bar shell.",
    widthValue,
    () => setGlobalBarWidth(settings, settings.global.barWidth - BAR_WIDTH_STEP),
    () => setGlobalBarWidth(settings, settings.global.barWidth + BAR_WIDTH_STEP),
  ))
  panel.append(createStepper(
    "Icon Size",
    "Scale bar glyphs without changing the island geometry.",
    iconValue,
    () => adjustIconPercent(settings, -1),
    () => adjustIconPercent(settings, 1),
  ))
  panel.append(createStepper(
    "Font Size",
    "Scale text such as clock, temperature and counters.",
    fontValue,
    () => adjustFontPercent(settings, -1),
    () => adjustFontPercent(settings, 1),
  ))
  panel.append(createStepper(
    "Dial Size",
    "Scale CPU, RAM, temperature, battery and disk dials.",
    dialValue,
    () => adjustDialPercent(settings, -1),
    () => adjustDialPercent(settings, 1),
  ))
  panel.append(createStepper(
    "Top / Bottom Margin",
    "Set the bar distance from the upper and lower screen edges.",
    verticalMarginValue,
    () => setBarVerticalMargin(settings, getBarVerticalMargin(settings) - VERTICAL_MARGIN_STEP),
    () => setBarVerticalMargin(settings, getBarVerticalMargin(settings) + VERTICAL_MARGIN_STEP),
  ))

  return panel
}

function hasSelection(context: EditorContext) {
  return context.selected !== null
}

function canInsertIntoSlot(context: EditorContext) {
  return hasSelection(context)
}

function canInsertIntoIsland(context: EditorContext) {
  return context.selected?.kind === "module"
}

function canSendSelectedToExtras(context: EditorContext) {
  return context.selected?.kind === "module" || context.selected?.kind === "island"
}

function createInsertionBar(
  label: string,
  cssClasses: string[],
  onClick: () => void,
) {
  const button = createButton(label, [
    "flow-editor-insert-bar",
    "entering",
    ...cssClasses,
  ])
  let activated = false

  timeout(GLib.PRIORITY_DEFAULT, 16, () => {
    button.remove_css_class("entering")
    button.add_css_class("visible")
    return GLib.SOURCE_REMOVE
  })

  function activate() {
    if (activated) {
      return
    }

    activated = true
    onClick()

    idle(GLib.PRIORITY_DEFAULT_IDLE, () => {
      activated = false
      return GLib.SOURCE_REMOVE
    })
  }

  const click = new Gtk.GestureClick()
  click.set_button(0)
  click.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
  click.connect("pressed", activate)
  button.add_controller(click)

  button.connect("clicked", activate)

  return button
}

function createConditionalInsertionBar(
  context: EditorContext,
  targetId: string,
  label: string,
  cssClasses: string[],
  onClick: () => void,
) {
  if (context.hoveredTargetId !== targetId || !hasSelection(context)) {
    return null
  }

  return createInsertionBar(label, cssClasses, onClick)
}

function appendOptional(box: Gtk.Box, child: Gtk.Widget | null) {
  if (child) {
    box.append(child)
  }
}

function attachHoverTarget(
  _widget: Gtk.Widget,
  _context: EditorContext,
  _resolveTargetId: (_x: number, y: number, height: number) => string | null,
  _clearIds: string[],
  _options: { clearOnLeave?: boolean } = {},
) {
  // Widget Composer uses native GTK4 DND. The old selection-hover placement
  // controller intentionally stays disabled here so a render cannot replace
  // the drag source while a pointer drag is in progress.
}

function attachStickyHoverTarget(
  _widget: Gtk.Widget,
  _context: EditorContext,
  _targetId: string,
) {
  // Native DropTarget controllers own hover feedback in Widget Composer.
}

function createModuleChip(
  moduleId: BarModuleId,
  context: EditorContext,
  island?: LayoutIsland,
) {
  const info = getModuleInfo(moduleId)
  const selected = context.selected?.kind === "module" && context.selected.moduleId === moduleId
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: [
      "flow-editor-widget-chip",
      "direct-manipulation",
      selected ? "selected" : "idle",
      island?.boxed === false ? "floating" : "inside-island",
    ],
    spacing: 6,
  })

  const pick = info
    ? createIconTextButton(info.icon, info.label, ["flow-editor-widget-pick"])
    : createButton(moduleId, ["flow-editor-widget-pick"])
  pick.set_hexpand(true)

  pick.connect("clicked", () => {
    if (shouldSuppressSelectionClick()) return
    toggleSelection(context, { kind: "module", moduleId })
  })

  if (!isFixedModuleId(moduleId)) {
    attachDragSource(pick, { kind: "module", moduleId })
  }

  if (island) {
    attachDropTarget(
      row,
      // Deliberately reject island -> widget drops. GTK4 can keep the child
      // DropTarget alive while the source island is being rebuilt, which is
      // compositor/GTK-version sensitive. Island -> island remains supported
      // by the island container itself; dropping an island on a widget is a
      // stable no-op by design.
      (payload) => payload.kind === "module" && payload.moduleId !== moduleId,
      (payload) => {
        if (payload.kind !== "module") return
        const index = Math.max(0, island.modules.indexOf(moduleId) + 1)
        dropModuleIntoIsland(context, payload.moduleId, island, index)
      },
      context.captureDropScroll,
    )
  }

  row.append(pick)
  row.append(createLabel("󰇙", "flow-editor-drag-handle"))

  return row
}

function createIslandHeader(island: LayoutIsland, context: EditorContext) {
  const selected = context.selected?.kind === "island" && context.selected.islandId === island.id
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["flow-editor-island-header", "direct-manipulation", selected ? "selected" : "idle"],
    spacing: 6,
  })

  const select = createIconTextButton("╭", "Island", ["flow-editor-island-pick"], [], true)
  select.set_hexpand(true)

  select.connect("clicked", () => {
    if (shouldSuppressSelectionClick()) return
    toggleSelection(context, { kind: "island", islandId: island.id })
  })

  attachDragSource(select, { kind: "island", islandId: island.id })
  row.append(select)
  row.append(createLabel("󰇙", "flow-editor-drag-handle"))

  return row
}

function createIslandModuleGapDropZone(
  island: LayoutIsland,
  index: number,
  context: EditorContext,
) {
  const targetId = `island:${island.id}:gap:${index}`
  const active = context.hoveredTargetId === targetId
  const zone = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: [
      "flow-editor-island-module-dropzone",
      active ? "active" : "idle",
    ],
    spacing: 0,
  })

  appendOptional(
    zone,
    createConditionalInsertionBar(context, targetId, "put widget here", ["inner"], () => {
      applySelectedToIsland(context, island, index)
    }),
  )

  attachHoverTarget(
    zone,
    context,
    () => (context.selected?.kind === "module" ? targetId : null),
    [targetId],
  )
  attachDropTarget(
    zone,
    (payload) => payload.kind === "module",
    (payload) => {
      if (payload.kind === "module") dropModuleIntoIsland(context, payload.moduleId, island, index)
    },
    context.captureDropScroll,
  )
  zone.set_size_request(-1, editorLogicalSize(context, 16))

  return zone
}

function createEmptyIslandDropZone(island: LayoutIsland, context: EditorContext) {
  const targetId = `island:${island.id}:empty`
  const zone = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["flow-editor-hover-wrap", "empty-island"],
    spacing: 0,
  })

  appendOptional(
    zone,
    createConditionalInsertionBar(context, targetId, "put widget here", ["inner"], () => {
      applySelectedToIsland(context, island, 0)
    }),
  )

  attachHoverTarget(
    zone,
    context,
    () => (context.selected?.kind === "module" ? targetId : null),
    [targetId],
  )
  attachDropTarget(
    zone,
    (payload) => payload.kind === "module",
    (payload) => {
      if (payload.kind === "module") dropModuleIntoIsland(context, payload.moduleId, island, 0)
    },
    context.captureDropScroll,
  )
  zone.set_size_request(-1, editorLogicalSize(context, 16))

  return zone
}

function createBoxedIslandBlock(island: LayoutIsland, context: EditorContext) {
  const selected = context.selected?.kind === "island" && context.selected.islandId === island.id
  const block = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["flow-editor-island-block", selected ? "selected" : "idle"],
    spacing: 0,
  })

  block.append(createIslandHeader(island, context))

  const modules = getEditableIslandModules(island)

  if (modules.length === 0) {
    block.append(createEmptyIslandDropZone(island, context))
  } else {
    block.append(createIslandModuleGapDropZone(island, 0, context))

    modules.forEach((moduleId, index) => {
      block.append(createModuleChip(moduleId, context, island))
      block.append(createIslandModuleGapDropZone(island, index + 1, context))
    })
  }

  block.append(createCenteredIconText("╰", "close", "flow-editor-island-close"))

  attachDropTarget(
    block,
    (payload) =>
      (payload.kind === "module" && !isFixedModuleId(payload.moduleId)) ||
      (payload.kind === "island" && payload.islandId !== island.id),
    (payload) => {
      if (payload.kind === "module") {
        dropModuleIntoIsland(context, payload.moduleId, island, island.modules.length)
        return
      }
      if (payload.kind === "island") mergeIslandIntoIsland(context, payload.islandId, island)
    },
    context.captureDropScroll,
  )

  return block
}

function createFloatingBlock(island: LayoutIsland, context: EditorContext) {
  const block = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["flow-editor-floating-block"],
    spacing: 0,
  })

  for (const moduleId of getEditableIslandModules(island)) {
    block.append(createModuleChip(moduleId, context, island))
  }

  return block
}

function createLayoutItem(island: LayoutIsland, context: EditorContext) {
  if (island.boxed) {
    return createBoxedIslandBlock(island, context)
  }

  return createFloatingBlock(island, context)
}

function createHoverWrappedLayoutItem(
  _slot: ModuleSlot,
  island: LayoutIsland,
  _index: number,
  context: EditorContext,
) {
  const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["flow-editor-hover-wrap", "layout-item"],
    spacing: 0,
  })

  wrapper.append(createLayoutItem(island, context))

  return wrapper
}

function createSlotGapDropZone(
  slot: ModuleSlot,
  index: number,
  context: EditorContext,
) {
  const targetId = getSlotGapTargetId(slot, index)
  const active = context.hoveredTargetId === targetId
  const zone = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["flow-editor-slot-dropzone", active ? "active" : "idle"],
    spacing: 0,
  })

  appendOptional(
    zone,
    createConditionalInsertionBar(context, targetId, "put here", ["outer"], () => {
      applySelectedToSlot(context, slot, index)
    }),
  )

  attachHoverTarget(zone, context, () => targetId, [targetId])
  attachDropTarget(
    zone,
    () => true,
    (payload) => dropPayloadIntoSlot(context, payload, slot, index),
    context.captureDropScroll,
  )
  zone.set_size_request(-1, getSlotGapSize(context, active))

  return zone
}

function createEmptySlotDropZone(slot: ModuleSlot, context: EditorContext) {
  const targetId = `slot:${slot}:empty`
  const zone = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["flow-editor-empty-slot"],
    spacing: 0,
    vexpand: !context.naturalLayout,
  })
  if (context.naturalLayout) zone.set_size_request(-1, editorLogicalSize(context, 72))

  appendOptional(
    zone,
    createConditionalInsertionBar(context, targetId, "put here", ["outer"], () => {
      applySelectedToSlot(context, slot, 0)
    }),
  )

  attachHoverTarget(zone, context, () => targetId, [targetId])
  attachDropTarget(
    zone,
    () => true,
    (payload) => dropPayloadIntoSlot(context, payload, slot, 0),
    context.captureDropScroll,
  )

  return zone
}

function createSlotColumn(slot: ModuleSlot, context: EditorContext) {
  const column = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["flow-editor-column", `flow-editor-${slot}`],
    spacing: 0,
    vexpand: !context.naturalLayout,
    valign: context.naturalLayout ? Gtk.Align.START : Gtk.Align.FILL,
  })

  column.append(createLabel(getSlotLabel(slot), "flow-editor-column-title"))

  const items = getVisibleOrderedItems(context.settings, slot)

  if (items.length === 0) {
    column.append(createEmptySlotDropZone(slot, context))
    return column
  }

  column.append(createSlotGapDropZone(slot, 0, context))

  items.forEach((island, index) => {
    column.append(createHoverWrappedLayoutItem(slot, island, index, context))
    column.append(createSlotGapDropZone(slot, index + 1, context))
  })

  return column
}

function getUnusedModules(settings: BarSettings) {
  const assigned = new Set(
    settings.islands
      .filter((island) => island.enabled)
      .flatMap((island) => getEditableIslandModules(island)),
  )

  return MODULE_INFO.filter((info) => {
    return !isFixedModuleId(info.id) && (!settings.modules[info.id].enabled || !assigned.has(info.id))
  })
}

function createExtrasHideZone(
  context: EditorContext,
  fill = false,
) {
  const zone = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["flow-editor-extras-dropzone", "direct-dropzone", fill ? "fill" : "compact"],
    spacing: 0,
    vexpand: fill && !context.naturalLayout,
  })

  zone.append(createLabel("Drop here to hide", "flow-editor-drop-hint"))
  attachDropTarget(
    zone,
    (payload) => payload.kind !== "newIsland",
    (payload) => dropPayloadToExtras(context, payload),
    context.captureDropScroll,
  )
  zone.set_size_request(-1, editorLogicalSize(context, fill ? 72 : 36))
  return zone
}

function createExtrasColumn(context: EditorContext) {
  const column = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["flow-editor-column", "flow-editor-extras", "widget-tray"],
    spacing: editorLogicalSize(context, 5),
    vexpand: !context.naturalLayout,
    valign: context.naturalLayout ? Gtk.Align.START : Gtk.Align.FILL,
  })

  column.append(createLabel("Widget tray", "flow-editor-column-title"))
  const trayNote = createLabel("Drag widgets or a new island onto the bar. Drop bar items below to hide them.", "flow-editor-tray-note")
  trayNote.set_wrap(true)
  column.append(trayNote)

  const islandTool = createIconTextButton("╭", "Island", [
    "flow-editor-tool-chip",
    "flow-editor-new-island",
    "direct-manipulation",
  ], [], true)
  attachDragSource(islandTool, { kind: "newIsland" })
  islandTool.connect("clicked", () => {
    toggleSelection(context, { kind: "newIsland" })
  })
  column.append(islandTool)

  const unused = getUnusedModules(context.settings)

  if (unused.length === 0) {
    column.append(createLabel("All widgets are on the bar", "flow-editor-empty-text"))
  } else {
    for (const info of unused) {
      const button = createIconTextButton(info.icon, info.label, [
        "flow-editor-unused-widget",
        "direct-manipulation",
      ])
      attachDragSource(button, { kind: "module", moduleId: info.id })
      button.connect("clicked", () => {
        toggleSelection(context, { kind: "module", moduleId: info.id })
      })
      column.append(button)
    }
  }

  column.append(createExtrasHideZone(context, true))
  return column
}

function createBarCanvas(context: EditorContext) {
  const canvas = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["flow-editor-bar-canvas"],
    spacing: editorLogicalSize(context, 4),
    hexpand: true,
    vexpand: !context.naturalLayout,
  })

  const heading = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["flow-editor-canvas-heading"],
    spacing: editorLogicalSize(context, 6),
  })
  heading.append(createLabel("󰍹", "flow-editor-canvas-icon"))
  const copy = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 1, hexpand: true })
  copy.append(createLabel("Bar canvas", "flow-editor-column-title"))
  const canvasNote = createLabel("Drag to reorder. Drop a widget on another widget to group them into one island.", "flow-editor-tray-note")
  canvasNote.set_wrap(true)
  copy.append(canvasNote)
  heading.append(copy)
  canvas.append(heading)

  for (const slot of MODULE_SLOTS) {
    const section = createSlotColumn(slot, context)
    section.add_css_class("canvas-section")
    canvas.append(section)
  }

  return canvas
}

function createFlowEditor(context: EditorContext) {
  const body = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["flow-editor-body", "direct-manipulation-editor"],
    spacing: editorLogicalSize(context, 8),
    vexpand: !context.naturalLayout,
    valign: context.naturalLayout ? Gtk.Align.START : Gtk.Align.FILL,
  })

  body.append(createBarCanvas(context))
  body.append(createExtrasColumn(context))
  return body
}

/* =============================================================================
 * Public component
 * ============================================================================= */

export default function WidgetComposer(props: BarSettingsProps = {}) {
  const initialMonitorIndex = Math.max(0, Math.round(props.monitorIndex ?? 0))
  let monitorIndex = initialMonitorIndex
  let settings = loadBarSettings(monitorIndex)
  const fitScale = () => {
    const bounds = monitorBounds(monitorIndex)
    return Math.min(getEditorTextScale(settings), (bounds.width - 64) / 980, (bounds.height - 64) / 740)
  }
  const scaled = (value: number) => Math.max(1, Math.round(value * fitScale()))
  onCleanup(() => { if (!props.embedded) barSettingsControllers.delete(initialMonitorIndex); settingsWindow?.destroy() })

  function currentEditorHeight() {
    const bounds = monitorBounds(monitorIndex)
    const requested = monitorIndex === initialMonitorIndex && Number.isFinite(props.monitorHeight)
      ? Number(props.monitorHeight)
      : bounds.height
    return Math.min(
      getEditorHeight(requested),
      Math.max(240, Math.round(requested - 64)),
    )
  }

  function getContentHeight() {
    return Math.max(scaled(560), currentEditorHeight() - scaled(96))
  }

  function getWindowWidth() {
    return scaled(940)
  }

  function getWindowHeight() {
    return Math.min(scaled(980), currentEditorHeight())
  }

  function getScrollContentHeight() {
    return Math.min(getEditorScrollHeight(currentEditorHeight()), getContentHeight() - scaled(118))
  }
  let selected: SelectedItem = null
  let hoveredTargetId: string | null = null
  let savedSnapshot = settingsSnapshot(settings)
  let hasUnsavedChanges = false
  let renderQueued = false
  let pendingDropScrollValue: number | null = null

  function syncDirtyState() {
    hasUnsavedChanges = settingsSnapshot(settings) !== savedSnapshot
    return hasUnsavedChanges
  }

  function markSettingsChanged() {
    syncDirtyState()
  }

  function commitSettings(restart = false) {
    if (!syncDirtyState()) return { changed: false, ok: true }
    const ok = saveBarSettings(settings, monitorIndex)
    if (!ok) {
      statusLabel.set_label("Save failed. Changes were not applied.")
      return { changed: true, ok: false }
    }
    savedSnapshot = settingsSnapshot(settings)
    hasUnsavedChanges = false
    queueLiveSettingsCss(settings, monitorIndex)
    statusLabel.set_label(`Monitor ${monitorIndex + 1} saved${restart ? " and applying…" : "."}`)
    if (restart) restartAgs()
    return { changed: true, ok: true }
  }
  let scrollGuardUntil = 0

  function markUserScroll() {
    scrollGuardUntil = Date.now() + 260
  }

  function isUserScrolling() {
    return Date.now() < scrollGuardUntil
  }
  const launcher = new Gtk.Button({
    css_classes: props.launcherCssClasses ?? [
      "bar-button",
      "appmenu-button",
      "bar-settings-launcher",
    ],
  })
  launcher.set_focusable(false)
  launcher.set_halign(props.launcherLabel ? Gtk.Align.FILL : Gtk.Align.CENTER)
  launcher.set_valign(Gtk.Align.CENTER)

  if (props.launcherLabel) {
    const launcherContent = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      css_classes: ["quick-action-content", "bar-settings-launcher-content"],
      spacing: 8,
    })

    launcherContent.append(new Gtk.Label({
      label: props.launcherIcon ?? APP_MENU_ICON,
      css_classes: ["quick-action-icon", "bar-settings-launcher-icon"],
      halign: Gtk.Align.CENTER,
      xalign: 0.5,
    }))
    launcherContent.append(new Gtk.Label({
      label: props.launcherLabel,
      css_classes: ["quick-action-label", "bar-settings-launcher-label"],
      halign: Gtk.Align.START,
      xalign: 0,
    }))

    launcher.set_child(launcherContent)
  } else {
    launcher.set_child(new Gtk.Label({ label: props.launcherIcon ?? APP_MENU_ICON }))
  }

  const content = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["dial-popover-card", "bar-settings-card", "bar-settings-window-card", "flow-editor-card"],
    spacing: 8,
    hexpand: true,
    vexpand: !props.embedded,
    valign: props.embedded ? Gtk.Align.START : Gtk.Align.FILL,
  })
  // Keep the popover inside the monitor bounds.
  // The scrolled area keeps the editor tall without preventing Gtk.Popover from opening.
  content.set_size_request(scaled(920), getContentHeight())

  const statusLabel = createLabel("", "bar-settings-status")

  const monitorPicker = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["bar-monitor-picker"],
    spacing: 8,
    hexpand: true,
  })

  function renderMonitorPicker() {
    clearBox(monitorPicker)
    const current = monitorProfile(monitorIndex)
    const top = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 })
    const copy = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2, hexpand: true })
    copy.append(createLabel("Display profile", "bar-monitor-picker-title"))
    copy.append(createLabel(
      `${current.connector} · ${current.width}×${current.height} · ${current.scale}× scale`,
      "bar-monitor-picker-detail",
    ))
    top.append(copy)
    monitorPicker.append(top)

    const profiles = connectedMonitorProfiles()
    const available = profiles.length > 0 ? profiles : [current]
    const buttons = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      css_classes: ["bar-monitor-profile-row"],
      spacing: 8,
      hexpand: true,
      homogeneous: true,
    })

    for (const profile of available) {
      const active = profile.slot === monitorIndex
      const button = new Gtk.Button({
        css_classes: ["bar-monitor-profile", ...(active ? ["active"] : [])],
        hexpand: true,
      })
      const inside = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 9 })
      const monitorIcon = createCenteredLabel(active ? "󰍹" : "󰹑", "bar-monitor-profile-icon")
      monitorIcon.set_hexpand(false)
      inside.append(monitorIcon)
      const text = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 1, hexpand: true })
      text.append(createLabel(profile.connector, "bar-monitor-profile-name"))
      text.append(createLabel(`${profile.model} · ${profile.width}×${profile.height}`, "bar-monitor-profile-meta"))
      inside.append(text)
      inside.append(createCenteredLabel(active ? "Editing" : `M${profile.slot + 1}`, active ? "bar-monitor-profile-active" : "bar-monitor-profile-index"))
      button.set_child(inside)
      button.set_tooltip_text(`Edit only ${profile.connector}. Each monitor keeps an independent Bar Flow profile.`)
      button.connect("clicked", () => switchMonitorProfile(profile.slot))
      buttons.append(button)
    }

    monitorPicker.append(buttons)
    monitorPicker.append(createLabel(
      "Changes here affect only the selected display profile. Connector-to-profile mapping is kept stable across restarts.",
      "bar-monitor-picker-note",
    ))
  }

  function switchMonitorProfile(nextIndex: number) {
    if (nextIndex === monitorIndex) return
    if (syncDirtyState()) {
      statusLabel.set_label("Apply or Reset the current monitor before switching profiles.")
      return
    }

    const previousIndex = monitorIndex
    monitorIndex = nextIndex
    settings = loadBarSettings(monitorIndex)
    savedSnapshot = settingsSnapshot(settings)
    hasUnsavedChanges = false
    selected = null
    hoveredTargetId = null
    windowShell.remove_css_class(`bar-settings-monitor-${previousIndex}`)
    windowShell.add_css_class(`bar-settings-monitor-${monitorIndex}`)
    if (settingsWindow) {
      settingsWindow.remove_css_class(`bar-settings-monitor-${previousIndex}`)
      settingsWindow.add_css_class(`bar-settings-monitor-${monitorIndex}`)
      settingsWindow.set_title(`Bar Flow - ${monitorProfile(monitorIndex).connector}`)
    }
    queueLiveSettingsCss(settings, monitorIndex)
    refreshSettingsWindowScale()
    render()
    statusLabel.set_label(`Editing ${monitorProfile(monitorIndex).connector} independently.`)
  }

  const editorHost = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["flow-editor-host"],
    spacing: 8,
    hexpand: true,
    vexpand: !props.embedded,
    valign: props.embedded ? Gtk.Align.START : Gtk.Align.FILL,
  })

  function queueRender() {
    if (renderQueued) {
      return
    }

    renderQueued = true

    idle(GLib.PRIORITY_DEFAULT_IDLE, () => {
      if (isUserScrolling()) {
        timeout(GLib.PRIORITY_DEFAULT, 280, () => {
          renderQueued = false

          if (!isUserScrolling()) {
            render()
          } else {
            queueRender()
          }

          return GLib.SOURCE_REMOVE
        })

        return GLib.SOURCE_REMOVE
      }

      renderQueued = false
      render()
      return GLib.SOURCE_REMOVE
    })
  }

  function getEditorScrollValue() {
    if (props.embedded) {
      const value = Number(props.getViewportScrollValue?.() ?? 0)
      return Number.isFinite(value) ? Math.max(0, value) : 0
    }
    return Math.max(0, scroll.get_vadjustment().get_value())
  }

  function captureDropScroll() {
    pendingDropScrollValue = getEditorScrollValue()
  }

  function restoreEditorScroll(value: number) {
    if (value <= 0 || isUserScrolling()) {
      return
    }

    if (props.embedded) {
      props.restoreViewportScrollValue?.(value)
      return
    }

    let attempt = 0
    const restore = () => {
      if (isUserScrolling()) {
        return GLib.SOURCE_REMOVE
      }

      const adjustment = scroll.get_vadjustment()
      const upper = adjustment.get_upper()
      const pageSize = adjustment.get_page_size()
      const maxValue = Math.max(0, upper - pageSize)

      adjustment.set_value(clamp(value, 0, maxValue))
      attempt += 1

      // GTK can perform one more allocation after children are replaced. A
      // short second pass keeps the same viewport without fighting real wheel
      // input (isUserScrolling() cancels it immediately).
      if (attempt < 2) {
        timeout(GLib.PRIORITY_DEFAULT, 24, restore)
      }

      return GLib.SOURCE_REMOVE
    }

    idle(GLib.PRIORITY_DEFAULT_IDLE, restore)
  }

  function render() {
    const previousScrollValue = pendingDropScrollValue ?? getEditorScrollValue()
    pendingDropScrollValue = null
    syncDirtyState()

    renderMonitorPicker()
    clearBox(editorHost)
    queueEditorTextCss(settings, monitorIndex, props.embedded)
    statusLabel.set_label(
      `Monitor ${monitorIndex + 1}: Drag widgets directly${selected ? ` • ${getSelectedLabel(selected)}` : ""}${hasUnsavedChanges ? " • unsaved" : ""}`,
    )

    const context: EditorContext = {
      settings,
      selected,
      hoveredTargetId,
      monitorIndex,
      setSelected: (nextSelected) => {
        selected = nextSelected
      },
      setHoveredTarget: (targetId) => {
        hoveredTargetId = targetId
      },
      render: queueRender,
      markChanged: markSettingsChanged,
      isUserScrolling,
      captureDropScroll,
      naturalLayout: props.embedded,
    }


    if (!props.embedded || props.showSizePanel) {
      editorHost.append(createSizePanel(settings, monitorIndex, () => {
        refreshSettingsWindowScale()
        markSettingsChanged()
        statusLabel.set_label(
          `Monitor ${monitorIndex + 1}: ${getSelectedLabel(selected)} • unsaved`,
        )
      }, Boolean(props.embedded)))
    }
    editorHost.append(createFlowEditor(context))
    restoreEditorScroll(previousScrollValue)
  }

  const header = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["bar-settings-header"],
    spacing: 8,
  })
  header.append(new Gtk.Label({ label: APP_MENU_ICON, css_classes: ["bar-settings-header-icon"] }))
  header.append(createLabel("Bar Flow · Per-monitor layout", "bar-settings-header-title"))

  const scroll = new Gtk.ScrolledWindow({
    css_classes: ["bar-settings-scroll", "flow-editor-scroll"],
    hexpand: true,
    vexpand: true,
    hscrollbar_policy: props.embedded ? Gtk.PolicyType.AUTOMATIC : Gtk.PolicyType.NEVER,
    vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
    min_content_width: props.embedded ? 0 : scaled(900),
    min_content_height: props.embedded ? 520 : getScrollContentHeight(),
  })
  ;(scroll as any).set_propagate_natural_height?.(false)
  ;(scroll as any).set_max_content_height?.(props.embedded ? -1 : getScrollContentHeight())

  const scrollGuard = new Gtk.EventControllerScroll({
    flags:
      Gtk.EventControllerScrollFlags.VERTICAL |
      Gtk.EventControllerScrollFlags.HORIZONTAL,
  })
  scrollGuard.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
  scrollGuard.connect("scroll", () => {
    markUserScroll()
    return false
  })
  scroll.add_controller(scrollGuard)

  // In embedded mode the editor belongs directly to the Theme layout so the
  // parent Theme ScrolledWindow owns the only vertical scroll. A GTK widget can
  // only have one parent, so do not attach editorHost to this internal scroller.
  if (!props.embedded) {
    scroll.set_child(editorHost)
  }

  const actions = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["bar-settings-actions"],
    spacing: 8,
    hexpand: true,
  })

  const saveButton = createButton("Save", ["bar-settings-action"])
  const restartButton = createButton("Apply", [
    "bar-settings-action",
    "bar-settings-action-primary",
  ])
  const resetButton = createButton("Reset Monitor", [
    "bar-settings-action",
    "bar-settings-action-danger",
  ])

  saveButton.connect("clicked", () => {
    const result = commitSettings(false)
    if (result.ok && !result.changed) statusLabel.set_label("No changes to save.")
  })

  restartButton.connect("clicked", () => {
    const result = commitSettings(true)
    if (result.ok && !result.changed) {
      statusLabel.set_label("No changes. Restarting AGS…")
      restartAgs()
    }
  })

  resetButton.connect("clicked", () => {
    settings = resetBarSettings(monitorIndex)
    queueLiveSettingsCss(settings, monitorIndex)
    selected = null
    hoveredTargetId = null
    savedSnapshot = settingsSnapshot(settings)
    hasUnsavedChanges = false
    render()
    statusLabel.set_label(
      `Monitor ${monitorIndex + 1} defaults restored. Restart AGS to apply.`,
    )
  })

  if (!props.applyOnly) {
    actions.append(saveButton)
  }
  actions.append(restartButton)
  actions.append(resetButton)

  const backgroundProtectedClasses = new Set([
    "flow-editor-widget-pick",
    "flow-editor-island-pick",
    "flow-editor-unused-widget",
    "flow-editor-tool-chip",
    "flow-editor-insert-bar",
    "flow-editor-step-button",
    "flow-editor-drag-handle",
  ])

  function isInsideInteractiveEditorControl(widget: Gtk.Widget | null) {
    let current = widget
    while (current) {
      const cssClasses: string[] = (current as any).get_css_classes?.() ?? []
      if (cssClasses.some(cssClass => backgroundProtectedClasses.has(cssClass))) {
        return true
      }
      if (current === content) break
      current = current.get_parent()
    }
    return false
  }

  const backgroundClick = new Gtk.GestureClick()
  backgroundClick.set_button(0)
  backgroundClick.set_propagation_phase(Gtk.PropagationPhase.BUBBLE)
  backgroundClick.connect("pressed", (_gesture, _n, x, y) => {
    const target = backgroundClick.get_widget() as Gtk.Widget | null
    if (!target) {
      return
    }

    const picked = target.pick(x, y, Gtk.PickFlags.DEFAULT)
    // pick() returns the deepest child (often the icon/label inside a button),
    // so inspect its ancestors before deciding this was a background click.
    // This prevents a press-to-drag from clearing selection and rebuilding the
    // scroller at the top before GTK can start the drag.
    if (isInsideInteractiveEditorControl(picked)) {
      return
    }

    if (selected || hoveredTargetId) {
      selected = null
      hoveredTargetId = null
      render()
    }
  })
  content.add_controller(backgroundClick)

  if (!props.embedded) {
    content.append(header)
  }
  if (!props.embedded || props.showMonitorPicker) {
    content.append(monitorPicker)
  }
  content.append(statusLabel)
  if (props.embedded) {
    content.append(editorHost)
  } else {
    content.append(scroll)
  }
  content.append(actions)

  const windowShell = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["bar-settings-window-shell"],
    hexpand: true,
    vexpand: !props.embedded,
    valign: props.embedded ? Gtk.Align.START : Gtk.Align.FILL,
  })
  windowShell.append(content)

  let settingsWindow: Gtk.Window | null = null

  function hideWindow() {
    const result = commitSettings(false)
    if (!result.ok) return "Bar Settings save failed"
    settingsWindow?.hide()
    if (result.changed) restartAgs()
    return "Bar Settings closed"
  }

  function showWindow() {
    const window = ensureSettingsWindow()

    if (!hasUnsavedChanges) {
      refreshSettingsBeforeOpen()
    }

    refreshSettingsWindowScale()
    render()
    window.present()
    props.onOpen?.()
    return "Bar Settings opened"
  }

  function toggleWindow() {
    const window = ensureSettingsWindow()

    if (window.get_visible()) {
      return hideWindow()
    }

    return showWindow()
  }

  function refreshSettingsWindowScale() {
    content.set_size_request(props.embedded ? -1 : scaled(920), props.embedded ? -1 : getContentHeight())
    ;(scroll as any).set_min_content_width?.(props.embedded ? 0 : scaled(900))
    ;(scroll as any).set_min_content_height?.(props.embedded ? -1 : getScrollContentHeight())
    ;(scroll as any).set_max_content_height?.(props.embedded ? -1 : getScrollContentHeight())

    if (settingsWindow) {
      settingsWindow.set_default_size(getWindowWidth(), getWindowHeight())
    }

    queueEditorTextCss(settings, monitorIndex, props.embedded)
  }

  function ensureSettingsWindow() {
    if (settingsWindow) {
      return settingsWindow
    }

    settingsWindow = new Gtk.Window({
      title: `Bar Flow - Monitor ${monitorIndex + 1}`,
      default_width: getWindowWidth(),
      default_height: getWindowHeight(),
      decorated: false,
      resizable: false,
      css_classes: ["bar-settings-window", `bar-settings-monitor-${monitorIndex}`],
    })

    ;(settingsWindow as any).set_application?.(app)
    settingsWindow.set_child(windowShell)

    const keyController = new Gtk.EventControllerKey()
    keyController.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
    keyController.connect("key-pressed", (_controller, keyval) => {
      if (keyval === Gdk.KEY_Escape) {
        hideWindow()
        return true
      }

      return false
    })
    settingsWindow.add_controller(keyController)

    settingsWindow.connect("close-request", () => {
      hideWindow()
      return true
    })

    return settingsWindow
  }

  function refreshSettingsBeforeOpen() {
    if (hasUnsavedChanges) {
      return
    }

    settings = loadBarSettings(monitorIndex)
    savedSnapshot = settingsSnapshot(settings)
    hasUnsavedChanges = false
    selected = null
    hoveredTargetId = null
    queueLiveSettingsCss(settings, monitorIndex)
    queueEditorTextCss(settings, monitorIndex, props.embedded)
  }

  ;(windowShell as any).barSettingsSelectMonitor = (nextIndex: number) => {
    if (nextIndex === monitorIndex) return true
    if (syncDirtyState()) {
      statusLabel.set_label("Apply or Reset the current monitor before switching profiles.")
      return false
    }
    switchMonitorProfile(nextIndex)
    return true
  }

  ;(windowShell as any).barSettingsHasChanges = () => syncDirtyState()
  ;(windowShell as any).barSettingsCommitChanges = () => commitSettings(false)

  if (props.embedded) {
    windowShell.add_css_class("bar-settings-window")
    windowShell.add_css_class("bar-settings-embedded")
    windowShell.add_css_class(`bar-settings-monitor-${monitorIndex}`)
    windowShell.add_css_class("studio-bar-editor")
    content.set_size_request(-1, -1)
    content.set_vexpand(false)
    content.set_valign(Gtk.Align.START)
    editorHost.set_hexpand(true)
    editorHost.set_vexpand(false)
    editorHost.set_valign(Gtk.Align.START)
    windowShell.set_vexpand(false)
    windowShell.set_valign(Gtk.Align.START)
    // The embedded editor intentionally does not append its ScrolledWindow. Its
    // natural height is measured by the parent Theme scroller, so Theme owns the
    // only vertical scrollbar for the whole configuration surface.
    scroll.set_min_content_width(0)
    scroll.set_min_content_height(-1)
    scroll.set_max_content_height(-1)
    scroll.set_vexpand(false)
    render()
    return windowShell
  }

  launcher.connect("clicked", scopeCallback(toggleWindow))

  barSettingsControllers.set(monitorIndex, {
    toggle: scopeCallback(toggleWindow),
    show: scopeCallback(showWindow),
    hide: scopeCallback(hideWindow),
  })

  render()

  return launcher
}
