import { CONFIG_HOME } from "../lib/paths"
import GLib from "gi://GLib?version=2.0"
import { getHomeDir, readFile, readJson, shellQuote, spawn, writeFile } from "../lib/shell"

/* =============================================================================
 * Types
 * ============================================================================= */

type EdgeBox = {
  top: number
  right: number
  bottom: number
  left: number
}

type GlobalSettings = {
  scaleSm: number
  scaleMd: number
  scaleLg: number
  scaleXl: number

  barWidth: number
  islandWidth: number

  barPadding: EdgeBox
  edgeBarPadding: EdgeBox
}

type AppMenuSettings = {
  islandWidth: number
  islandPadding: EdgeBox

  buttonWidth: number
  buttonHeight: number
  buttonRadius: number
  buttonPadding: EdgeBox
  buttonMargin: EdgeBox

  iconSize: number
  iconPadding: EdgeBox
  iconMargin: EdgeBox
}

type WorkspacesSettings = {
  islandWidth: number
  islandPadding: EdgeBox

  contentWidth: number
  contentPadding: EdgeBox

  buttonWidth: number
  buttonHeight: number

  indicatorWidth: number
}

type TraySettings = {
  islandWidth: number
  islandPadding: EdgeBox

  moduleWidth: number
  iconSize: number
  spacing: number
}

type UpdatesSettings = {
  islandWidth: number
  islandPadding: EdgeBox

  buttonWidth: number
  buttonHeight: number
  buttonRadius: number

  iconSize: number
  countSize: number
  countMargin: EdgeBox
}

type MusicSettings = {
  islandWidth: number
  islandPadding: EdgeBox

  moduleWidth: number
  buttonWidth: number
  buttonHeight: number
  buttonRadius: number

  visualizerWidth: number
}

type ConnectivitySettings = {
  islandWidth: number
  islandPadding: EdgeBox

  moduleWidth: number
  buttonWidth: number
  buttonHeight: number
  buttonRadius: number

  iconWidth: number
  iconHeight: number
  iconSize: number
  iconPadding: EdgeBox
  iconMargin: EdgeBox
}

type WeatherSettings = {
  islandWidth: number
  islandPadding: EdgeBox

  moduleWidth: number
  buttonWidth: number
  buttonHeight: number
  buttonRadius: number
  buttonPadding: EdgeBox
  buttonMargin: EdgeBox

  contentPadding: EdgeBox

  iconSize: number
  iconPadding: EdgeBox
  iconMargin: EdgeBox

  tempSize: number
  tempPadding: EdgeBox
  tempMargin: EdgeBox

  popoverWidth: number
}

type DialsSettings = {
  islandWidth: number
  islandPadding: EdgeBox

  batteryIslandWidth: number
  batteryIslandPadding: EdgeBox

  dialSize: number
  groupWidth: number
}

type DiskSettings = {
  islandWidth: number
  islandPadding: EdgeBox

  moduleWidth: number
  dialSize: number
  popoverWidth: number
}

type ClockSettings = {
  islandWidth: number
  islandPadding: EdgeBox

  wrapperWidth: number
  wrapperHeight: number

  labelWidth: number
  labelHeight: number
  labelSize: number
}

type ExitSettings = {
  islandWidth: number
  islandPadding: EdgeBox

  buttonWidth: number
  buttonHeight: number
  buttonRadius: number
  iconSize: number
}

export type ModuleSlot = "top" | "middle" | "bottom"

export type BarModuleId =
  | "workspaces"
  | "tray"
  | "music"
  | "updates"
  | "network"
  | "bluetooth"
  | "clipboard"
  | "idleInhibitor"
  | "volume"
  | "capture"
  | "powerProfile"
  | "notifications"
  | "weather"
  | "temperature"
  | "cpu"
  | "memory"
  | "disk"
  | "brightness"
  | "battery"
  | "clock"
  | "powerMenu"

export type ModuleSettings = {
  enabled: boolean
  slot: ModuleSlot
  order: number
}

export type LayoutIsland = {
  id: string
  enabled: boolean
  slot: ModuleSlot
  order: number
  width: number
  boxed: boolean
  modules: BarModuleId[]
}

export type ModulesSettings = Record<BarModuleId, ModuleSettings>

export type BarSettings = {
  islands: LayoutIsland[]
  modules: ModulesSettings

  global: GlobalSettings
  appMenu: AppMenuSettings
  workspaces: WorkspacesSettings
  tray: TraySettings
  updates: UpdatesSettings
  music: MusicSettings
  connectivity: ConnectivitySettings
  weather: WeatherSettings
  dials: DialsSettings
  disk: DiskSettings
  clock: ClockSettings
  exit: ExitSettings
}

export type BarSettingsStore = {
  version: number
  monitors: Record<string, BarSettings>
}

/* =============================================================================
 * Constants
 * ============================================================================= */

const AGS_CONFIG_DIR = `${CONFIG_HOME}/ags`
const GENERATED_DIR = `${AGS_CONFIG_DIR}/generated`

export const BAR_SETTINGS_JSON_PATH = `${GENERATED_DIR}/bar-settings.json`

const STORE_VERSION = 20
export const MAX_MONITOR_PROFILES = 32

export const MODULE_SLOTS: readonly ModuleSlot[] = ["top", "middle", "bottom"]

export const BAR_MODULE_IDS: readonly BarModuleId[] = [
  "workspaces",
  "tray",
  "music",
  "updates",
  "network",
  "bluetooth",
  "clipboard",
  "idleInhibitor",
  "volume",
  "capture",
  "powerProfile",
  "notifications",
  "weather",
  "temperature",
  "cpu",
  "memory",
  "disk",
  "brightness",
  "battery",
  "clock",
  "powerMenu",
]

const ZERO_EDGE: EdgeBox = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
}

/* =============================================================================
 * Defaults
 * ============================================================================= */

function moduleSettings(slot: ModuleSlot, order: number): ModuleSettings {
  return {
    enabled: true,
    slot,
    order,
  }
}

function createDefaultIsland(
  id: string,
  slot: ModuleSlot,
  order: number,
  modules: BarModuleId[],
): LayoutIsland {
  return {
    id,
    enabled: true,
    slot,
    order,
    width: 3,
    boxed: true,
    modules,
  }
}

