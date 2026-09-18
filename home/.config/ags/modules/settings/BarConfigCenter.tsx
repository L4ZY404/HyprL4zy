import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { onCleanup, scopeCallback, timeout } from "../../lib/lifecycle"
import { frameMotion } from "../../lib/ui/FrameMotion"
import { monitorBounds, monitorForSlot } from "../../services/monitors"
import { restartAgs } from "../../services/barSettings"
import GLib from "gi://GLib?version=2.0"
import WidgetComposer from "./WidgetComposer"
import { column, row, label, closeButton } from "../../lib/ui/Studio"

type Controller = { show: () => string; hide: () => string; toggle: () => string }
type BarConfigProps = {
  monitorIndex?: number
  monitorHeight?: number
  barWindow?: Astal.Window | null
}

const controllers = new Map<number, Controller>()
const { TOP, BOTTOM, LEFT } = Astal.WindowAnchor

function current() {
  return controllers.get(0) ?? controllers.values().next().value
}

export function handleBarConfigRequest(action = "toggle", monitorIndex?: number) {
  const requested = Number.isFinite(monitorIndex)
    ? Math.max(0, Math.round(Number(monitorIndex)))
    : null
  const controller = (requested === null ? null : controllers.get(requested)) ?? current()

  if (!controller) return "Bar Editor is not ready"
  if (action === "show" || action === "open") return controller.show()
  if (action === "hide" || action === "close") return controller.hide()
  return controller.toggle()
}

function drawerWidthForMonitor(slot: number) {
  const bounds = monitorBounds(slot)
  const aspect = bounds.width / Math.max(1, bounds.height)
  const ratio = aspect >= 1.7 ? 0.42 : 0.46
  return Math.max(1, Math.round(bounds.width * ratio))
}

