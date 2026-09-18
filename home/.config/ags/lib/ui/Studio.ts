import { attachEdgeSheet } from "./EdgeSheet"
import app from "ags/gtk4/app"
import { Gtk, Gdk, Astal } from "ags/gtk4"
import Pango from "gi://Pango?version=1.0"
import { onCleanup, scopeCallback } from "../lifecycle"
import { monitorBounds, monitorForSlot } from "../../services/monitors"
import { loadBarSettings, DEFAULT_BAR_SETTINGS } from "../../services/barSettings"
import { computeStudioGeometry, type StudioResponsiveOptions } from "../responsive"

export function column(css = "", spacing = 10) {
  return new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing, css_classes: css ? [css] : [] })
}
export function row(css = "", spacing = 10) {
  return new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing, css_classes: css ? [css] : [] })
}
export function label(text: string, css = "", wrap = false) {
  const widget = new Gtk.Label({ label: text, xalign: 0, wrap, css_classes: css ? [css] : [] })
  if (!wrap) widget.set_ellipsize(Pango.EllipsizeMode.END)
  return widget
}
export function pill(text: string, callback: () => void, css = "studio-pill") {
  const button = new Gtk.Button({ label: text, css_classes: [css] })
  button.connect("clicked", scopeCallback(callback))
  return button
}
export function closeButton(callback: () => void) {
  const button = new Gtk.Button({ css_classes: ["studio-close"], focusable: false })
  button.set_halign(Gtk.Align.CENTER)
  button.set_valign(Gtk.Align.CENTER)
  button.set_child(new Gtk.Label({
    label: "󰅖",
    css_classes: ["studio-close-icon"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
    yalign: 0.5,
  }))
  button.connect("clicked", scopeCallback(callback))
  return button
}
export function clear(box: Gtk.Box) {
  let child = box.get_first_child()
  while (child) { const next = child.get_next_sibling(); box.remove(child); child = next }
}
export function scroll(child: Gtk.Widget) {
  const view = new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
    vscrollbar_policy: Gtk.PolicyType.AUTOMATIC, vexpand: true, hexpand: true })
  view.set_child(child)
  return view
}

function loadCssData(provider: Gtk.CssProvider, css: string) {
  const runtimeProvider = provider as any

  // GTK 4.12+ provides load_from_string(). Older GTK 4 releases expose only
  // load_from_data(data, length) through GJS, where length is mandatory.
  if (typeof runtimeProvider.load_from_string === "function") {
    runtimeProvider.load_from_string(css)
    return
  }

  runtimeProvider.load_from_data(css, -1)
}
export type StudioWindowOptions = StudioResponsiveOptions & {
  surface?: "overlay" | "application"
  resizable?: boolean
  revealTransition?: Gtk.RevealerTransitionType
  revealDuration?: number
}

export function studioWindow(
  title: string,
  slot: number,
  kind: string,
  referenceWidth: number,
  referenceHeight: number,
  options: StudioWindowOptions = {},
) {
  const bounds = monitorBounds(slot)
  const barScaleRatio = loadBarSettings(slot).global.scaleMd / DEFAULT_BAR_SETTINGS.global.scaleMd
  const geometry = computeStudioGeometry(
    bounds.width,
    bounds.height,
    referenceWidth,
    referenceHeight,
    barScaleRatio,
    options,
  )
  const densityClasses = [
    `studio-${geometry.sizeClass}`,
    ...(geometry.short ? ["studio-short"] : []),
  ]
  const surface = "overlay"
  const windowName = `ags-studio-${kind}-${slot}`
  const cssClasses = [
    "studio-window",
    kind,
    `studio-${kind}-${slot}`,
    "studio-overlay-window",
    "studio-application-window",
    ...densityClasses,
  ]

  // AGS surfaces share a bottom-anchored paper entrance.
  const window = new Astal.Window({
    title, decorated: false, resizable: false,
    css_classes: cssClasses,
  })

  window.set_name(windowName)

  if (surface === "overlay") {
    window.set_namespace(windowName)
    window.set_layer(Astal.Layer.OVERLAY)
    window.set_exclusivity(Astal.Exclusivity.IGNORE)
    window.set_keymode(Astal.Keymode.EXCLUSIVE)
    const monitor = monitorForSlot(slot)
    if (monitor) window.set_gdkmonitor(monitor)
  }

  app.add_window(window)
  const provider = new Gtk.CssProvider()
  const css = `.studio-${kind}-${slot} { font-size: ${Math.max(84, Math.round(100 * geometry.fontScale))}%; }`
  loadCssData(provider, css)
  const display = Gdk.Display.get_default()
  if (display) Gtk.StyleContext.add_provider_for_display(display, provider, 850)
  const shell = column("studio-shell", 0)
  shell.set_hexpand(true)
  shell.set_vexpand(true)

  const sheet = attachEdgeSheet(window, shell, geometry.width, geometry.height, slot)
  const { show, hide, isOpen } = sheet
  window.connect("close-request", () => { hide(); return true })
  onCleanup(() => {
    window.destroy()
    if (display) Gtk.StyleContext.remove_provider_for_display(display, provider)
  })
  return { window, shell, show, hide, isOpen, scale: geometry.fontScale, width: geometry.width, height: geometry.height, sizeClass: geometry.sizeClass }
}
