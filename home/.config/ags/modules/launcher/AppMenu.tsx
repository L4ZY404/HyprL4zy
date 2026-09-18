import { Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"
import { filterDesktopApps, readDesktopApps, launchDesktopApp, type DesktopApplication } from "../../services/apps"
import { CONFIG_HOME } from "../../lib/paths"
import { readFile, readJson, writeFile } from "../../lib/shell"
import { idle, timeout, onCleanup, scopeCallback } from "../../lib/lifecycle"
import { column, row, label, pill, scroll, studioWindow } from "../../lib/ui/Studio"

type Controller = { show: () => string; hide: () => string; toggle: () => string }
const controllers = new Map<number, Controller>()
function current() { return controllers.get(0) ?? controllers.values().next().value }
export function showQuickLauncher() { return current()?.show() ?? "Applications is not ready" }
export function hideQuickLauncher() { return current()?.hide() ?? "Applications is not ready" }
export function toggleQuickLauncher() { return current()?.toggle() ?? "Applications is not ready" }
export function handleQuickLauncherRequest(action = "toggle") {
  return action === "show" || action === "open" ? showQuickLauncher()
    : action === "hide" || action === "close" ? hideQuickLauncher() : toggleQuickLauncher()
}
const statePath = `${CONFIG_HOME}/ags/generated/launcher-favorites.json`
const stored = readJson<unknown>(readFile(statePath), [])
const favorites = new Set<string>(Array.isArray(stored) ? stored.filter(value => typeof value === "string") : [])
function saveFavorites() {
  GLib.mkdir_with_parents(`${CONFIG_HOME}/ags/generated`, 0o755)
  return writeFile(statePath, JSON.stringify([...favorites], null, 2) + "\n")
}

export default function AppMenu(props: { monitorIndex?: number; monitorHeight?: number } = {}) {
  const slot = props.monitorIndex ?? 0
  const button = new Gtk.Button({ css_classes: ["bar-button", "appmenu-button", "quick-actions-launcher"] })
  button.set_child(new Gtk.Label({ label: "󰀻" })); button.set_focusable(false)
  button.set_tooltip_text("Applications")
  let view: ReturnType<typeof studioWindow> | null = null
  let search: Gtk.Entry | null = null
  let applications: DesktopApplication[] = []
  let visible: DesktopApplication[] = []
  let cards: Gtk.Widget[] = []
  let selected = 0
  let tab = "all"
  let disposed = false
  let token = 0
  let render = () => {}
  let resetScroll = () => {}
  let status: Gtk.Label | null = null
  let selectionVersion = 0
  onCleanup(() => { disposed = true; token++; controllers.delete(slot) })

  const hide = scopeCallback(() => {
    view?.hide()
    search?.set_text(""); selected = 0
    return "Applications closed"
  })
  function activate() {
    const info = visible[selected]
    if (!info) return
    view?.hide(() => {
      search?.set_text(""); selected = 0
      launchDesktopApp(info)
    })
  }
  function ensure() {
    if (view) return
    view = studioWindow("Applications", slot, "applications", 980, 760, {
      widthRatio: 0.52,
      heightRatio: 0.74,
      minWidth: 560,
      minHeight: 500,
      maxWidth: 1120,
      maxHeight: 860,
      revealTransition: Gtk.RevealerTransitionType.SLIDE_UP,
      revealDuration: 220,
    })
    const header = row("studio-header")
    const heading = column("studio-heading", 4); heading.set_hexpand(true)
    heading.append(label("󰀻  Applications", "studio-title"))
    heading.append(label("Your apps, one search away.", "studio-subtitle"))
    header.append(heading); header.append(pill("󰅖", hide, "studio-close"))
    search = new Gtk.Entry({ placeholder_text: "Search applications…", css_classes: ["studio-search"] })
    const tabs = row("launcher-tabs")
    const all = pill("All apps", () => { tab = "all"; selected = 0; render(); search?.grab_focus() })
    const pinned = pill("  Favorites", () => { tab = "favorites"; selected = 0; render(); search?.grab_focus() })
    all.set_focusable(false); pinned.set_focusable(false)
    status = label("Loading applications…", "studio-subtitle"); status.set_hexpand(true); status.set_xalign(1)
    tabs.append(all); tabs.append(pinned); tabs.append(status)
    const grid = new Gtk.Grid({ row_spacing: 10, column_spacing: 10, column_homogeneous: true,
      css_classes: ["launcher-grid"], valign: Gtk.Align.START, hexpand: true })
    const scroller = scroll(grid)
    scroller.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
    resetScroll = () => scroller.get_vadjustment().set_value(0)
    const empty = column("launcher-empty"); empty.set_valign(Gtk.Align.CENTER); empty.set_halign(Gtk.Align.CENTER)
    empty.append(label("󰍉", "launcher-empty-icon"))
    const emptyText = label("No applications found", "studio-section-title"); empty.append(emptyText)
    const content = new Gtk.Stack({ vexpand: true, transition_type: Gtk.StackTransitionType.CROSSFADE, transition_duration: 130,
      hhomogeneous: false, vhomogeneous: false })
    content.add_named(scroller, "apps"); content.add_named(empty, "empty")
    const footer = row("studio-footer")
    footer.append(label("↑ ↓ ← →  Navigate    Enter  Open    Esc  Close", "studio-key-hint"))
    const hint = label("☆  Pin your favorites", "studio-key-hint"); hint.set_hexpand(true); hint.set_xalign(1); footer.append(hint)
    view.shell.append(header); view.shell.append(search); view.shell.append(tabs); view.shell.append(content); view.shell.append(footer)
    const columns = view.width >= 940 ? 3 : view.width >= 680 ? 2 : 1
    function bounds(widget: Gtk.Widget) {
      try {
        const result = (widget as any).compute_bounds(grid)
        const rect = Array.isArray(result) && result[0] ? result[1] : null
        return rect ? { y: rect.get_y(), height: rect.get_height() } : null
      } catch { return null }
    }
    function syncSelection(reveal = true) {
      selected = Math.max(0, Math.min(selected, cards.length - 1))
      cards.forEach((card, index) => index === selected ? card.add_css_class("keyboard-selected") : card.remove_css_class("keyboard-selected"))
      if (!reveal) return
      idle(GLib.PRIORITY_DEFAULT_IDLE, () => {
        const card = cards[selected]
        if (!card || disposed) return GLib.SOURCE_REMOVE
        const rect = bounds(card); const adjustment = scroller.get_vadjustment()
        if (rect) {
          const top = adjustment.get_value(), page = adjustment.get_page_size()
          if (rect.y < top) adjustment.set_value(Math.max(0, rect.y - 8))
          else if (rect.y + rect.height > top + page) adjustment.set_value(Math.max(0, Math.min(adjustment.get_upper() - page, rect.y + rect.height - page + 8)))
        }
        return GLib.SOURCE_REMOVE
      })
    }
    render = () => {
      if (disposed) return
      while (grid.get_first_child()) grid.remove(grid.get_first_child()!)
      const source = tab === "favorites" ? applications.filter(item => favorites.has(item.id)) : applications
      visible = filterDesktopApps(source, search!.get_text())
      cards = []
      all.set_css_classes(["studio-pill", ...(tab === "all" ? ["active"] : [])])
      pinned.set_css_classes(["studio-pill", ...(tab === "favorites" ? ["active"] : [])])
      visible.forEach((info, index) => {
        const tile = column("launcher-tile", 0)
        // GTK's :hover state can be inherited through nested buttons and theme
        // nodes. Drive the visual hover explicitly so the complete tile owns
        // one stable rounded border regardless of which child is under the pointer.
        const hoverMotion = new Gtk.EventControllerMotion()
        hoverMotion.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
        hoverMotion.connect("enter", () => tile.add_css_class("pointer-hover"))
        hoverMotion.connect("leave", () => tile.remove_css_class("pointer-hover"))
        tile.add_controller(hoverMotion)
        const open = new Gtk.Button({ css_classes: ["launcher-open"], hexpand: true, vexpand: true, focusable: false })
        const body = row("launcher-tile-row", 12)
        body.set_halign(Gtk.Align.FILL)
        body.set_valign(Gtk.Align.CENTER)
        const iconWrap = new Gtk.Box({ css_classes: ["launcher-app-icon-wrap"], halign: Gtk.Align.START, valign: Gtk.Align.CENTER })
        const icon = new Gtk.Image({ pixel_size: Math.round((view!.width < 680 ? 36 : 42) * view!.scale) })
        if (info.icon.startsWith("/")) icon.set_from_file(info.icon)
        else icon.set_from_icon_name(info.icon || "application-x-executable")
        icon.set_halign(Gtk.Align.CENTER)
        icon.set_valign(Gtk.Align.CENTER)
        icon.set_hexpand(true)
        icon.set_vexpand(true)
        iconWrap.append(icon)
        const copy = column("launcher-app-copy", 4)
        copy.set_hexpand(true)
        const nameLabel = label(info.name, "launcher-app-name")
        nameLabel.set_hexpand(true)
        const detail = label(info.comment || "Application", "launcher-app-detail")
        detail.set_max_width_chars(46)
        copy.append(nameLabel)
        copy.append(detail)
        body.append(iconWrap)
        body.append(copy)
        open.set_child(body); open.set_tooltip_text(info.name + "\n" + info.comment)
        open.connect("clicked", () => { selected = index; activate() })
        const pin = pill(favorites.has(info.id) ? "★" : "☆", () => {
          if (favorites.has(info.id)) favorites.delete(info.id); else favorites.add(info.id)
          if (!saveFavorites()) status?.set_label("Could not save favorites")
          else render()
          search?.grab_focus()
        }, "launcher-pin")
        pin.set_focusable(false); pin.set_halign(Gtk.Align.END)
        pin.set_tooltip_text(favorites.has(info.id) ? "Remove from favorites" : "Add to favorites")
        tile.append(open); tile.append(pin)
        grid.attach(tile, index % columns, Math.floor(index / columns), 1, 1); cards.push(tile)
      })
      emptyText.set_label(tab === "favorites" && !search!.get_text() ? "Pin apps with the star to see them here" : "No matching applications")
      content.set_visible_child_name(visible.length ? "apps" : "empty")
      status?.set_label(`${visible.length} app${visible.length === 1 ? "" : "s"}`)
      syncSelection(false)
    }
    search.connect("changed", () => { selectionVersion++; selected = 0; render(); resetScroll() })
    const keys = new Gtk.EventControllerKey(); keys.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
    keys.connect("key-pressed", (_controller, key: number, _code: number, modifiers: number) => {
      const ctrl = Boolean(modifiers & Gdk.ModifierType.CONTROL_MASK)
      if (key === Gdk.KEY_Escape) { hide(); return true }
      if (key === Gdk.KEY_Return || key === Gdk.KEY_KP_Enter) { activate(); return true }
      if (ctrl && key === Gdk.KEY_f) { search?.grab_focus(); return true }
      const delta = key === Gdk.KEY_Down ? columns : key === Gdk.KEY_Up ? -columns
        : key === Gdk.KEY_Right ? 1 : key === Gdk.KEY_Left ? -1
        : key === Gdk.KEY_Page_Down ? columns * 3 : key === Gdk.KEY_Page_Up ? -columns * 3 : null
      if (delta !== null) { selectionVersion++; selected += delta; syncSelection(); return true }
      if (key === Gdk.KEY_Home || key === Gdk.KEY_End) { selectionVersion++; selected = key === Gdk.KEY_Home ? 0 : cards.length - 1; syncSelection(); return true }
      return false
    })
    view.window.add_controller(keys)
    let pending = false
    const wheel = new Gtk.EventControllerScroll({ flags: Gtk.EventControllerScrollFlags.VERTICAL })
    wheel.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
    wheel.connect("scroll", () => {
      if (!pending) {
        pending = true; const version = selectionVersion
        timeout(GLib.PRIORITY_DEFAULT, 80, () => {
          pending = false
          if (version !== selectionVersion || disposed) return GLib.SOURCE_REMOVE
          const adjustment = scroller.get_vadjustment(), anchor = adjustment.get_value() + adjustment.get_page_size() * 0.3
          let best = selected, distance = Infinity
          cards.forEach((card, index) => {
            if (index % columns !== selected % columns) return
            const rect = bounds(card); if (!rect) return
            const score = Math.abs(rect.y + rect.height / 2 - anchor)
            if (score < distance) { best = index; distance = score }
          })
          selected = best; syncSelection(false)
          return GLib.SOURCE_REMOVE
        })
      }
      return false
    })
    scroller.add_controller(wheel)
  }
  const show = scopeCallback(() => {
    ensure(); tab = "all"; selected = 0; search!.set_text(""); render(); resetScroll(); view!.show(); search!.grab_focus()
    const request = ++token
    void readDesktopApps().then(items => { if (!disposed && request === token) { applications = items; render() } })
    return "Applications opened"
  })
  const toggle = scopeCallback(() => view?.isOpen() ? hide() : show())
  controllers.set(slot, { show, hide, toggle }); button.connect("clicked", toggle)
  return button
}