export const DEFAULT_BAR_SETTINGS: BarSettings = {
  islands: [
    createDefaultIsland("island-workspaces", "top", 10, ["workspaces"]),
    createDefaultIsland("island-tray", "top", 15, ["tray"]),
    createDefaultIsland("island-music", "top", 20, ["music"]),
    createDefaultIsland("island-updates", "top", 30, ["updates"]),

    createDefaultIsland("island-connectivity", "bottom", 10, [
      "network",
      "bluetooth",
      "volume",
    ]),
    createDefaultIsland("island-system", "bottom", 20, [
      "temperature",
      "cpu",
      "memory",
    ]),
    createDefaultIsland("island-battery", "bottom", 30, ["battery"]),
    createDefaultIsland("island-weather", "bottom", 35, ["weather"]),
    createDefaultIsland("island-clock", "bottom", 40, ["clock"]),
  ],

  modules: {
    workspaces: moduleSettings("top", 10),
    tray: moduleSettings("top", 15),
    music: moduleSettings("top", 20),
    updates: moduleSettings("top", 30),

    network: moduleSettings("bottom", 10),
    bluetooth: moduleSettings("bottom", 10),
    clipboard: {
      ...moduleSettings("middle", 45),
      enabled: false,
    },
    idleInhibitor: {
      ...moduleSettings("middle", 50),
      enabled: false,
    },
    volume: moduleSettings("bottom", 10),
    capture: {
      ...moduleSettings("middle", 40),
      enabled: false,
    },
    powerProfile: {
      ...moduleSettings("bottom", 12),
      enabled: false,
    },
    notifications: {
      ...moduleSettings("bottom", 12),
      enabled: false,
    },

    temperature: moduleSettings("bottom", 20),
    cpu: moduleSettings("bottom", 20),
    memory: moduleSettings("bottom", 20),

    disk: {
      ...moduleSettings("middle", 20),
      enabled: false,
    },
    brightness: {
      ...moduleSettings("middle", 30),
      enabled: false,
    },

    battery: moduleSettings("bottom", 30),
    weather: moduleSettings("bottom", 35),
    clock: moduleSettings("bottom", 40),
    powerMenu: {
      ...moduleSettings("bottom", 50),
      enabled: false,
    },

  },

  global: {
    scaleSm: 13,
    scaleMd: 14,
    scaleLg: 15.5,
    scaleXl: 19,

    barWidth: 3,
    islandWidth: 3,

    barPadding: {
      top: 0.42,
      right: 0.25,
      bottom: 0.42,
      left: 0.25,
    },
    edgeBarPadding: {
      top: 1.2,
      right: 0,
      bottom: 1.2,
      left: 0,
    },
  },

  appMenu: {
    islandWidth: 3,
    islandPadding: {
      top: 0.22,
      right: 0.2,
      bottom: 0.22,
      left: 0.2,
    },

    buttonWidth: 1.9,
    buttonHeight: 1.75,
    buttonRadius: 0.65,
    buttonPadding: { ...ZERO_EDGE },
    buttonMargin: { ...ZERO_EDGE },

    iconSize: 1.42,
    // Nerd Font Arch glyph is visually right-heavy despite centered metrics.
    iconPadding: { top: 0, right: 0.3, bottom: 0, left: 0 },
    iconMargin: { ...ZERO_EDGE },
  },

  workspaces: {
    islandWidth: 3,
    islandPadding: {
      top: 0.58,
      right: 0.28,
      bottom: 0.58,
      left: 0.16,
    },

    contentWidth: 2.18,
    contentPadding: {
      top: 0.22,
      right: 0,
      bottom: 0.22,
      left: 0,
    },

    buttonWidth: 2.18,
    buttonHeight: 1.18,

    indicatorWidth: 0.86,
  },

  tray: {
    islandWidth: 3,
    islandPadding: {
      top: 0.34,
      right: 0.24,
      bottom: 0.34,
      left: 0.1,
    },

    moduleWidth: 2.05,
    iconSize: 1.15,
    spacing: 0.26,
  },

  updates: {
    islandWidth: 3,
    islandPadding: {
      top: 0.34,
      right: 0.26,
      bottom: 0.34,
      left: 0.12,
    },

    buttonWidth: 2.05,
    buttonHeight: 2.35,
    buttonRadius: 0.72,

    iconSize: 1.6,
    countSize: 1.2,
    countMargin: {
      top: -0.12,
      right: 0,
      bottom: 0,
      left: 0,
    },
  },

  music: {
    islandWidth: 3,
    islandPadding: {
      top: 0.42,
      right: 0.26,
      bottom: 0.42,
      left: 0.12,
    },

    moduleWidth: 2.8,
    buttonWidth: 2.45,
    buttonHeight: 2.75,
    buttonRadius: 0.78,

    visualizerWidth: 2.8,
  },

  connectivity: {
    islandWidth: 3,
    islandPadding: {
      top: 0.36,
      right: 0.19,
      bottom: 0.36,
      left: 0.19,
    },

    moduleWidth: 2.05,
    buttonWidth: 2.05,
    buttonHeight: 2.1,
    buttonRadius: 0.68,

    iconWidth: 2.05,
    iconHeight: 2.1,
    iconSize: 1.3,
    iconPadding: { ...ZERO_EDGE },
    iconMargin: { ...ZERO_EDGE },
  },

  weather: {
    islandWidth: 3,
    islandPadding: {
      top: 0.36,
      right: 0.19,
      bottom: 0.36,
      left: 0.19,
    },

    moduleWidth: 2.05,
    buttonWidth: 2.05,
    buttonHeight: 2.1,
    buttonRadius: 0.68,
    buttonPadding: { ...ZERO_EDGE },
    buttonMargin: { ...ZERO_EDGE },

    contentPadding: { ...ZERO_EDGE },

    iconSize: 1.8,
    // The cloud glyph has asymmetric font bearings; a small right pad keeps
    // its visible shape optically centered without moving the temperature.
    iconPadding: { top: 0, right: 0.35, bottom: 0, left: 0 },
    iconMargin: { ...ZERO_EDGE },

    tempSize: 1,
    tempPadding: { ...ZERO_EDGE },
    tempMargin: {
      top: -0.18,
      right: 0,
      bottom: 0,
      left: 0,
    },

    popoverWidth: 13.6,
  },

  dials: {
    islandWidth: 3,
    islandPadding: {
      top: 0.42,
      right: 0.22,
      bottom: 0.42,
      left: 0.08,
    },

    batteryIslandWidth: 3,
    batteryIslandPadding: {
      top: 0.42,
      right: 0.22,
      bottom: 0.42,
      left: 0.08,
    },

    dialSize: 2.5,
    groupWidth: 2.5,
  },

  disk: {
    islandWidth: 3,
    islandPadding: {
      top: 0.42,
      right: 0.22,
      bottom: 0.42,
      left: 0.08,
    },

    moduleWidth: 2.5,
    dialSize: 2.5,
    popoverWidth: 14,
  },

  clock: {
    islandWidth: 3,
    islandPadding: {
      top: 0.34,
      right: 0.24,
      bottom: 0.34,
      left: 0.1,
    },

    wrapperWidth: 2.25,
    wrapperHeight: 2.1,

    labelWidth: 2.25,
    labelHeight: 2.1,
    labelSize: 1.12,
  },

  exit: {
    islandWidth: 3,
    islandPadding: {
      top: 0.34,
      right: 0.26,
      bottom: 0.34,
      left: 0.12,
    },

    buttonWidth: 2.05,
    buttonHeight: 2.1,
    buttonRadius: 0.72,
    iconSize: 1.4,
  },
}

