import { onCleanup } from "../../lib/lifecycle"
import { timeout, idle } from "../../lib/lifecycle"
import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

import AppMenu from "../launcher/AppMenu"
import ThemeCenter from "../theme/ThemeCenter"
import PowerMenu from "../power-menu/PowerMenu"
import Island from "../../lib/ui/Island"
import {
  createSlideReveal,
  createCollapsingSlideReveal,
} from "../../lib/ui/Revealer"

import Battery, { hasBattery } from "../battery/Battery"
import Brightness from "../brightness/Brightness"
import Capture from "../capture/Capture"
import Bluetooth from "../bluetooth/Bluetooth"
import Clipboard from "../clipboard/Clipboard"
import IdleInhibitor from "../idle-inhibitor/IdleInhibitor"
import Clock from "../clock/Clock"
import Weather from "../weather/Weather"
import Music from "../music/Music"
import Network from "../network/Network"
import Notifications from "../notifications/Notifications"
import Cpu from "../cpu/Cpu"
import Memory from "../memory/Memory"
import Temperature from "../temperature/Temperature"
import Disk from "../disk/Disk"
import Updates from "../updates/Updates"
import Volume from "../volume/Volume"
import Workspaces from "../workspaces/Workspaces"
import SysTray from "../tray/Tray"
import PowerProfile from "../power-profile/PowerProfile"

import { getUiScale, withUserScale, type UiScale } from "../../theme"
import { hasVisibleMusic } from "../../services/music"
import {
  DEFAULT_BAR_SETTINGS,
  generateBarSettingsScss,
  generateBarHeightFitScss,
  getIslandCssClass,
  getMonitorSettingsKey,
  loadBarSettings,
  type BarModuleId,
  type BarSettings as RuntimeBarSettings,
  type LayoutIsland,
  type ModuleSlot,
} from "../../services/barSettings"

/* Types */

type VerticalBoxOptions = {
  cssClasses: string[]
  children?: Gtk.Widget[]
  spacing?: number
  halign?: Gtk.Align
  valign?: Gtk.Align
  hexpand?: boolean
  vexpand?: boolean
}

type ConditionalRevealOptions = {
  child: Gtk.Widget
  className: string
  delay: number
  interval?: number
  isVisible: () => boolean
}

type ModuleBuildContext = {
  monitorIndex: number
  monitorHeight: number
  ui: UiScale
  settings: RuntimeBarSettings
}

type ModuleDefinition = {
  id: BarModuleId
  islandClassName: string
  createIsland: (context: ModuleBuildContext, extraClassName?: string) => Gtk.Widget | null
  createContent: (context: ModuleBuildContext) => Gtk.Widget | null
}

/* Constants */

const { TOP, BOTTOM, LEFT } = Astal.WindowAnchor

const VERTICAL = Gtk.Orientation.VERTICAL
const SLIDE_FROM_LEFT = Gtk.RevealerTransitionType.SLIDE_RIGHT
const COLLAPSE_DOWN = Gtk.RevealerTransitionType.SLIDE_DOWN

const SHOW_MUSIC_ONLY_WHEN_ACTIVE = true

const BAR_SECTION_SPACING = 6
const ISLAND_GROUP_SPACING = 6

const BAR_WAVE_START_DELAY = 35
const BAR_WAVE_STEP_DELAY = 120
const BAR_WAVE_DURATION = 300
const MODULE_REVEAL_DURATION = 170

const MUSIC_VISIBILITY_DELAY = 520
const MUSIC_VISIBILITY_INTERVAL = 2200
const UPDATES_REVEAL_DELAY = 220
const BATTERY_VISIBILITY_DELAY = 280

/* 1080p bar fit
 *
 * Theme Studio and the global theme scale engine remain untouched. The bar
 * gets a monitor-height fit layer at runtime so 1080 logical pixels are the
 * neutral baseline and short laptop panels compact without changing saved
 * user scale. */

const BAR_FIT_REFERENCE_HEIGHT = 1080

