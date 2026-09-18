import { Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"
import { onCleanup, scopeCallback, timeout } from "../../lib/lifecycle"
import ThemeCarousel from "./ThemeCarousel"
import { handleBarConfigRequest } from "../settings/BarConfigCenter"
import { monitorBounds } from "../../services/monitors"
import { applyWallpaper, getThemeKindLabel, getThemeStatusLabel, readThemeState } from "../../services/theme"
import { column, row, label, closeButton, scroll, studioWindow } from "../../lib/ui/Studio"
import { createInfoPopover } from "../../lib/ui/Popover"
import { createActionsSection } from "../../lib/ui/Actions"
import { actionButton, actionButtonRow, createActionMenu } from "../../lib/ui/ActionMenu"

type Controller = { show: () => string; hide: () => string; toggle: () => string }
const controllers = new Map<number, Controller>()

function current() {
  return controllers.get(0) ?? controllers.values().next().value
}

export function showThemeCenter() { return current()?.show() ?? "Theme is not ready" }
export function hideThemeCenter() { return current()?.hide() ?? "Theme is not ready" }
export function toggleThemeCenter() { return current()?.toggle() ?? "Theme is not ready" }
export function handleThemeRequest(action = "toggle", monitorIndex?: number) {
  const requested = Number.isFinite(monitorIndex) ? Math.max(0, Math.round(Number(monitorIndex))) : null
  const controller = (requested === null ? null : controllers.get(requested)) ?? current()
  if (!controller) return "Theme is not ready"
  if (action === "show" || action === "open") return controller.show()
  if (action === "hide" || action === "close") return controller.hide()
  return controller.toggle()
}

export default function ThemeCenter(props: { monitorIndex?: number; monitorHeight?: number } = {}) {
  const slot = props.monitorIndex ?? 0
  const button = new Gtk.Button({
    css_classes: ["bar-button", "appmenu-button", "theme-menu-button"],
    focusable: false,
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })
  button.set_child(new Gtk.Label({
    label: "",
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    // Nerd Font's Arch glyph is optically right-heavy; nudge it slightly
    // left inside the existing button without changing island geometry.
    xalign: 0.42,
    yalign: 0.5,
  }))

  const themeState = readThemeState()
  createInfoPopover(button, {
    icon: "",
    title: "Appearance",
    value: themeState.fileName,
    detail: `${getThemeKindLabel(themeState)} • ${getThemeStatusLabel(themeState)}`,
    extra: createActionsSection([
      { label: "Click", value: "Choose Theme Studio or Bar Editor" },
      { label: "Super+Shift+B", value: "Open Bar Editor directly" },
      { label: "Super+B", value: "Toggle the shell bar" },
      { label: "Super+H", value: "Open keyboard shortcuts" },
    ]),
    className: "theme-popover-card",
  })

  let launcherMenu: ReturnType<typeof createActionMenu> | null = null
  const launcherActions = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 6,
    hexpand: true,
  })
  const themeButton = actionButton("Theme Studio", () => {
    launcherMenu?.close()
    handleThemeRequest("show", slot)
  })
  const barButton = actionButton("Bar Editor", () => {
    launcherMenu?.close()
    handleBarConfigRequest("show", slot)
  })
  launcherActions.append(actionButtonRow([themeButton, barButton]))
  launcherMenu = createActionMenu(button, {
    icon: "",
    title: "Arch Studio",
    subtitle: "Choose what you want to customize.",
    content: launcherActions,
    className: "theme-launcher-action-card",
    iconXalign: 0.42,
  })

  let view: ReturnType<typeof studioWindow> | null = null
  let carousel: Gtk.Widget | null = null
  let status: Gtk.Label | null = null
  onCleanup(() => controllers.delete(slot))

  function setStatus(message = "") {
    if (!status) return
    const next = message.trim()
    status.set_label(next)
    status.set_visible(Boolean(next))
  }

  const hide = scopeCallback(() => { view?.hide(); return "Theme closed" })

  function ensure() {
    if (view) return
    view = studioWindow("Theme", slot, "theme", 1320, 520, {
      widthRatio: 0.82,
      heightRatio: 0.34,
      minWidth: 900,
      minHeight: 440,
      maxWidth: 1560,
      maxHeight: 580,
      marginRatio: 0.035,
      minMargin: 28,
      maxMargin: 72,
      surface: "overlay",
      resizable: false,
    })

    const bounds = monitorBounds(slot)
    const chrome = row("theme-app-chrome", 8)
    chrome.set_hexpand(true)
    chrome.append(label("Theme", "theme-app-chrome-title"))
    const spacer = new Gtk.Box({ hexpand: true })
    chrome.append(spacer)
    chrome.append(closeButton(hide))
    const dashboard = column("theme-dashboard", 10)
    dashboard.set_hexpand(true)
    dashboard.set_vexpand(false)
    dashboard.set_halign(Gtk.Align.CENTER)
    const dashboardWidth = Math.max(1, Math.min(view.width - 18, Math.round(bounds.width * 0.96)))
    dashboard.set_size_request(dashboardWidth, -1)
    dashboard.append(chrome)

    const carouselWidth = Math.max(1, Math.min(dashboardWidth - 6, Math.round(bounds.width * 0.96)))
    carousel = ThemeCarousel({
      width: carouselWidth,
      height: bounds.height,
      onStatus: setStatus,
      onApplyRequest: (entry) => {
        setStatus(`Applying ${entry.fileName}…`)
        view!.hide(() => {
          timeout(GLib.PRIORITY_DEFAULT, 240, () => {
            const started = applyWallpaper(entry.path)
            if (!started) setStatus(`Could not apply ${entry.fileName}`)
            return GLib.SOURCE_REMOVE
          })
        })
        return true
      },
    })
    carousel.set_hexpand(true)
    carousel.set_vexpand(false)
    dashboard.append(carousel)

    status = label("", "theme-carousel-status")
    status.set_visible(false)
    dashboard.append(status)

    const content = scroll(dashboard)
    content.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
    content.set_hexpand(true)
    content.set_vexpand(true)
    ;(content as any).set_propagate_natural_height?.(false)
    ;(content as any).set_propagate_natural_width?.(false)
    const contentHeight = Math.max(350, view.height - 14)
    ;(content as any).set_min_content_height?.(contentHeight)
    ;(content as any).set_max_content_height?.(contentHeight)
    view.shell.set_size_request(view.width, view.height)
    view.shell.append(content)

    const keys = new Gtk.EventControllerKey()
    keys.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
    keys.connect("key-pressed", (_controller, key: number) => {
      if (key === Gdk.KEY_Escape) { hide(); return true }
      if (key === Gdk.KEY_Left) { (carousel as any)?.themeCarouselSelectPrevious?.(); return true }
      if (key === Gdk.KEY_Right) { (carousel as any)?.themeCarouselSelectNext?.(); return true }
      if (key === Gdk.KEY_Return || key === Gdk.KEY_KP_Enter || key === Gdk.KEY_space) {
        ;(carousel as any)?.themeCarouselApply?.()
        return true
      }
      if (key === Gdk.KEY_r || key === Gdk.KEY_R) {
        ;(carousel as any)?.themeCarouselReload?.()
        return true
      }
      return false
    })
    view.window.add_controller(keys)
  }

  const show = scopeCallback(() => {
    ensure()
    view!.show()
    return "Theme opened"
  })
  const toggle = scopeCallback(() => view?.isOpen() ? hide() : show())
  controllers.set(slot, { show, hide, toggle })
  return button
}