/* =============================================================================
 * Generic helpers
 * ============================================================================= */

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function cloneSettings(settings: BarSettings) {
  return cloneValue(settings)
}

function mergeDeep<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== "object") {
    return cloneValue(base)
  }

  if (Array.isArray(base)) {
    return Array.isArray(patch) ? cloneValue(patch as T) : cloneValue(base)
  }

  // Unmodified nested sections must not alias defaults or another monitor profile.
  const output: any = cloneValue(base)

  for (const [key, value] of Object.entries(patch)) {
    const baseValue = (base as any)[key]

    if (Array.isArray(baseValue)) {
      output[key] = Array.isArray(value) ? cloneValue(value) : cloneValue(baseValue)
    } else if (
      baseValue &&
      typeof baseValue === "object" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      output[key] = mergeDeep(baseValue, value)
    } else if (typeof baseValue === "number" && typeof value === "number") {
      output[key] = value
    } else if (typeof baseValue === "boolean" && typeof value === "boolean") {
      output[key] = value
    } else if (typeof baseValue === "string" && typeof value === "string") {
      output[key] = value
    }
  }

  return output as T
}

function ensureGeneratedDir() {
  try {
    GLib.mkdir_with_parents(GENERATED_DIR, 0o755)
  } catch {
    // Ignore directory creation errors. saveBarSettings() will report failure.
  }
}

function formatNumber(value: number) {
  const rounded = Math.round(value * 1000) / 1000
  return String(rounded).replace(/\.0+$/, "")
}

function em(value: number) {
  return `${formatNumber(value)}em`
}

function edgeEm(edge: EdgeBox) {
  return `${em(edge.top)} ${em(edge.right)} ${em(edge.bottom)} ${em(edge.left)}`
}

function section(title: string) {
  return `\n/* ${title} */\n`
}

function isValidModuleId(value: string): value is BarModuleId {
  return (BAR_MODULE_IDS as readonly string[]).includes(value)
}

function isValidSlot(value: string): value is ModuleSlot {
  return (MODULE_SLOTS as readonly string[]).includes(value)
}

function sanitizeIslandId(value: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, "-")

  return normalized || `island-${Date.now()}`
}

export function getIslandCssClass(id: string) {
  return `layout-island-${sanitizeIslandId(id)}`
}

function expandLegacyModuleId(value: string, parsedModules: any): BarModuleId[] {
  if (isValidModuleId(value)) {
    return [value]
  }

  if (value === "connectivity") {
    return ["network", "bluetooth", "volume"].filter((id) => {
      const enabled = parsedModules?.[id]
      return typeof enabled === "boolean" ? enabled : true
    }) as BarModuleId[]
  }

  if (value === "hardware") {
    return ["temperature", "cpu", "memory"]
  }

  return []
}

function normalizeIslandModules(modules: unknown, parsedModules?: any): BarModuleId[] {
  if (!Array.isArray(modules)) {
    return []
  }

  const output: BarModuleId[] = []

  for (const value of modules) {
    if (typeof value !== "string") {
      continue
    }

    for (const id of expandLegacyModuleId(value, parsedModules)) {
      if (!output.includes(id)) {
        output.push(id)
      }
    }
  }

  return output
}

function sanitizeLayoutIsland(
  value: unknown,
  index: number,
  parsedModules?: any,
): LayoutIsland | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const raw = value as Partial<LayoutIsland>
  const slot = typeof raw.slot === "string" && isValidSlot(raw.slot) ? raw.slot : "bottom"
  const id = typeof raw.id === "string" ? sanitizeIslandId(raw.id) : `island-custom-${index + 1}`

  return {
    id,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    slot,
    order: typeof raw.order === "number" ? raw.order : (index + 1) * 10,
    width: typeof raw.width === "number" ? raw.width : 3,
    boxed: typeof (raw as any).boxed === "boolean" ? (raw as any).boxed : true,
    modules: normalizeIslandModules(raw.modules, parsedModules),
  }
}

function applyLegacyModuleSettings(settings: BarSettings, parsed: any) {
  const modules = parsed?.modules

  if (!modules || typeof modules !== "object") {
    return
  }

  const connectivity = modules.connectivity
  if (connectivity && typeof connectivity === "object") {
    for (const id of ["network", "bluetooth", "volume"] as const) {
      settings.modules[id].slot = connectivity.slot ?? settings.modules[id].slot
      settings.modules[id].order = connectivity.order ?? settings.modules[id].order
      settings.modules[id].enabled = typeof modules[id] === "boolean" ? modules[id] : connectivity.enabled !== false
    }
  }

  const hardware = modules.hardware
  if (hardware && typeof hardware === "object") {
    for (const id of ["cpu", "memory", "temperature"] as const) {
      settings.modules[id].slot = hardware.slot ?? settings.modules[id].slot
      settings.modules[id].order = hardware.order ?? settings.modules[id].order
      settings.modules[id].enabled = hardware.enabled !== false
    }
  }
}

