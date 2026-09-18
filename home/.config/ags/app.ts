import { Astal, Gdk, Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"
import { ResourceScope } from "./lib/lifecycle"
import { registerMonitor, unregisterMonitor } from "./services/monitors"
import { clearThemeCache } from "./theme"
import { shutdownCava } from "./services/cava"
import app from "ags/gtk4/app"
import style from "./style.scss"
import Bar from "./modules/bar/Bar"
import { handleQuickLauncherRequest } from "./modules/launcher/AppMenu"
import { handleThemeRequest } from "./modules/theme/ThemeCenter"
import BarConfigCenter, { handleBarConfigRequest } from "./modules/settings/BarConfigCenter"
import { handlePowerMenuRequest } from "./modules/power-menu/PowerMenu"
import ShortcutsCenter, { handleShortcutsRequest } from "./modules/shortcuts/ShortcutsCenter"

app.start({
  css: style,

  requestHandler(argv: string[], response: (response: string) => void) {
    const [cmd = "", action = "toggle"] = argv

    try {
      switch (cmd) {
        case "ping":
          response("pong")
          return
        case "quick-launcher":
        case "launcher":
        case "app-menu":
          response(handleQuickLauncherRequest(action))
          return
        case "theme":
        case "theme-center":
        case "wallpapers":
          response(handleThemeRequest(action, argv[2] === undefined ? undefined : Number(argv[2])))
          return
        case "bar-config":
        case "bar-settings":
          response(handleBarConfigRequest(action, argv[2] === undefined ? undefined : Number(argv[2])))
          return
        case "power-menu":
        case "power":
          response(handlePowerMenuRequest(action))
          return
        case "shortcuts":
        case "help":
          response(handleShortcutsRequest(action, argv[2] === undefined ? undefined : Number(argv[2])))
          return
        case "shellfx":
        case "shell-center":
        case "command-center":
        case "console":
          response(handleQuickLauncherRequest(action))
          return
        default:
          response(cmd ? `Unknown command: ${cmd}` : "No command provided")
      }
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      console.error(`Request failed (${cmd || "empty"}):`, error)
      response(`ERROR: ${message}`)
    }
  },

  main() {
    const model = Gdk.Display.get_default()?.get_monitors()
    if (!model) return
    app.hold() // Stay alive while a dock briefly reports no monitors.
    const bars = new Map<Gdk.Monitor, { window: Gtk.Window, scope: ResourceScope, slot: number, geometry: string, signals: number[] }>()
    let pending = 0
    let shuttingDown = false
    function queueSync() {
      if (pending || shuttingDown) return
      pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 180, () => {
        pending = 0; sync(); return GLib.SOURCE_REMOVE
      })
    }
    function remove(monitor: Gdk.Monitor) {
      const entry = bars.get(monitor)
      if (!entry) return
      for (const signal of entry.signals) monitor.disconnect(signal)
      entry.scope.dispose()
      entry.window.destroy()
      unregisterMonitor(entry.slot)
      bars.delete(monitor)
    }
    function sync() {
      const monitors: Gdk.Monitor[] = []
      for (let i = 0; i < model!.get_n_items(); i++) monitors.push(model!.get_item(i) as Gdk.Monitor)
      for (const monitor of bars.keys()) if (!monitors.includes(monitor)) remove(monitor)
      monitors.forEach((monitor, index) => {
        const rect = monitor.get_geometry()
        const geometry = `${rect.width}:${rect.height}:${monitor.get_scale_factor()}`
        if (bars.get(monitor)?.geometry === geometry) return
        remove(monitor)
        clearThemeCache()
        const slot = registerMonitor(monitor, index)
        const scope = new ResourceScope()
        try {
          const window = scope.run(() => {
            const bar = Bar(monitor, slot) as Astal.Window
            BarConfigCenter({
              monitorIndex: slot,
              monitorHeight: rect.height,
              barWindow: bar,
            })
            ShortcutsCenter({ monitorIndex: slot })
            return bar
          })
          const signals = [monitor.connect("notify::geometry", queueSync), monitor.connect("notify::scale-factor", queueSync)]
          bars.set(monitor, { window, scope, slot, geometry, signals })
        } catch (error) {
          scope.dispose(); unregisterMonitor(slot)
          console.error("Unable to create monitor bar:", error)
        }
      })
    }
    const modelSignal = model.connect("items-changed", queueSync)
    app.connect("shutdown", () => {
      shuttingDown = true
      model.disconnect(modelSignal)
      if (pending) GLib.source_remove(pending)
      for (const monitor of [...bars.keys()]) remove(monitor)
      shutdownCava()
    })
    sync()
  },
})
