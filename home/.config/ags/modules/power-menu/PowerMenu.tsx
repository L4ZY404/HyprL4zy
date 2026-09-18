import app from "ags/gtk4/app"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { onCleanup, scopeCallback } from "../../lib/lifecycle"
import { monitorForSlot } from "../../services/monitors"
import { runPowerAction, type PowerAction } from "../../services/power"
import { attachRightSheet } from "../../lib/ui/SideSheet"

const controllers = new Map<number, { show: () => string; hide: () => string; toggle: () => string }>()

function current() {
  return controllers.get(0) ?? controllers.values().next().value
}

export function showPowerMenu() {
  return current()?.show() ?? "Power menu is not ready"
}

export function hidePowerMenu() {
  return current()?.hide() ?? "Power menu is not ready"
}

export function togglePowerMenu() {
  return current()?.toggle() ?? "Power menu is not ready"
}

export function handlePowerMenuRequest(action = "toggle") {
  if (action === "show" || action === "open") return showPowerMenu()
  if (action === "hide" || action === "close") return hidePowerMenu()
  return togglePowerMenu()
}

type PowerItem = {
  action: PowerAction
  icon: string
  title: string
  subtitle: string
  danger?: boolean
}

type PowerGeometry = {
  width: number
  actionHeight: number
  actionGap: number
  outerX: number
  outerY: number
  innerX: number
  rowGap: number
  iconSize: number
}

const items: PowerItem[] = [
  { action: "shutdown", icon: "", title: "Shutdown", subtitle: "Power off this system", danger: true },
  { action: "reboot", icon: "", title: "Reboot", subtitle: "Restart this system" },
  { action: "lock", icon: "", title: "Lock", subtitle: "Lock the current session" },
  { action: "logout", icon: "󰍃", title: "Logout", subtitle: "Exit the Hyprland session" },
]

/**
 * Power menu dimensions are ratios of the active monitor, never fixed panel
 * pixels. GDK monitor geometry is already in logical coordinates, so this also
 * behaves correctly with Wayland/HiDPI scaling.
 */
function powerGeometry(boundsWidth: number, boundsHeight: number): PowerGeometry {
  // Everything is derived from monitor proportions. The height term prevents
  // ultrawide monitors from producing an oversized drawer, while the width
  // term keeps portrait/small displays proportional.
  const width = Math.round(Math.min(boundsWidth * 0.19, boundsHeight * 0.29))
  const actionHeight = Math.round(Math.min(boundsHeight * 0.088, width * 0.285))

  return {
    width,
    actionHeight,
    actionGap: Math.round(Math.min(boundsHeight * 0.010, width * 0.035)),
    outerX: Math.round(width * 0.07),
    outerY: Math.round(Math.min(boundsHeight * 0.023, width * 0.075)),
    innerX: Math.round(width * 0.04),
    rowGap: Math.round(width * 0.045),
    iconSize: Math.round(Math.min(actionHeight * 0.58, width * 0.17)),
  }
}

/**
 * A clickable action row implemented as a neutral Gtk.Box rather than a
 * Gtk.Button. This deliberately avoids GTK's native :active/:focus painting,
 * which can otherwise make the selected row look like a different component.
 */
function powerAction(
  item: PowerItem,
  geometry: PowerGeometry,
  activate: () => void,
  select: () => void,
) {
  const action = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: geometry.rowGap,
    hexpand: true,
    valign: Gtk.Align.CENTER,
    css_classes: ["power-menu-action", ...(item.danger ? ["danger"] : [])],
  })
  action.set_size_request(-1, geometry.actionHeight)
  action.set_margin_start(geometry.outerX)
  action.set_margin_end(geometry.outerX)

  const icon = new Gtk.Label({
    label: item.icon,
    css_classes: ["power-menu-icon"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
    yalign: 0.5,
  })
  icon.set_size_request(geometry.iconSize, geometry.iconSize)
  icon.set_margin_start(geometry.innerX)

  const copy = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 2,
    hexpand: true,
    valign: Gtk.Align.CENTER,
  })
  copy.append(new Gtk.Label({ label: item.title, xalign: 0, css_classes: ["power-menu-title"] }))
  copy.append(new Gtk.Label({ label: item.subtitle, xalign: 0, css_classes: ["power-menu-subtitle"] }))

  const chevron = new Gtk.Label({
    label: "›",
    css_classes: ["power-menu-chevron"],
    halign: Gtk.Align.END,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
    yalign: 0.5,
  })
  chevron.set_margin_end(geometry.innerX)

  action.append(icon)
  action.append(copy)
  action.append(chevron)

  // Hover is an explicit class, so no toolkit-selected/focused visual state can
  // leak into the card. The interaction signal is border-only in SCSS.
  const motion = new Gtk.EventControllerMotion()
  motion.connect("enter", scopeCallback(() => {
    select()
    action.add_css_class("is-hovered")
  }))
  motion.connect("leave", scopeCallback(() => action.remove_css_class("is-hovered")))
  action.add_controller(motion)

  const click = new Gtk.GestureClick()
  click.set_button(0)
  click.connect("released", scopeCallback((gesture) => {
    if (gesture.get_current_button() === 1) {
      select()
      activate()
    }
  }))
  action.add_controller(click)

  return action
}