function getModuleIslandWidth(settings: BarSettings, moduleId: BarModuleId) {
  switch (moduleId) {
    case "workspaces":
      return settings.workspaces.islandWidth
    case "tray":
      return settings.tray.islandWidth
    case "music":
      return settings.music.islandWidth
    case "updates":
      return settings.updates.islandWidth
    case "network":
    case "bluetooth":
    case "clipboard":
    case "idleInhibitor":
    case "volume":
    case "capture":
    case "powerProfile":
    case "notifications":
      return settings.connectivity.islandWidth
    case "weather":
      return settings.weather.islandWidth
    case "cpu":
    case "memory":
    case "temperature":
      return settings.dials.islandWidth
    case "disk":
      return settings.disk.islandWidth
    case "brightness":
      return settings.dials.islandWidth
    case "battery":
      return settings.dials.batteryIslandWidth
    case "clock":
      return settings.clock.islandWidth
    case "powerMenu":
      return settings.exit.islandWidth
  }
}

function createIslandsFromModuleSettings(settings: BarSettings) {
  const islands: LayoutIsland[] = []

  for (const id of BAR_MODULE_IDS) {
    const moduleSettings = settings.modules[id]

    if (!moduleSettings.enabled) {
      continue
    }

    islands.push({
      id: `island-${id}`,
      enabled: true,
      slot: moduleSettings.slot,
      order: moduleSettings.order,
      width: getModuleIslandWidth(settings, id),
      boxed: true,
      modules: [id],
    })
  }

  return islands
}

function normalizeOrders(settings: BarSettings) {
  for (const slot of MODULE_SLOTS) {
    settings.islands
      .filter((island) => island.enabled && island.slot === slot)
      .sort((left, right) => left.order - right.order)
      .forEach((island, index) => {
        island.order = (index + 1) * 10
      })
  }
}


function hasGroupedIsland(settings: BarSettings, modules: readonly BarModuleId[]) {
  return settings.islands.some((island) => {
    return (
      island.enabled &&
      island.boxed &&
      modules.every((moduleId) => island.modules.includes(moduleId))
    )
  })
}

function migrateModuleGroup(
  settings: BarSettings,
  id: string,
  modules: readonly BarModuleId[],
  fallbackSlot: ModuleSlot,
  fallbackOrder: number,
) {
  const activeModules = modules.filter((moduleId) => settings.modules[moduleId]?.enabled)

  if (activeModules.length <= 1 || hasGroupedIsland(settings, activeModules)) {
    return
  }

  const moduleSet = new Set(activeModules)
  const relatedIslands = settings.islands.filter((island) => {
    return island.enabled && island.modules.some((moduleId) => moduleSet.has(moduleId))
  })

  if (relatedIslands.length === 0) {
    return
  }

  const sortedRelated = [...relatedIslands].sort((left, right) => {
    return left.order - right.order
  })
  const firstIsland = sortedRelated[0]

  for (const island of settings.islands) {
    island.modules = island.modules.filter((moduleId) => !moduleSet.has(moduleId))
  }

  settings.islands = settings.islands.filter((island) => {
    return island.boxed || island.modules.length > 0
  })

  settings.islands.push({
    id,
    enabled: true,
    slot: firstIsland?.slot ?? fallbackSlot,
    order: firstIsland?.order ?? fallbackOrder,
    width: settings.global.islandWidth,
    boxed: true,
    modules: activeModules,
  })
}

function hasModuleAssigned(settings: BarSettings, moduleId: BarModuleId) {
  return settings.islands.some((island) => {
    return island.enabled && island.modules.includes(moduleId)
  })
}

function migrateTrayIsland(settings: BarSettings, sourceVersion: number) {
  if (sourceVersion >= 12 || hasModuleAssigned(settings, "tray")) {
    return
  }

  settings.modules.tray.enabled = true
  settings.modules.tray.slot = "top"
  settings.modules.tray.order = 15

  const workspaces = settings.islands.find((island) => island.modules.includes("workspaces"))

  settings.islands.push({
    id: "island-tray",
    enabled: true,
    slot: workspaces?.slot ?? "top",
    order: (workspaces?.order ?? 10) + 1,
    width: settings.tray.islandWidth,
    boxed: true,
    modules: ["tray"],
  })
}

function migrateLegacySingleModuleGroups(settings: BarSettings, sourceVersion: number) {
  if (sourceVersion >= 14) {
    return
  }

  migrateModuleGroup(
    settings,
    "island-connectivity",
    ["network", "bluetooth", "volume"],
    "bottom",
    10,
  )
  migrateModuleGroup(
    settings,
    "island-system",
    ["temperature", "cpu", "memory"],
    "bottom",
    20,
  )
}

function approximately(value: unknown, expected: number) {
  return typeof value === "number" && Math.abs(value - expected) < 0.0001
}

function migrateBeta39BarGeometry(settings: BarSettings, parsed: any, sourceVersion: number) {
  if (sourceVersion >= 15) {
    return
  }

  const savedGlobal = parsed?.global
  const savedEdgePadding = savedGlobal?.edgeBarPadding

  // Beta38 reserved empty space on the right even though the bar is attached
  // directly to the left screen edge. Remove only the old default value so a
  // user-customized padding remains untouched.
  if (
    savedEdgePadding &&
    approximately(savedEdgePadding.left, 0) &&
    approximately(savedEdgePadding.right, 0.25)
  ) {
    settings.global.edgeBarPadding.right = 0
  }

  const savedAppMenu = parsed?.appMenu
  const savedIslandPadding = savedAppMenu?.islandPadding

  // Preserve the beta38 total horizontal padding while centering the Arch logo.
  if (
    savedIslandPadding &&
    approximately(savedIslandPadding.left, 0.12) &&
    approximately(savedIslandPadding.right, 0.28)
  ) {
    settings.appMenu.islandPadding.left = 0.2
    settings.appMenu.islandPadding.right = 0.2
  }

  if (!savedAppMenu || savedAppMenu.iconSize === undefined || approximately(savedAppMenu.iconSize, 1.18)) {
    settings.appMenu.iconSize = 1.42
  }
}