function getDirectDrawFitMultiplier(ui: UiScale, monitorHeight: number) {
  if (monitorHeight > BAR_FIT_REFERENCE_HEIGHT) return 1

  const targetFactor = Math.max(0.82, Math.min(1, monitorHeight / BAR_FIT_REFERENCE_HEIGHT))
  return Math.max(0.7, Math.min(1, targetFactor / Math.max(ui.factor, 0.01)))
}

/* Runtime settings CSS */

const STARTUP_SETTINGS_CSS_PRIORITY =
  ((Gtk as any).STYLE_PROVIDER_PRIORITY_APPLICATION ?? 600) + 110

let startupSettingsCssProvider: Gtk.CssProvider | null = null
let startupSettingsCssToken = 0
const startupCssByMonitor = new Map<number, string>()

function ensureStartupSettingsCssProvider() {
  const display = Gdk.Display.get_default()

  if (!display) {
    return null
  }

  if (!startupSettingsCssProvider) {
    startupSettingsCssProvider = new Gtk.CssProvider()
    Gtk.StyleContext.add_provider_for_display(
      display,
      startupSettingsCssProvider,
      STARTUP_SETTINGS_CSS_PRIORITY,
    )
  }

  return startupSettingsCssProvider
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

function loadStartupSettingsCss(settings: RuntimeBarSettings, monitorIndex: number, monitorHeight: number) {
  const provider = ensureStartupSettingsCssProvider()

  if (!provider) {
    return
  }

  const monitorKey = getMonitorSettingsKey(monitorIndex)
  const fitCss = generateBarHeightFitScss(settings, monitorKey, monitorHeight)

  startupCssByMonitor.set(
    monitorIndex,
    `${generateBarSettingsScss(settings, monitorKey)}${fitCss}`,
  )
  loadCssData(provider, [...startupCssByMonitor.values()].join("\n"))
}

function applyStartupSettingsCss(settings: RuntimeBarSettings, monitorIndex: number, monitorHeight: number) {
  startupSettingsCssToken += 1
  const token = startupSettingsCssToken

  // Apply once immediately so saved scale is available on the first frame.
  loadStartupSettingsCss(settings, monitorIndex, monitorHeight)

  // Apply once more after GTK has realized the window tree. This keeps startup
  // stable without depending on the generated SCSS import alone.
  idle(GLib.PRIORITY_DEFAULT_IDLE, () => {
    if (token !== startupSettingsCssToken) {
      return GLib.SOURCE_REMOVE
    }

    loadStartupSettingsCss(settings, monitorIndex, monitorHeight)

    return GLib.SOURCE_REMOVE
  })
}

/* Scheduling */

function scheduleOnce(delay: number, callback: () => void) {
  return timeout(GLib.PRIORITY_DEFAULT, delay, () => {
    callback()
    return GLib.SOURCE_REMOVE
  })
}

function scheduleLoop(interval: number, callback: () => void) {
  return timeout(GLib.PRIORITY_DEFAULT, interval, () => {
    callback()
    return GLib.SOURCE_CONTINUE
  })
}

/* GTK helpers */

function appendChildren(box: Gtk.Box, children: Gtk.Widget[] = []) {
  for (const child of children) {
    box.append(child)
  }

  return box
}

function createVerticalBox(options: VerticalBoxOptions) {
  const box = new Gtk.Box({
    orientation: VERTICAL,
    css_classes: options.cssClasses,
    spacing: options.spacing ?? 0,
    halign: options.halign ?? Gtk.Align.FILL,
    valign: options.valign ?? Gtk.Align.FILL,
    hexpand: options.hexpand ?? false,
    vexpand: options.vexpand ?? false,
  })

  return appendChildren(box, options.children)
}

function centerWidgets(widgets: Gtk.Widget[]) {
  for (const widget of widgets) {
    widget.set_halign(Gtk.Align.CENTER)
    widget.set_hexpand(false)
  }
}

function stretchWidgets(widgets: Gtk.Widget[]) {
  for (const widget of widgets) {
    widget.set_halign(Gtk.Align.FILL)
    widget.set_hexpand(true)
  }
}

/* Reveal helpers */

function createModuleReveal(
  child: Gtk.Widget,
  className: string,
  visible = false,
) {
  child.set_halign(Gtk.Align.FILL)
  child.set_hexpand(true)

  const reveal = createCollapsingSlideReveal({
    child,
    visible,
    duration: MODULE_REVEAL_DURATION,
    className,
    edgeTransition: SLIDE_FROM_LEFT,
    collapseTransition: COLLAPSE_DOWN,
  })

  reveal.revealer.set_halign(Gtk.Align.FILL)
  reveal.revealer.set_hexpand(true)
  return reveal
}

function createDelayedReveal(
  child: Gtk.Widget,
  className: string,
  delay: number,
) {
  const reveal = createModuleReveal(child, className)

  scheduleOnce(delay, () => {
    reveal.show()
  })

  return reveal.revealer
}

type BarWaveEntry = {
  show: () => void
}

type BarWaveSequence = {
  entries: BarWaveEntry[]
}

function createBarWaveReveal(
  child: Gtk.Widget,
  sequence: BarWaveSequence,
  extraClassName = "",
) {
  const reveal = createSlideReveal({
    child,
    visible: false,
    duration: BAR_WAVE_DURATION,
    className: `bar-wave-reveal ${extraClassName}`.trim(),
    transition: SLIDE_FROM_LEFT,
  })

  child.set_halign(Gtk.Align.FILL)
  child.set_hexpand(true)
  reveal.revealer.set_halign(Gtk.Align.FILL)
  reveal.revealer.set_hexpand(true)
  sequence.entries.push({ show: reveal.show })

  return reveal.revealer
}

function scheduleBarWave(sequence: BarWaveSequence) {
  // Entries are registered in the same order they are rendered: Theme first,
  // then configured Top, Middle and Bottom islands sorted by their live order.
  // Keeping the scheduler order-agnostic makes the wave follow layout edits
  // automatically instead of assigning special treatment to named modules.
  sequence.entries.forEach((entry, index) => {
    scheduleOnce(BAR_WAVE_START_DELAY + index * BAR_WAVE_STEP_DELAY, entry.show)
  })
}

function createConditionalReveal(options: ConditionalRevealOptions) {
  const reveal = createModuleReveal(options.child, options.className)

  function refreshVisibility() {
    reveal.setVisible(options.isVisible())
  }

  scheduleOnce(options.delay, refreshVisibility)

  if (options.interval !== undefined) {
    scheduleLoop(options.interval, refreshVisibility)
  }

  return reveal.revealer
}


function createVisibilityReveal(child: Gtk.Widget, className: string) {
  const reveal = createModuleReveal(child, className, child.get_visible())

  function refreshVisibility() {
    reveal.setVisible(child.get_visible())
  }

  child.connect("notify::visible", refreshVisibility)
  scheduleOnce(0, refreshVisibility)

  return reveal.revealer
}

function createChildrenVisibilityReveal(
  child: Gtk.Widget,
  children: Gtk.Widget[],
  className: string,
) {
  const reveal = createModuleReveal(
    child,
    className,
    children.some((item) => item.get_visible()),
  )

  function refreshVisibility() {
    reveal.setVisible(children.some((item) => item.get_visible()))
  }

  for (const item of children) {
    item.connect("notify::visible", refreshVisibility)
  }

  scheduleOnce(0, refreshVisibility)

  return reveal.revealer
}

/* Module content */

function createThemeIsland(context: ModuleBuildContext) {
  return (
    <Island className="appmenu-island theme-island">
      <ThemeCenter
        monitorIndex={context.monitorIndex}
        monitorHeight={context.monitorHeight}
      />
    </Island>
  ) as Gtk.Widget
}

function createWorkspaceContent(monitorIndex: number) {
  return <Workspaces monitorIndex={monitorIndex} /> as Gtk.Widget
}

function createTrayContent() {
  return SysTray() as Gtk.Widget
}

function createMusicContent(ui: UiScale) {
  return Music({ ui }) as Gtk.Widget
}

function createUpdatesContent() {
  return Updates({ island: false }) as Gtk.Widget
}

function createNetworkContent() {
  return Network() as Gtk.Widget
}

function createBluetoothContent() {
  return Bluetooth() as Gtk.Widget
}

function createClipboardContent() {
  return Clipboard() as Gtk.Widget
}

function createIdleInhibitorContent() {
  return IdleInhibitor() as Gtk.Widget
}

function createPowerProfileContent() {
  return PowerProfile() as Gtk.Widget
}

function createVolumeContent() {
  return Volume() as Gtk.Widget
}

function createCaptureContent() {
  return Capture() as Gtk.Widget
}

function createNotificationsContent() {
  return Notifications() as Gtk.Widget
}

function createWeatherContent() {
  return Weather() as Gtk.Widget
}

function createDiskContent(ui: UiScale) {
  return Disk({ ui }) as Gtk.Widget
}

function createCpuContent(ui: UiScale) {
  return Cpu({ ui }) as Gtk.Widget
}

function createMemoryContent(ui: UiScale) {
  return Memory({ ui }) as Gtk.Widget
}

function createTemperatureContent(ui: UiScale) {
  return Temperature({ ui }) as Gtk.Widget
}

function createBatteryContent(ui: UiScale) {
  if (!hasBattery()) {
    return null
  }

  return <Battery ui={ui} /> as Gtk.Widget
}

function createBrightnessContent(ui: UiScale) {
  return Brightness({ ui }) as Gtk.Widget
}

function createClockContent() {
  return <Clock /> as Gtk.Widget
}

function updateContainerVisibility(container: Gtk.Widget, children: Gtk.Widget[]) {
  const visible = children.some((child) => child.get_visible())
  container.set_visible(visible)
}

function bindContainerVisibility(container: Gtk.Widget, children: Gtk.Widget[]) {
  updateContainerVisibility(container, children)

  for (const child of children) {
    child.connect("notify::visible", () => {
      updateContainerVisibility(container, children)
    })
  }

  scheduleOnce(0, () => {
    updateContainerVisibility(container, children)
  })
}

function createStyledIsland(
  className: string,
  children: Gtk.Widget[],
  spacing = ISLAND_GROUP_SPACING,
) {
  if (children.length === 0) {
    return null
  }

  centerWidgets(children)

  const island = (
    <Island className={className} spacing={spacing}>
      {children}
    </Island>
  ) as Gtk.Widget

  bindContainerVisibility(island, children)

  return island
}

/* Single-module island wrappers */

function createWorkspaceIsland(context: ModuleBuildContext, extraClassName = "") {
  return createStyledIsland(
    `workspace-island ${extraClassName}`,
    [createWorkspaceContent(context.monitorIndex)],
  )
}

function createTrayIsland(_context: ModuleBuildContext, extraClassName = "") {
  return createStyledIsland(
    `tray-island ${extraClassName}`,
    [createTrayContent()],
    ISLAND_GROUP_SPACING,
  )
}

function createMediaIsland(context: ModuleBuildContext, extraClassName = "") {
  const island = createStyledIsland(
    `media-island ${extraClassName}`,
    [createMusicContent(context.ui)],
    ISLAND_GROUP_SPACING,
  )

  if (!island) {
    return null
  }

  return createConditionalReveal({
    child: island,
    className: "media-reveal",
    delay: MUSIC_VISIBILITY_DELAY,
    interval: MUSIC_VISIBILITY_INTERVAL,
    isVisible: () => !SHOW_MUSIC_ONLY_WHEN_ACTIVE || hasVisibleMusic(),
  })
}

function createUpdatesIsland(_context: ModuleBuildContext, extraClassName = "") {
  const updates = Updates({ island: true }) as Gtk.Widget

  for (const cssClass of extraClassName.split(" ").filter(Boolean)) {
    updates.add_css_class(cssClass)
  }

  return createVisibilityReveal(updates, "updates-reveal")
}

function createConnectionIsland(
  content: Gtk.Widget,
  extraClassName = "",
) {
  return createStyledIsland(
    `connectivity-island connection-island ${extraClassName}`,
    [content],
  )
}

function createNetworkIsland(_context: ModuleBuildContext, extraClassName = "") {
  return createConnectionIsland(createNetworkContent(), extraClassName)
}

function createBluetoothIsland(_context: ModuleBuildContext, extraClassName = "") {
  return createConnectionIsland(createBluetoothContent(), extraClassName)
}

function createClipboardIsland(_context: ModuleBuildContext, extraClassName = "") {
  return createConnectionIsland(createClipboardContent(), extraClassName)
}

function createIdleInhibitorIsland(_context: ModuleBuildContext, extraClassName = "") {
  return createConnectionIsland(createIdleInhibitorContent(), extraClassName)
}

function createVolumeIsland(_context: ModuleBuildContext, extraClassName = "") {
  return createConnectionIsland(createVolumeContent(), extraClassName)
}

function createCaptureIsland(_context: ModuleBuildContext, extraClassName = "") {
  return createConnectionIsland(createCaptureContent(), extraClassName)
}

function createPowerProfileIsland(_context: ModuleBuildContext, extraClassName = "") {
  return createConnectionIsland(createPowerProfileContent(), extraClassName)
}

function createNotificationsIsland(_context: ModuleBuildContext, extraClassName = "") {
  return createConnectionIsland(createNotificationsContent(), extraClassName)
}

function createWeatherIsland(_context: ModuleBuildContext, extraClassName = "") {
  return createStyledIsland(
    `weather-island ${extraClassName}`,
    [createWeatherContent()],
  )
}

function createDiskIsland(context: ModuleBuildContext, extraClassName = "") {
  return createStyledIsland(
    `disk-island speed-island ${extraClassName}`,
    [createDiskContent(context.ui)],
  )
}

function createHardwareIsland(
  content: Gtk.Widget,
  extraClassName = "",
) {
  return createStyledIsland(
    `hardware-island speed-island ${extraClassName}`,
    [content],
  )
}

function createCpuIsland(context: ModuleBuildContext, extraClassName = "") {
  return createHardwareIsland(createCpuContent(context.ui), extraClassName)
}

function createMemoryIsland(context: ModuleBuildContext, extraClassName = "") {
  return createHardwareIsland(createMemoryContent(context.ui), extraClassName)
}

function createTemperatureIsland(context: ModuleBuildContext, extraClassName = "") {
  return createHardwareIsland(createTemperatureContent(context.ui), extraClassName)
}

function createBrightnessIsland(context: ModuleBuildContext, extraClassName = "") {
  return createHardwareIsland(createBrightnessContent(context.ui), extraClassName)
}

function createBatteryIsland(context: ModuleBuildContext, extraClassName = "") {
  const content = createBatteryContent(context.ui)

  if (!content) {
    return null
  }

  const island = createStyledIsland(
    `power-island speed-island ${extraClassName}`,
    [content],
  )

  if (!island) {
    return null
  }

  return createConditionalReveal({
    child: island,
    className: "battery-reveal",
    delay: BATTERY_VISIBILITY_DELAY,
    isVisible: hasBattery,
  })
}

function createClockIsland(_context: ModuleBuildContext, extraClassName = "") {
  return createStyledIsland(
    `clock-island ${extraClassName}`,
    [createClockContent()],
  )
}


/* Module registry */

const MODULE_DEFINITIONS: readonly ModuleDefinition[] = [
  {
    id: "workspaces",
    islandClassName: "workspace-island",
    createIsland: createWorkspaceIsland,
    createContent: ({ monitorIndex }) => createWorkspaceContent(monitorIndex),
  },
  {
    id: "tray",
    islandClassName: "tray-island",
    createIsland: createTrayIsland,
    createContent: () => createTrayContent(),
  },
  {
    id: "music",
    islandClassName: "media-island",
    createIsland: createMediaIsland,
    createContent: ({ ui }) => createMusicContent(ui),
  },
  {
    id: "updates",
    islandClassName: "updates-island",
    createIsland: createUpdatesIsland,
    createContent: () => createUpdatesContent(),
  },
  {
    id: "network",
    islandClassName: "connectivity-island connection-island",
    createIsland: createNetworkIsland,
    createContent: () => createNetworkContent(),
  },
  {
    id: "bluetooth",
    islandClassName: "connectivity-island connection-island",
    createIsland: createBluetoothIsland,
    createContent: () => createBluetoothContent(),
  },
  {
    id: "clipboard",
    islandClassName: "connectivity-island connection-island",
    createIsland: createClipboardIsland,
    createContent: () => createClipboardContent(),
  },
  {
    id: "idleInhibitor",
    islandClassName: "connectivity-island connection-island",
    createIsland: createIdleInhibitorIsland,
    createContent: () => createIdleInhibitorContent(),
  },
  {
    id: "volume",
    islandClassName: "connectivity-island connection-island",
    createIsland: createVolumeIsland,
    createContent: () => createVolumeContent(),
  },
  {
    id: "capture",
    islandClassName: "connectivity-island connection-island",
    createIsland: createCaptureIsland,
    createContent: () => createCaptureContent(),
  },
  {
    id: "powerProfile",
    islandClassName: "connectivity-island connection-island",
    createIsland: createPowerProfileIsland,
    createContent: () => createPowerProfileContent(),
  },
  {
    id: "notifications",
    islandClassName: "connectivity-island connection-island",
    createIsland: createNotificationsIsland,
    createContent: () => createNotificationsContent(),
  },
  {
    id: "weather",
    islandClassName: "weather-island",
    createIsland: createWeatherIsland,
    createContent: () => createWeatherContent(),
  },
  {
    id: "cpu",
    islandClassName: "hardware-island speed-island",
    createIsland: createCpuIsland,
    createContent: ({ ui }) => createCpuContent(ui),
  },
  {
    id: "memory",
    islandClassName: "hardware-island speed-island",
    createIsland: createMemoryIsland,
    createContent: ({ ui }) => createMemoryContent(ui),
  },
  {
    id: "temperature",
    islandClassName: "hardware-island speed-island",
    createIsland: createTemperatureIsland,
    createContent: ({ ui }) => createTemperatureContent(ui),
  },
  {
    id: "disk",
    islandClassName: "disk-island speed-island",
    createIsland: createDiskIsland,
    createContent: ({ ui }) => createDiskContent(ui),
  },
  {
    id: "brightness",
    islandClassName: "hardware-island speed-island",
    createIsland: createBrightnessIsland,
    createContent: ({ ui }) => createBrightnessContent(ui),
  },
  {
    id: "battery",
    islandClassName: "power-island speed-island",
    createIsland: createBatteryIsland,
    createContent: ({ ui }) => createBatteryContent(ui),
  },
  {
    id: "clock",
    islandClassName: "clock-island",
    createIsland: createClockIsland,
    createContent: () => createClockContent(),
  },
]

function getModuleDefinition(id: BarModuleId) {
  return MODULE_DEFINITIONS.find((definition) => definition.id === id)
}

function getSingleModuleIslandClass(moduleId: BarModuleId) {
  return getModuleDefinition(moduleId)?.islandClassName ?? "layout-group-island"
}

function createFloatingModule(moduleId: BarModuleId, context: ModuleBuildContext) {
  const definition = getModuleDefinition(moduleId)
  const content = definition?.createContent(context)

  if (!content) {
    return null
  }

  switch (moduleId) {
    case "music":
      return createConditionalReveal({
        child: content,
        className: "media-reveal",
        delay: MUSIC_VISIBILITY_DELAY,
        interval: MUSIC_VISIBILITY_INTERVAL,
        isVisible: () => !SHOW_MUSIC_ONLY_WHEN_ACTIVE || hasVisibleMusic(),
      })
    case "updates":
      return content
    case "battery":
      return createConditionalReveal({
        child: content,
        className: "battery-reveal",
        delay: BATTERY_VISIBILITY_DELAY,
        isVisible: hasBattery,
      })
    default:
      return content
  }
}

function createFloatingGroup(modules: BarModuleId[], context: ModuleBuildContext) {
  const children = modules.flatMap((moduleId) => {
    const widget = createFloatingModule(moduleId, context)

    return widget ? [widget] : []
  })

  if (children.length === 0) {
    return null
  }

  centerWidgets(children)

  return createVerticalBox({
    cssClasses: ["layout-floating-group"],
    spacing: ISLAND_GROUP_SPACING,
    halign: Gtk.Align.CENTER,
    children,
  })
}

function createGroupedIsland(layoutIsland: LayoutIsland, context: ModuleBuildContext) {
  const modules = layoutIsland.modules.filter((moduleId) => {
    return moduleId !== "powerMenu" && context.settings.modules[moduleId]?.enabled
  })

  if (modules.length === 0) {
    return null
  }

  const layoutClass = getIslandCssClass(layoutIsland.id)

  if (!layoutIsland.boxed) {
    return createFloatingGroup(modules, context)
  }

  if (modules.length === 1) {
    const definition = getModuleDefinition(modules[0])

    return definition?.createIsland(context, layoutClass) ?? null
  }

  const children = modules.flatMap((moduleId) => {
    const definition = getModuleDefinition(moduleId)
    const widget = definition?.createContent(context)

    return widget ? [widget] : []
  })

  const primaryClass = getSingleModuleIslandClass(modules[0])

  const island = createStyledIsland(
    `layout-group-island ${primaryClass} ${layoutClass}`,
    children,
    ISLAND_GROUP_SPACING,
  )

  if (!island) {
    return null
  }

  return createChildrenVisibilityReveal(
    island,
    children,
    "layout-island-reveal",
  )
}

function createConfiguredIslands(
  slot: ModuleSlot,
  context: ModuleBuildContext,
  sequence: BarWaveSequence,
) {
  return context.settings.islands
    .filter((island) => island.enabled && island.slot === slot)
    .sort((left, right) => left.order - right.order)
    .flatMap((island) => {
      const widget = createGroupedIsland(island, context)

      return widget ? [createBarWaveReveal(widget, sequence)] : []
    })
}

/* Sections */

function createCenterSpacer() {
  return createVerticalBox({
    cssClasses: ["bar-section", "bar-center-spacer"],
    vexpand: true,
  })
}

function createBarSection(
  className: string,
  children: Gtk.Widget[],
) {
  stretchWidgets(children)

  return createVerticalBox({
    cssClasses: ["bar-section", className],
    spacing: BAR_SECTION_SPACING,
    halign: Gtk.Align.FILL,
    hexpand: true,
    children,
  })
}

function createTopSection(context: ModuleBuildContext, sequence: BarWaveSequence) {
  return createBarSection(
    "bar-top",
    createConfiguredIslands("top", context, sequence),
  )
}

function createMiddleSection(context: ModuleBuildContext, sequence: BarWaveSequence) {
  const children = createConfiguredIslands("middle", context, sequence)

  if (children.length === 0) {
    return null
  }

  return createBarSection("bar-middle", children)
}

function createBottomSection(context: ModuleBuildContext, sequence: BarWaveSequence) {
  return createBarSection(
    "bar-bottom",
    createConfiguredIslands("bottom", context, sequence),
  )
}

/* Bar content */

function createBarContent(context: ModuleBuildContext, sequence: BarWaveSequence) {
  const topSection = createTopSection(context, sequence)
  const middleSection = createMiddleSection(context, sequence)
  const bottomSection = createBottomSection(context, sequence)
  const children = middleSection
    ? [
        topSection,
        createCenterSpacer(),
        middleSection,
        createCenterSpacer(),
        bottomSection,
      ]
    : [
        topSection,
        createCenterSpacer(),
        bottomSection,
      ]

  return createVerticalBox({
    cssClasses: ["bar-modules-root"],
    hexpand: true,
    vexpand: true,
    children,
  })
}

/* Public component */

export default function Bar(gdkmonitor: Gdk.Monitor, monitorIndex: number) {
  onCleanup(() => {
    startupCssByMonitor.delete(monitorIndex)
    if (startupSettingsCssProvider) loadCssData(startupSettingsCssProvider, [...startupCssByMonitor.values()].join("\n"))
  })
  const settings = loadBarSettings(monitorIndex)
  const geometry = gdkmonitor.get_geometry()
  const userScale = settings.global.scaleMd / DEFAULT_BAR_SETTINGS.global.scaleMd
  const baseUi = getUiScale(gdkmonitor, monitorIndex)
  const fitMultiplier = getDirectDrawFitMultiplier(baseUi, geometry.height)
  // CSS owns normal widget geometry. Direct-drawn surfaces need the same short-
  // monitor fit explicitly because their canvas sizes are integer geometry.
  const scaledUi = withUserScale(baseUi, userScale * fitMultiplier)
  const dialScale = settings.dials.dialSize / DEFAULT_BAR_SETTINGS.dials.dialSize
  const ui: UiScale = {
    ...scaledUi,
    dialSize: Math.max(1, Math.round(scaledUi.dialSize * dialScale)),
    dialArcWidth: Math.max(1, Math.round(scaledUi.dialArcWidth * dialScale)),
  }
  applyStartupSettingsCss(settings, monitorIndex, geometry.height)

  const context = { monitorIndex, monitorHeight: geometry.height, ui, settings }
  // Register application controllers for keyboard / IPC without changing the
  // visible bar composition. Theme keeps the existing top icon.
  AppMenu({ monitorIndex, monitorHeight: geometry.height })
  PowerMenu({ monitorIndex, monitorHeight: geometry.height })
  const waveSequence: BarWaveSequence = { entries: [] }
  const themeEntrance = createBarWaveReveal(
    createThemeIsland(context),
    waveSequence,
    "bar-wave-theme",
  )
  const modules = createBarContent(context, waveSequence)
  scheduleBarWave(waveSequence)
  const scroll = new Gtk.ScrolledWindow({
    css_classes: ["bar-scroll"],
    hscrollbar_policy: Gtk.PolicyType.NEVER,
    vscrollbar_policy: Gtk.PolicyType.NEVER,
    propagate_natural_height: false,
    propagate_natural_width: true,
    // Keep wheel/touch scrolling available without reserving an invisible
    // scrollbar gutter beside the edge-attached islands.
    overlay_scrolling: false,
    hexpand: true,
    vexpand: true,
  })
  scroll.set_child(modules)
  const content = createVerticalBox({
    cssClasses: ["bar-root", "portable-bar-shell"],
    spacing: BAR_SECTION_SPACING,
    vexpand: true,
    children: [themeEntrance, scroll],
  })

  // Reserve a small transparent strip outside the visible bar. Because it is
  // part of the exclusive layer surface, tiled clients keep a clean gap from
  // the bar without adding padding inside any island.
  const clientGap = new Gtk.Box({ css_classes: ["bar-client-gap"] })
  const clientGapWidth = Math.max(3, Math.round(geometry.width * 0.0031 * Math.max(0.75, Math.min(userScale, 1.6))))
  clientGap.set_size_request(clientGapWidth, -1)
  const barSurface = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["bar-surface-root"],
    vexpand: true,
  })
  barSurface.append(content)
  barSurface.append(clientGap)

  const window = new Astal.Window({
    application: app,
    namespace: `ags-vertical-bar-${monitorIndex}`,
    css_classes: ["Bar", "edge-attached", `monitor-${monitorIndex}`, ui.cssClass],
    gdkmonitor,
    layer: Astal.Layer.TOP,
    exclusivity: Astal.Exclusivity.EXCLUSIVE,
    anchor: TOP | BOTTOM | LEFT,
    visible: true,
  })
  window.set_child(barSurface)
  return window
}