export default function PowerMenu(props: { monitorIndex?: number; monitorHeight?: number } = {}) {
  const slot = props.monitorIndex ?? 0
  const monitor = monitorForSlot(slot)
  if (!monitor) throw new Error(`Power menu monitor ${slot} is not registered`)

  const bounds = monitor.get_geometry()
  const geometry = powerGeometry(bounds.width, bounds.height)
  const namespace = `ags-power-menu-${slot}`

  const window = new Astal.Window({
    title: "Power Menu",
    decorated: false,
    resizable: false,
    css_classes: ["power-menu-window"],
  })
  window.set_name(namespace)
  window.set_namespace(namespace)
  window.set_layer(Astal.Layer.OVERLAY)
  window.set_exclusivity(Astal.Exclusivity.IGNORE)
  window.set_keymode(Astal.Keymode.EXCLUSIVE)
  window.set_gdkmonitor(monitor)
  app.add_window(window)

  const shell = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["power-menu-shell"],
    hexpand: true,
    vexpand: false,
    focusable: true,
  })

  const content = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    css_classes: ["power-menu-content"],
    vexpand: false,
  })
  content.set_margin_top(geometry.outerY)
  content.set_margin_bottom(geometry.outerY)

  const header = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 0,
    css_classes: ["power-menu-header-block"],
  })
  header.set_margin_start(geometry.outerX)
  header.set_margin_end(geometry.outerX)

  header.append(new Gtk.Label({
    label: "SESSION",
    xalign: 0,
    css_classes: ["power-menu-eyebrow"],
  }))
  header.append(new Gtk.Label({
    label: "Power",
    xalign: 0,
    css_classes: ["power-menu-heading"],
  }))
  header.append(new Gtk.Label({
    label: "Esc to close",
    xalign: 0,
    css_classes: ["power-menu-hint"],
  }))
  content.append(header)

  const actions = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: geometry.actionGap,
    css_classes: ["power-menu-actions"],
  })
  content.append(actions)
  shell.append(content)

  let sheet: ReturnType<typeof attachRightSheet>

  const hide = scopeCallback(() => {
    sheet.hide()
    return "Power menu closed"
  })

  const execute = scopeCallback((action: PowerAction) => {
    sheet.hide(() => runPowerAction(action))
  })

  const actionRows: Gtk.Box[] = []
  let selectedIndex = 0

  const selectIndex = scopeCallback((index: number) => {
    if (actionRows.length === 0) return
    const normalized = ((index % actionRows.length) + actionRows.length) % actionRows.length
    actionRows.forEach((row, rowIndex) => {
      if (rowIndex === normalized) row.add_css_class("is-selected")
      else row.remove_css_class("is-selected")
    })
    selectedIndex = normalized
  })

  items.forEach((item, index) => {
    const row = powerAction(
      item,
      geometry,
      () => execute(item.action),
      () => selectIndex(index),
    )
    actionRows.push(row)
    actions.append(row)
  })
  selectIndex(0)

  // SideSheet measures the completed widget tree and uses that natural height
  // for the layer surface. Nothing here assumes a fixed-size panel.
  sheet = attachRightSheet(window, shell, geometry.width, slot)

  const keys = new Gtk.EventControllerKey()
  keys.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
  keys.connect("key-pressed", (_controller, key: number) => {
    if (key === Gdk.KEY_Escape) {
      hide()
      return true
    }

    if (key === Gdk.KEY_Up || key === Gdk.KEY_KP_Up) {
      selectIndex(selectedIndex - 1)
      return true
    }

    if (key === Gdk.KEY_Down || key === Gdk.KEY_KP_Down) {
      selectIndex(selectedIndex + 1)
      return true
    }

    if (key === Gdk.KEY_Home) {
      selectIndex(0)
      return true
    }

    if (key === Gdk.KEY_End) {
      selectIndex(actionRows.length - 1)
      return true
    }

    if (key === Gdk.KEY_Return || key === Gdk.KEY_KP_Enter || key === Gdk.KEY_ISO_Enter) {
      const item = items[selectedIndex]
      if (item) execute(item.action)
      return true
    }

    return false
  })
  window.add_controller(keys)
  window.connect("close-request", () => {
    hide()
    return true
  })

  const show = scopeCallback(() => {
    selectIndex(0)
    sheet.show()
    shell.grab_focus()
    return "Power menu opened"
  })
  const toggle = scopeCallback(() => sheet.isOpen() ? hide() : show())

  controllers.set(slot, { show, hide, toggle })
  onCleanup(() => {
    controllers.delete(slot)
    window.destroy()
  })

  return window
}