function migrateBeta402EdgeAttachment(settings: BarSettings, parsed: any, sourceVersion: number) {
  if (sourceVersion >= 16) {
    return
  }

  const savedRight = parsed?.global?.edgeBarPadding?.right

  // beta38/beta39 profiles commonly persisted a 0.25em right shell padding.
  // With the external screen frame enabled that becomes a visible wallpaper
  // sliver between the islands and the frame. Remove only that legacy default;
  // larger user-defined spacing remains untouched.
  if (savedRight === undefined || approximately(savedRight, 0.25) || approximately(savedRight, 0)) {
    settings.global.edgeBarPadding.right = 0
  }
}


function migrateBeta405OpticalCentering(settings: BarSettings, parsed: any, sourceVersion: number) {
  if (sourceVersion >= 18) {
    return
  }

  const savedWeather = parsed?.weather
  const savedIslandPadding = savedWeather?.islandPadding
  const savedIconPadding = savedWeather?.iconPadding

  // Beta40.4 inherited asymmetric weather padding from the older compact bar.
  // Preserve the same total horizontal space while centering the weather glyph.
  if (
    savedIslandPadding &&
    approximately(savedIslandPadding.left, 0.1) &&
    approximately(savedIslandPadding.right, 0.28)
  ) {
    settings.weather.islandPadding.left = 0.19
    settings.weather.islandPadding.right = 0.19
  }

  if (
    savedIconPadding &&
    approximately(savedIconPadding.left, 0) &&
    approximately(savedIconPadding.right, 0.35) &&
    approximately(savedIconPadding.top, 0) &&
    approximately(savedIconPadding.bottom, 0)
  ) {
    settings.weather.iconPadding = { ...ZERO_EDGE }
  }
}

function migrateBeta406OpticalGlyphs(settings: BarSettings, parsed: any, sourceVersion: number) {
  if (sourceVersion >= 19) {
    return
  }

  const savedWeatherIconPadding = parsed?.weather?.iconPadding
  const knownBeta404WeatherPadding =
    savedWeatherIconPadding &&
    approximately(savedWeatherIconPadding.top, 0) &&
    approximately(savedWeatherIconPadding.right, 0.35) &&
    approximately(savedWeatherIconPadding.bottom, 0) &&
    approximately(savedWeatherIconPadding.left, 0)
  const knownBeta405WeatherPadding =
    savedWeatherIconPadding &&
    approximately(savedWeatherIconPadding.top, 0) &&
    approximately(savedWeatherIconPadding.right, 0) &&
    approximately(savedWeatherIconPadding.bottom, 0) &&
    approximately(savedWeatherIconPadding.left, 0)

  if (knownBeta404WeatherPadding || knownBeta405WeatherPadding) {
    settings.weather.iconPadding = { top: 0, right: 0.35, bottom: 0, left: 0 }
  }

  const savedAppMenuIconPadding = parsed?.appMenu?.iconPadding
  if (
    savedAppMenuIconPadding &&
    approximately(savedAppMenuIconPadding.top, 0) &&
    approximately(savedAppMenuIconPadding.right, 0) &&
    approximately(savedAppMenuIconPadding.bottom, 0) &&
    approximately(savedAppMenuIconPadding.left, 0)
  ) {
    settings.appMenu.iconPadding = { top: 0, right: 0.3, bottom: 0, left: 0 }
  }
}

function migrateBeta4021RelativeUnits(settings: BarSettings, parsed: any, sourceVersion: number) {
  if (sourceVersion >= 20) {
    return
  }

  const savedIndicatorWidth = parsed?.workspaces?.indicatorWidth

  // Older profiles stored the workspace indicator width as a fixed logical-pixel
  // value (12). Convert only that legacy range to an em-like proportion so the
  // indicator follows the bar scale on every monitor.
  if (typeof savedIndicatorWidth === "number" && savedIndicatorWidth > 4) {
    settings.workspaces.indicatorWidth = Math.round((savedIndicatorWidth / 14) * 100) / 100
  }
}

function normalizeSettings(
  settings: BarSettings,
  parsed: unknown,
  sourceVersion = STORE_VERSION,
): BarSettings {
  const parsedObject = parsed && typeof parsed === "object" ? (parsed as any) : {}
  const hasSavedIslands = Array.isArray(parsedObject.islands)
  const hasSavedModules =
    parsedObject.modules &&
    typeof parsedObject.modules === "object" &&
    !Array.isArray(parsedObject.modules)

  applyLegacyModuleSettings(settings, parsedObject)

  if (!hasSavedIslands) {
    settings.islands = hasSavedModules
      ? createIslandsFromModuleSettings(settings)
      : cloneValue(settings.islands)
  } else {
    settings.islands = parsedObject.islands
      .map((value: unknown, index: number) => {
        return sanitizeLayoutIsland(value, index, parsedObject.modules)
      })
      .filter(Boolean) as LayoutIsland[]
  }

  for (const id of BAR_MODULE_IDS) {
    const assigned = settings.islands.some((island) => island.modules.includes(id))
    const savedModule = parsedObject.modules?.[id]

    if (savedModule && typeof savedModule === "object") {
      settings.modules[id].enabled = savedModule.enabled !== false
      settings.modules[id].slot = isValidSlot(savedModule.slot) ? savedModule.slot : settings.modules[id].slot
      settings.modules[id].order = typeof savedModule.order === "number" ? savedModule.order : settings.modules[id].order
    } else if (typeof savedModule === "boolean") {
      settings.modules[id].enabled = savedModule
    } else if (!assigned) {
      settings.modules[id].enabled = false
    }
  }

  for (const island of settings.islands) {
    island.modules = island.modules.filter((id) => settings.modules[id].enabled)

    for (const id of island.modules) {
      settings.modules[id].slot = island.slot
      settings.modules[id].order = island.order
    }
  }

  const assigned = new Set(settings.islands.flatMap((island) => island.modules))

  for (const id of BAR_MODULE_IDS) {
    if (settings.modules[id].enabled && !assigned.has(id)) {
      settings.islands.push({
        id: `island-${id}`,
        enabled: true,
        slot: settings.modules[id].slot,
        order: settings.modules[id].order,
        width: getModuleIslandWidth(settings, id),
        boxed: true,
        modules: [id],
      })
    }
  }

  migrateTrayIsland(settings, sourceVersion)
  migrateLegacySingleModuleGroups(settings, sourceVersion)
  migrateBeta39BarGeometry(settings, parsedObject, sourceVersion)
  migrateBeta402EdgeAttachment(settings, parsedObject, sourceVersion)
  migrateBeta405OpticalCentering(settings, parsedObject, sourceVersion)
  migrateBeta406OpticalGlyphs(settings, parsedObject, sourceVersion)
  migrateBeta4021RelativeUnits(settings, parsedObject, sourceVersion)

  // Edge-attached mode must not reserve a transparent gutter between the
  // islands and the desktop on the right. Keep any explicitly configured left
  // inset available, but neutralize stale right-side padding from old profiles.
  settings.global.edgeBarPadding.right = 0

  normalizeOrders(settings)
  return settings
}

