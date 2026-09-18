import { Gdk, Gtk } from "ags/gtk4"
import { onCleanup, scopeCallback } from "../../lib/lifecycle"
import { column, row, label, closeButton, scroll, studioWindow } from "../../lib/ui/Studio"

type Controller = { show: () => string; hide: () => string; toggle: () => string }
type ShortcutEntry = { keys: string; action: string }
type ShortcutSection = { title: string; icon: string; entries: ShortcutEntry[] }

const controllers = new Map<number, Controller>()

const SECTIONS: ShortcutSection[] = [
  {
    title: "Studio",
    icon: "󰨇",
    entries: [
      { keys: "Super + H", action: "Open shortcuts" },
      { keys: "Super + Shift + B", action: "Open Bar Editor" },
      { keys: "Super + B", action: "Toggle the shell bar" },
      { keys: "Super + R", action: "Restart HyprLazy" },
      { keys: "Super + W", action: "Open Theme Studio" },
    ],
  },
  {
    title: "Applications",
    icon: "󰀻",
    entries: [
      { keys: "Super + Enter", action: "Open terminal" },
      { keys: "Super + Space", action: "Open app launcher" },
      { keys: "Super + Shift + F", action: "Open browser" },
      { keys: "Super + M", action: "Open music player" },
      { keys: "Super + P", action: "Open power menu" },
    ],
  },
  {
    title: "Windows",
    icon: "󱂬",
    entries: [
      { keys: "Super + Q", action: "Close active window" },
      { keys: "Super + C", action: "Toggle fullscreen" },
      { keys: "Super + F", action: "Toggle floating" },
      { keys: "Super + Arrow", action: "Move focus" },
      { keys: "Super + Shift + Arrow", action: "Resize active window" },
      { keys: "Super + Drag", action: "Move window" },
      { keys: "Super + Right Drag", action: "Resize window" },
    ],
  },
  {
    title: "Workspaces",
    icon: "󱂬",
    entries: [
      { keys: "Super + 1…0", action: "Switch workspace 1…10" },
      { keys: "Super + Shift + 1…0", action: "Move window to workspace" },
      { keys: "Super + Wheel", action: "Previous / next workspace" },
    ],
  },
  {
    title: "Capture",
    icon: "󰹑",
    entries: [
      { keys: "Super + S", action: "Screenshot" },
      { keys: "Super + Shift + S", action: "Area screenshot" },
      { keys: "Super + Ctrl + S", action: "Screenshot after 10 seconds" },
    ],
  },
  {
    title: "Media & hardware",
    icon: "󰎆",
    entries: [
      { keys: "Volume Up / Down", action: "Adjust volume" },
      { keys: "Mute", action: "Toggle mute" },
      { keys: "Brightness Up / Down", action: "Adjust brightness" },
      { keys: "Media Play", action: "Play / pause" },
      { keys: "Media Next / Previous", action: "Change track" },
    ],
  },
]

function current() {
  return controllers.get(0) ?? controllers.values().next().value
}

export function handleShortcutsRequest(action = "toggle", monitorIndex?: number) {
  const requested = Number.isFinite(monitorIndex) ? Math.max(0, Math.round(Number(monitorIndex))) : null
  const controller = (requested === null ? null : controllers.get(requested)) ?? current()
  if (!controller) return "Shortcuts are not ready"
  if (action === "show" || action === "open") return controller.show()
  if (action === "hide" || action === "close") return controller.hide()
  return controller.toggle()
}

function shortcutRow(keys: string, action: string) {
  const item = row("shortcuts-entry", 12)
  item.set_hexpand(true)

  const key = label(keys, "shortcuts-key")
  key.set_xalign(0.5)
  key.set_halign(Gtk.Align.CENTER)
  item.append(key)

  const description = label(action, "shortcuts-action")
  description.set_hexpand(true)
  description.set_halign(Gtk.Align.FILL)
  item.append(description)
  return item
}

function shortcutSection(section: ShortcutSection) {
  const card = column("shortcuts-section", 7)
  card.set_hexpand(true)

  const heading = row("shortcuts-section-heading", 9)
  const icon = label(section.icon, "shortcuts-section-icon")
  icon.set_xalign(0.5)
  heading.append(icon)
  heading.append(label(section.title, "shortcuts-section-title"))
  card.append(heading)

  for (const entry of section.entries) card.append(shortcutRow(entry.keys, entry.action))
  return card
}

export default function ShortcutsCenter(props: { monitorIndex?: number } = {}) {
  const slot = props.monitorIndex ?? 0
  let view: ReturnType<typeof studioWindow> | null = null
  onCleanup(() => controllers.delete(slot))

  const hide = scopeCallback(() => {
    view?.hide()
    return "Shortcuts closed"
  })

  function ensure() {
    if (view) return
    view = studioWindow("Shortcuts", slot, "shortcuts", 860, 720, {
      widthRatio: 0.54,
      heightRatio: 0.74,
      minWidth: 620,
      minHeight: 500,
      maxWidth: 920,
      maxHeight: 820,
      marginRatio: 0.04,
      minMargin: 24,
      maxMargin: 64,
      surface: "overlay",
      resizable: false,
    })

    const root = column("shortcuts-root", 10)
    root.set_hexpand(true)
    root.set_vexpand(true)

    const header = row("shortcuts-header", 10)
    header.set_hexpand(true)
    const titleBox = column("shortcuts-title-box", 2)
    titleBox.set_hexpand(true)
    titleBox.append(label("Keyboard Shortcuts", "shortcuts-title"))
    titleBox.append(label("Quick reference for the default HyprLazy bindings.", "shortcuts-subtitle"))
    header.append(titleBox)
    header.append(closeButton(hide))
    root.append(header)

    const list = column("shortcuts-list", 10)
    list.set_hexpand(true)
    for (const section of SECTIONS) list.append(shortcutSection(section))

    const scroller = scroll(list)
    scroller.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
    scroller.set_hexpand(true)
    scroller.set_vexpand(true)
    root.append(scroller)

    root.append(label("Esc closes this panel • Super+H toggles it", "shortcuts-footer"))
    view.shell.append(root)

    const keys = new Gtk.EventControllerKey()
    keys.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
    keys.connect("key-pressed", (_controller, key: number) => {
      if (key === Gdk.KEY_Escape) {
        hide()
        return true
      }
      return false
    })
    view.window.add_controller(keys)
  }

  const show = scopeCallback(() => {
    ensure()
    view!.show()
    return "Shortcuts opened"
  })
  const toggle = scopeCallback(() => view?.isOpen() ? hide() : show())
  controllers.set(slot, { show, hide, toggle })
}