export default function BarConfigCenter(props: BarConfigProps = {}) {
  const slot = props.monitorIndex ?? 0
  const barWindow = props.barWindow ?? null
  let view: Astal.Window | null = null
  let shell: Gtk.Box | null = null
  let editor: Gtk.Widget | null = null
  let scroller: Gtk.ScrolledWindow | null = null
  let autoScrollSpeed = 0
  let autoScrollRunning = false
  let drawerMotion: ReturnType<typeof frameMotion> | null = null
  let barMotion: ReturnType<typeof frameMotion> | null = null
  let opened = false
  let closing = false
  let drawerWidth = 1
  let lastBarOffset = -1
  let lastDrawerX: number | null = null

  function shiftBar(offset: number) {
    if (!barWindow) return

    const next = Math.max(0, Math.round(offset))
    if (next === lastBarOffset) return
    lastBarOffset = next

    try {
      barWindow.set_margin_left(next)
    } catch (error) {
      console.error("Unable to shift bar for Bar Editor:", error)
    }
  }

  function setBarAttached(attached: boolean) {
    if (!barWindow) return

    if (attached) {
      barWindow.add_css_class("bar-editor-attached")
    } else {
      barWindow.remove_css_class("bar-editor-attached")
    }
  }

  function stopAutoScroll() {
    autoScrollSpeed = 0
  }

  function runAutoScroll() {
    if (autoScrollRunning) return
    autoScrollRunning = true
    timeout(GLib.PRIORITY_DEFAULT, 28, () => {
      if (!scroller || Math.abs(autoScrollSpeed) < 0.1) {
        autoScrollRunning = false
        return GLib.SOURCE_REMOVE
      }

      const adjustment = scroller.get_vadjustment()
      const maxValue = Math.max(0, adjustment.get_upper() - adjustment.get_page_size())
      const next = Math.max(0, Math.min(maxValue, adjustment.get_value() + autoScrollSpeed))
      if (Math.abs(next - adjustment.get_value()) > 0.1) adjustment.set_value(next)
      return GLib.SOURCE_CONTINUE
    })
  }

  function updateAutoScroll(y: number) {
    if (!scroller) return
    const height = Math.max(1, scroller.get_height())
    const edge = Math.max(54, Math.min(130, height * 0.16))
    let speed = 0
    if (y < edge) {
      const strength = Math.max(0, Math.min(1, (edge - y) / edge))
      speed = -(1.2 + 5.4 * strength * strength)
    } else if (y > height - edge) {
      const strength = Math.max(0, Math.min(1, (y - (height - edge)) / edge))
      speed = 1.2 + 5.4 * strength * strength
    }
    autoScrollSpeed = speed
    if (speed) runAutoScroll()
  }

  function restoreViewportScrollValue(value: number) {
    if (!scroller || value <= 0) return

    let attempt = 0
    const restore = () => {
      if (!scroller) return GLib.SOURCE_REMOVE
      const adjustment = scroller.get_vadjustment()
      const maxValue = Math.max(0, adjustment.get_upper() - adjustment.get_page_size())
      adjustment.set_value(Math.max(0, Math.min(maxValue, value)))
      attempt += 1

      // The embedded composer is rebuilt before the parent scroller completes
      // its next allocation. Reapply briefly so GTK cannot snap the drawer to
      // the top after a successful drop/reflow.
      if (attempt < 3) {
        timeout(GLib.PRIORITY_DEFAULT, attempt === 1 ? 24 : 48, restore)
      }
      return GLib.SOURCE_REMOVE
    }

    restore()
  }

  function prepareAutoApply() {
    const target = editor as any
    if (!target?.barSettingsHasChanges?.()) return { changed: false, ok: true }
    const result = target.barSettingsCommitChanges?.()
    return result && typeof result === "object" ? result : { changed: true, ok: Boolean(result) }
  }

  const hide = scopeCallback(() => {
    if (closing) return "Bar Editor is closing"
    const applyResult = prepareAutoApply()
    if (!applyResult.ok) return "Bar Editor save failed"
    const shouldRestart = Boolean(applyResult.changed)

    if (!view || !drawerMotion || !barMotion) {
      shiftBar(0)
      setBarAttached(false)
      opened = false
      closing = false
      if (shouldRestart) restartAgs()
      return "Bar Editor closed"
    }

    opened = false
    closing = true
    stopAutoScroll()
    shell?.set_sensitive(false)

    // Close in two deliberate stages. First return the real bar underneath the
    // still-open opaque editor, where it stays visually occluded. Only after
    // the bar reaches the monitor edge does the editor sheet retract.
    barMotion.to(0, 110, () => {
      if (!closing || opened) return
      drawerMotion?.to(0, 190, () => {
        if (!closing || opened) return
        shiftBar(0)
        setBarAttached(false)
        view?.hide()
        closing = false
        if (shouldRestart) restartAgs()
      })
    })
    return shouldRestart ? "Bar Editor closed and applied" : "Bar Editor closed"
  })

  function ensure() {
    if (view) return

    const bounds = monitorBounds(slot)
    drawerWidth = drawerWidthForMonitor(slot)
    const monitor = monitorForSlot(slot)

    view = new Astal.Window({
      application: app,
      title: "Bar Editor",
      namespace: `ags-bar-editor-${slot}`,
      css_classes: ["studio-window", "bar-config", "bar-config-drawer", `studio-bar-config-${slot}`],
      decorated: false,
      resizable: false,
      layer: Astal.Layer.OVERLAY,
      exclusivity: Astal.Exclusivity.IGNORE,
      keymode: Astal.Keymode.EXCLUSIVE,
      anchor: TOP | BOTTOM | LEFT,
    })
    if (monitor) view.set_gdkmonitor(monitor)
    app.add_window(view)

    const root = new Gtk.Overlay({ css_classes: ["bar-config-drawer-root"] })
    const viewport = new Gtk.Box({
      css_classes: ["bar-config-drawer-viewport"],
      hexpand: true,
      vexpand: true,
    })
    const stage = new Gtk.Fixed({
      css_classes: ["bar-config-drawer-stage"],
      hexpand: true,
      vexpand: true,
    })

    viewport.set_size_request(drawerWidth, bounds.height)
    stage.set_size_request(drawerWidth, bounds.height)
    root.set_child(viewport)
    root.add_overlay(stage)
    root.set_measure_overlay(stage, false)
    root.set_clip_overlay(stage, true)

    shell = column("studio-shell", 0)
    shell.add_css_class("bar-config-drawer-shell")
    shell.set_size_request(drawerWidth, bounds.height)
    shell.set_hexpand(true)
    shell.set_vexpand(true)

    const header = row("studio-header", 10)
    header.add_css_class("bar-config-header")
    const heading = column("studio-heading", 4)
    heading.set_hexpand(true)
    heading.append(label("󰒓  Bar Editor", "studio-title"))
    heading.append(label(
      "Drag widgets and islands directly. Geometry controls affect only the bar on this monitor.",
      "studio-subtitle",
      true,
    ))
    header.append(heading)
    header.append(closeButton(hide))

    editor = WidgetComposer({
      embedded: true,
      monitorIndex: slot,
      monitorHeight: props.monitorHeight ?? bounds.height,
      showSizePanel: true,
      showMonitorPicker: true,
      applyOnly: true,
      getViewportScrollValue: () => scroller?.get_vadjustment().get_value() ?? 0,
      restoreViewportScrollValue,
    })
    editor.set_hexpand(true)
    editor.set_vexpand(true)

    scroller = new Gtk.ScrolledWindow({
      hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
      vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
      hexpand: true,
      vexpand: true,
      css_classes: ["bar-config-drawer-scroll"],
    })
    scroller.set_child(editor)

    // GTK4's DropControllerMotion reports pointer motion during an active DND
    // operation. Near either vertical edge we scroll slowly and continuously,
    // making long layouts editable without dropping the dragged item first.
    const DropControllerMotion = (Gtk as any).DropControllerMotion
    if (DropControllerMotion) {
      const dragMotion = new DropControllerMotion()
      dragMotion.connect("motion", (_controller: unknown, _x: number, y: number) => updateAutoScroll(y))
      dragMotion.connect("leave", stopAutoScroll)
      scroller.add_controller(dragMotion)
    }

    shell.append(header)
    shell.append(scroller)
    stage.put(shell, -drawerWidth, 0)
    view.set_child(root)
    view.set_default_size(drawerWidth, bounds.height)
    view.hide()

    drawerMotion = frameMotion(view, value => {
      const nextX = Math.round(-drawerWidth * (1 - value))
      if (nextX === lastDrawerX) return
      lastDrawerX = nextX
      stage.move(shell!, nextX, 0)
    })
    barMotion = frameMotion(view, value => {
      shiftBar(drawerWidth * value)
    })

    const keys = new Gtk.EventControllerKey()
    keys.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
    keys.connect("key-pressed", (_controller, key: number) => {
      if (key === Gdk.KEY_Escape) {
        hide()
        return true
      }
      return false
    })
    view.add_controller(keys)
    view.connect("close-request", () => {
      hide()
      return true
    })
  }

  const show = scopeCallback(() => {
    ensure()
    if (!view || !drawerMotion || !barMotion) return "Bar Editor is not ready"
    opened = true
    closing = false
    stopAutoScroll()
    shell?.set_sensitive(true)
    setBarAttached(true)
    view.present()

    // Opening remains a single welded motion: the solid editor edge and the
    // real bar advance together. Closing intentionally uses the two-stage path
    // above so the bar disappears underneath the editor before the sheet leaves.
    drawerMotion.to(1, 320)
    barMotion.to(1, 320)
    return "Bar Editor opened"
  })

  const toggle = scopeCallback(() => opened ? hide() : show())
  controllers.set(slot, { show, hide, toggle })

  onCleanup(() => {
    if (controllers.get(slot)?.toggle === toggle) controllers.delete(slot)
    stopAutoScroll()
    shiftBar(0)
    setBarAttached(false)
    drawerMotion?.dispose()
    barMotion?.dispose()
    view?.destroy()
  })

  // The editor has no permanent launcher widget. Super+Shift+B and the Arch menu are
  // the public entry points, keeping the visible bar composition unchanged.
  const controllerAnchor = new Gtk.Box({ visible: false })
  return controllerAnchor
}