/* =============================================================================
 * SCSS generator
 * ============================================================================= */

function selectorForMonitor(monitorKey: string, selector: string) {
  return selector
    .split(",")
    .map((item) => `window.Bar.${monitorKey} ${item.trim()}`)
    .join(",\n")
}

function windowSelectorForMonitor(monitorKey: string, selector: string) {
  return selector.replace(/window\.Bar/g, `window.Bar.${monitorKey}`)
}

function rule(monitorKey: string, selector: string, body: string) {
  return `${selectorForMonitor(monitorKey, selector)} {\n${body}\n}\n`
}

function windowRule(monitorKey: string, selector: string, body: string) {
  return `${windowSelectorForMonitor(monitorKey, selector)} {\n${body}\n}\n`
}

const RELATIVE_FONT_REFERENCE = 16

function scalePercent(value: number) {
  // The stored scale values historically represented 13/14/15.5/19 logical
  // font sizes. Keep that visual baseline while emitting relative CSS only.
  return `${formatNumber((value / RELATIVE_FONT_REFERENCE) * 100)}%`
}

function generateScaleScss(settings: GlobalSettings, monitorKey: string) {
  return `${windowRule(monitorKey, "window.Bar.scale-sm", `  font-size: ${scalePercent(settings.scaleSm)};`)}
${windowRule(monitorKey, "window.Bar.scale-md", `  font-size: ${scalePercent(settings.scaleMd)};`)}
${windowRule(monitorKey, "window.Bar.scale-lg", `  font-size: ${scalePercent(settings.scaleLg)};`)}
${windowRule(monitorKey, "window.Bar.scale-xl", `  font-size: ${scalePercent(settings.scaleXl)};`)}
`
}

export function generateBarHeightFitScss(
  settings: BarSettings,
  monitorKey: string,
  monitorHeight: number,
) {
  const target = monitorHeight <= 920
    ? settings.global.scaleSm
    : monitorHeight <= 1080
      ? settings.global.scaleMd
      : null

  if (target === null) return ""

  const selector = ["sm", "md", "lg", "xl"]
    .map((bucket) => `window.Bar.${monitorKey}.scale-${bucket}`)
    .join(",\n")

  return `\n${selector} {\n  font-size: ${scalePercent(target)};\n}\n`
}

export function generateBarSettingsScss(settings: BarSettings, monitorKey = "monitor-0") {
  const { global } = settings

  return `/* =============================================================================\n * Generated by Bar Settings. Do not edit by hand.\n * Monitor profile: ${monitorKey}\n * ============================================================================= */\n${section("Global")}
${generateScaleScss(global, monitorKey)}${rule(monitorKey, ".bar-root", `  min-width: ${em(global.barWidth)};\n  padding: ${edgeEm(global.barPadding)};`)}
${rule(monitorKey, ".island", `  min-width: ${em(global.islandWidth)};`)}
${windowRule(monitorKey, "window.Bar.edge-attached .bar-root", `  min-width: ${em(global.barWidth)};\n  padding: ${edgeEm(global.edgeBarPadding)};`)}
${generateAppMenuScss(settings.appMenu, monitorKey)}${generateWorkspacesScss(settings.workspaces, monitorKey)}${generateTrayScss(settings.tray, monitorKey)}${generateUpdatesScss(settings.updates, monitorKey)}${generateMusicScss(settings.music, monitorKey)}${generateConnectivityScss(settings.connectivity, monitorKey)}${generateWeatherScss(settings.weather, monitorKey)}${generateDialsScss(settings.dials, monitorKey)}${generateDiskScss(settings.disk, monitorKey)}${generateClockScss(settings.clock, monitorKey)}${generateExitScss(settings.exit, monitorKey)}${generateLayoutIslandScss(settings, monitorKey)}`
}

function generateLayoutIslandScss(settings: BarSettings, monitorKey: string) {
  const rules = settings.islands
    .map((island) => {
      return rule(monitorKey, `.${getIslandCssClass(island.id)}`, `  min-width: ${em(island.width)};`)
    })
    .join("\n")

  return `${section("Layout islands")}${rules}\n`
}

function generateAppMenuScss(settings: AppMenuSettings, monitorKey: string) {
  return `${section("App menu")}
${rule(monitorKey, ".appmenu-island", `  min-width: ${em(settings.islandWidth)};\n  padding: ${edgeEm(settings.islandPadding)};`)}
${windowRule(monitorKey, "window.Bar.edge-attached .appmenu-island", `  min-width: ${em(settings.islandWidth)};\n  padding: ${edgeEm(settings.islandPadding)};`)}
${rule(monitorKey, ".appmenu-button", `  min-width: ${em(settings.buttonWidth)};\n  min-height: ${em(settings.buttonHeight)};\n  padding: ${edgeEm(settings.buttonPadding)};\n  margin: ${edgeEm(settings.buttonMargin)};\n  border-radius: ${em(settings.buttonRadius)};`)}
${rule(monitorKey, ".appmenu-button label", `  min-width: ${em(settings.buttonWidth)};\n  min-height: ${em(settings.buttonHeight)};\n  padding: ${edgeEm(settings.iconPadding)};\n  margin: ${edgeEm(settings.iconMargin)};\n  font-size: ${em(settings.iconSize)};`)}
`
}

function generateWorkspacesScss(settings: WorkspacesSettings, monitorKey: string) {
  return `${section("Workspaces")}
${rule(monitorKey, ".workspace-island", `  min-width: ${em(settings.islandWidth)};\n  padding: ${edgeEm(settings.islandPadding)};`)}
${rule(monitorKey, ".workspaces", `  min-width: ${em(settings.contentWidth)};\n  padding: ${edgeEm(settings.contentPadding)};`)}
${rule(monitorKey, ".workspace-button", `  min-width: ${em(settings.buttonWidth)};\n  min-height: ${em(settings.buttonHeight)};`)}
${rule(monitorKey, ".workspace-indicator", `  min-width: ${em(settings.indicatorWidth)};`)}
`
}

function generateTrayScss(settings: TraySettings, monitorKey: string) {
  return `${section("Tray")}
${rule(monitorKey, ".tray-island", `  min-width: ${em(settings.islandWidth)};
  padding: ${edgeEm(settings.islandPadding)};`)}
${rule(monitorKey, ".tray-module", `  min-width: ${em(settings.moduleWidth)};`)}
${rule(monitorKey, ".tray-items", `  min-width: ${em(settings.moduleWidth)};`)}
${rule(monitorKey, ".tray-icon", `  font-size: ${em(settings.iconSize)};`)}
`
}

function generateUpdatesScss(settings: UpdatesSettings, monitorKey: string) {
  return `${section("Updates")}
${rule(monitorKey, ".updates-island", `  min-width: ${em(settings.islandWidth)};\n  padding: ${edgeEm(settings.islandPadding)};`)}
${rule(monitorKey, ".updates-button, .updates-content", `  min-width: ${em(settings.buttonWidth)};`)}
${rule(monitorKey, ".updates-button", `  min-height: ${em(settings.buttonHeight)};\n  border-radius: ${em(settings.buttonRadius)};`)}
${rule(monitorKey, ".updates-icon", `  font-size: ${em(settings.iconSize)};`)}
${rule(monitorKey, ".updates-count", `  font-size: ${em(settings.countSize)};\n  margin: ${edgeEm(settings.countMargin)};`)}
`
}

function generateMusicScss(settings: MusicSettings, monitorKey: string) {
  return `${section("Music")}
${rule(monitorKey, ".media-island", `  min-width: ${em(settings.islandWidth)};\n  padding: ${edgeEm(settings.islandPadding)};`)}
${rule(monitorKey, ".music-module", `  min-width: ${em(settings.moduleWidth)};\n  border-radius: ${em(settings.buttonRadius)};`)}
${rule(monitorKey, ".music-button", `  min-width: ${em(settings.buttonWidth)};\n  min-height: ${em(settings.buttonHeight)};\n  border-radius: ${em(settings.buttonRadius)};`)}
${rule(monitorKey, ".music-visualizer", `  min-width: ${em(settings.visualizerWidth)};\n  min-height: ${em(settings.buttonHeight)};`)}
`
}

function generateConnectivityScss(settings: ConnectivitySettings, monitorKey: string) {
  return `${section("Connectivity")}
${rule(monitorKey, ".connectivity-island, .connection-island", `  min-width: ${em(settings.islandWidth)};\n  padding: ${edgeEm(settings.islandPadding)};`)}
${rule(monitorKey, ".connection-module", `  min-width: ${em(settings.moduleWidth)};`)}
${rule(monitorKey, ".connection-button", `  min-width: ${em(settings.buttonWidth)};\n  min-height: ${em(settings.buttonHeight)};\n  border-radius: ${em(settings.buttonRadius)};`)}
${rule(monitorKey, ".connection-icon, .network-icon, .bluetooth-icon, .clipboard-icon, .idle-icon, .volume-icon, .capture-icon, .power-profile-icon, .notifications-icon", `  min-width: ${em(settings.iconWidth)};\n  min-height: ${em(settings.iconHeight)};\n  padding: ${edgeEm(settings.iconPadding)};\n  margin: ${edgeEm(settings.iconMargin)};`)}
${rule(monitorKey, ".connection-icon", `  font-size: ${em(settings.iconSize)};`)}
`
}

function generateWeatherScss(settings: WeatherSettings, monitorKey: string) {
  return `${section("Weather")}
${rule(monitorKey, ".weather-island", `  min-width: ${em(settings.islandWidth)};
  padding: ${edgeEm(settings.islandPadding)};`)}
${rule(monitorKey, ".weather-module", `  min-width: ${em(settings.moduleWidth)};`)}
${rule(monitorKey, ".weather-button", `  min-width: ${em(settings.buttonWidth)};
  min-height: ${em(settings.buttonHeight)};
  padding: ${edgeEm(settings.buttonPadding)};
  margin: ${edgeEm(settings.buttonMargin)};
  border-radius: ${em(settings.buttonRadius)};`)}
${rule(monitorKey, ".weather-content", `  min-width: ${em(settings.buttonWidth)};
  min-height: ${em(settings.buttonHeight)};
  padding: ${edgeEm(settings.contentPadding)};`)}
${rule(monitorKey, ".weather-icon", `  font-size: ${em(settings.iconSize)};
  padding: ${edgeEm(settings.iconPadding)};
  margin: ${edgeEm(settings.iconMargin)};`)}
${rule(monitorKey, ".weather-temp", `  font-size: ${em(settings.tempSize)};
  padding: ${edgeEm(settings.tempPadding)};
  margin: ${edgeEm(settings.tempMargin)};`)}
${rule(monitorKey, ".weather-popover-card", `  min-width: ${em(settings.popoverWidth)};`)}
`
}

function generateDialsScss(settings: DialsSettings, monitorKey: string) {
  return `${section("Dials")}
${rule(monitorKey, ".hardware-island, .speed-island", `  min-width: ${em(settings.islandWidth)};\n  padding: ${edgeEm(settings.islandPadding)};`)}
${rule(monitorKey, ".power-island", `  min-width: ${em(settings.batteryIslandWidth)};\n  padding: ${edgeEm(settings.batteryIslandPadding)};`)}
${rule(monitorKey, ".speed-item, .speed-row, .speedometer", `  min-width: ${em(settings.dialSize)};\n  min-height: ${em(settings.dialSize)};`)}
`
}

function generateDiskScss(settings: DiskSettings, monitorKey: string) {
  return `${section("Disk")}
${rule(monitorKey, ".disk-island", `  min-width: ${em(settings.islandWidth)};
  padding: ${edgeEm(settings.islandPadding)};`)}
${rule(monitorKey, ".disk-module", `  min-width: ${em(settings.moduleWidth)};`)}
${rule(monitorKey, ".disk-row, .disk-dial", `  min-width: ${em(settings.dialSize)};
  min-height: ${em(settings.dialSize)};`)}
${rule(monitorKey, ".disk-popover-card", `  min-width: ${em(settings.popoverWidth)};`)}
`
}

function generateClockScss(settings: ClockSettings, monitorKey: string) {
  return `${section("Clock")}
${rule(monitorKey, ".clock-island", `  min-width: ${em(settings.islandWidth)};\n  padding: ${edgeEm(settings.islandPadding)};`)}
${rule(monitorKey, ".clock-wrapper", `  min-width: ${em(settings.wrapperWidth)};\n  min-height: ${em(settings.wrapperHeight)};`)}
${rule(monitorKey, ".clock-label", `  min-width: ${em(settings.labelWidth)};\n  min-height: ${em(settings.labelHeight)};\n  font-size: ${em(settings.labelSize)};`)}
`
}

function generateExitScss(settings: ExitSettings, monitorKey: string) {
  return `${section("Exit")}
${rule(monitorKey, ".exit-island", `  min-width: ${em(settings.islandWidth)};\n  padding: ${edgeEm(settings.islandPadding)};`)}
${rule(monitorKey, ".exit-button, .power-menu-button", `  min-width: ${em(settings.buttonWidth)};\n  min-height: ${em(settings.buttonHeight)};\n  border-radius: ${em(settings.buttonRadius)};`)}
${rule(monitorKey, ".exit-button label, .power-menu-button label", `  min-width: ${em(settings.buttonWidth)};\n  min-height: ${em(settings.buttonHeight)};\n  font-size: ${em(settings.iconSize)};`)}
`
}

/* =============================================================================
 * Store helpers
 * ============================================================================= */

export function getMonitorSettingsKey(monitorIndex = 0) {
  const index = Math.min(
    Math.max(Math.round(Number.isFinite(monitorIndex) ? monitorIndex : 0), 0),
    MAX_MONITOR_PROFILES - 1,
  )

  return `monitor-${index}`
}

function isLegacySettings(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "global" in value &&
      "modules" in value,
  )
}

function createDefaultStore(): BarSettingsStore {
  return {
    version: STORE_VERSION,
    monitors: {},
  }
}

function getSettingsFromStore(store: BarSettingsStore, monitorKey: string) {
  const saved = store.monitors[monitorKey]
  const merged = mergeDeep(DEFAULT_BAR_SETTINGS, saved ?? {})

  return normalizeSettings(merged, saved ?? {})
}

function loadBarSettingsStore(): BarSettingsStore {
  const raw = readFile(BAR_SETTINGS_JSON_PATH)
  const parsed = readJson<any>(raw, {})
  const store = createDefaultStore()

  if (parsed && typeof parsed === "object" && parsed.monitors) {
    for (const [key, value] of Object.entries(parsed.monitors)) {
      if (!/^monitor-([0-9]|[12][0-9]|3[01])$/.test(key)) {
        continue
      }

      store.monitors[key] = normalizeSettings(
        mergeDeep(DEFAULT_BAR_SETTINGS, value),
        value,
        typeof parsed.version === "number" ? parsed.version : 0,
      )
    }

    return store
  }

  if (isLegacySettings(parsed)) {
    store.monitors[getMonitorSettingsKey(0)] = normalizeSettings(
      mergeDeep(DEFAULT_BAR_SETTINGS, parsed),
      parsed,
      0,
    )
  }

  return store
}

function saveBarSettingsStore(store: BarSettingsStore) {
  ensureGeneratedDir()

  const jsonOk = writeFile(
    BAR_SETTINGS_JSON_PATH,
    `${JSON.stringify(store, null, 2)}\n`,
  )
  const scssOk = writeFile(BAR_SETTINGS_SCSS_PATH, generateSettingsStoreScss(store))

  return jsonOk && scssOk
}

/* =============================================================================
 * Public API
 * ============================================================================= */

export function loadBarSettings(monitorIndex = 0) {
  const store = loadBarSettingsStore()
  return getSettingsFromStore(store, getMonitorSettingsKey(monitorIndex))
}

function refreshScaledNotificationGeometry() {
  spawn(`bash ${shellQuote(`${CONFIG_HOME}/ags/scripts/theme/wallpaper_manager.sh`)} --dunst-scale`)
}

export function saveBarSettings(settings: BarSettings, monitorIndex = 0) {
  const store = loadBarSettingsStore()
  const monitorKey = getMonitorSettingsKey(monitorIndex)

  store.version = STORE_VERSION
  store.monitors[monitorKey] = normalizeSettings(
    mergeDeep(DEFAULT_BAR_SETTINGS, settings),
    settings,
  )

  const ok = saveBarSettingsStore(store)
  if (ok) refreshScaledNotificationGeometry()
  return ok
}

export function resetBarSettings(monitorIndex = 0) {
  const store = loadBarSettingsStore()
  const monitorKey = getMonitorSettingsKey(monitorIndex)

  store.version = STORE_VERSION
  store.monitors[monitorKey] = cloneSettings(DEFAULT_BAR_SETTINGS)
  const ok = saveBarSettingsStore(store)
  if (ok) refreshScaledNotificationGeometry()

  return getSettingsFromStore(store, monitorKey)
}

export function restartAgs() {
  spawn(`bash ${shellQuote(`${CONFIG_HOME}/ags/launch.sh`)}`)
}
