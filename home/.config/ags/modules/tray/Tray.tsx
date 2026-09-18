import { onCleanup, ResourceScope, scopeCallback } from "../../lib/lifecycle"
import { idle } from "../../lib/lifecycle"
import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

const TRAY_STATE_CLASSES = ["tray-ready", "tray-loading", "tray-unavailable", "tray-empty"]

type TrayNamespace = {
  get_default?: () => any
  Tray?: {
    get_default?: () => any
  }
}

function clearBox(box: Gtk.Box) {
  let child = box.get_first_child()

  while (child) {
    const next = child.get_next_sibling()
    box.remove(child)
    child = next
  }
}

function replaceTrayClass(widget: Gtk.Widget, nextClass: string) {
  for (const cssClass of TRAY_STATE_CLASSES) {
    widget.remove_css_class(cssClass)
  }

  widget.add_css_class(nextClass)
}

function getTrayItems(tray: any) {
  try {
    return tray?.get_items?.() ?? tray?.items ?? []
  } catch {
    return []
  }
}

function getItemTitle(item: any) {
  return String(
    item?.title ??
      item?.get_title?.() ??
      item?.id ??
      item?.get_id?.() ??
      item?.itemId ??
      item?.get_item_id?.() ??
      "Tray item",
  )
}

function getItemTooltip(item: any) {
  return String(
    item?.tooltipMarkup ??
      item?.tooltip_markup ??
      item?.get_tooltip_markup?.() ??
      item?.tooltipText ??
      item?.tooltip_text ??
      item?.get_tooltip_text?.() ??
      getItemTitle(item),
  )
}

function getItemGicon(item: any) {
  try {
    return item?.gicon ?? item?.get_gicon?.() ?? null
  } catch {
    return null
  }
}

function getItemMenuModel(item: any) {
  try {
    return item?.menuModel ?? item?.menu_model ?? item?.get_menu_model?.() ?? null
  } catch {
    return null
  }
}

function getItemActionGroup(item: any) {
  try {
    return item?.actionGroup ?? item?.action_group ?? item?.get_action_group?.() ?? null
  } catch {
    return null
  }
}

function itemPrefersMenu(item: any) {
  try {
    return Boolean(item?.isMenu ?? item?.is_menu ?? item?.get_is_menu?.())
  } catch {
    return false
  }
}

function activateItem(item: any, x = 0, y = 0) {
  try {
    item?.activate?.(x, y)
  } catch {
    try {
      item?.activate?.()
    } catch {
      // Ignore tray activation failures.
    }
  }
}

function secondaryActivateItem(item: any, x = 0, y = 0) {
  try {
    item?.secondary_activate?.(x, y)
  } catch {
    try {
      item?.secondaryActivate?.(x, y)
    } catch {
      activateItem(item, x, y)
    }
  }
}

function showItemMenu(item: any, menu: Gtk.PopoverMenu | null) {
  if (!menu) {
    return false
  }

  try {
    item?.about_to_show?.()
  } catch {
    // Some tray items do not implement a menu update hook.
  }

  try {
    menu.popup()
    return true
  } catch {
    return false
  }
}

function createTrayButton(item: any) {
  const button = new Gtk.Button({
    css_classes: ["tray-button"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })
  button.set_focusable(false)

  const image = new Gtk.Image({
    css_classes: ["tray-icon"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })

  const fallback = new Gtk.Label({
    label: "•",
    css_classes: ["tray-fallback-icon"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
  })

  const stack = new Gtk.Stack({
    css_classes: ["tray-icon-stack"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })

  stack.add_named(image, "icon")
  stack.add_named(fallback, "fallback")
  button.set_child(stack)

  const menuModel = getItemMenuModel(item)
  const actionGroup = getItemActionGroup(item)
  const popoverMenu = menuModel
    ? new Gtk.PopoverMenu({ has_arrow: false })
    : null

  if (actionGroup) {
    try {
      button.insert_action_group("dbusmenu", actionGroup)
    } catch {
      // Ignore invalid action groups.
    }
  }

  if (popoverMenu) {
    try {
      popoverMenu.set_menu_model(menuModel)
      popoverMenu.set_parent(button)
    } catch {
      // Ignore menu setup failures.
    }
  }

  function update() {
    const title = getItemTitle(item)
    const tooltip = getItemTooltip(item)
    const gicon = getItemGicon(item)

    try {
      button.set_tooltip_markup(tooltip)
    } catch {
      button.set_tooltip_text(title)
    }

    if (gicon) {
      image.set_from_gicon(gicon)
      stack.set_visible_child_name("icon")
      return
    }

    stack.set_visible_child_name("fallback")
  }

  const changedId = item?.connect?.("changed", update) ?? 0
  const readyId = item?.connect?.("ready", update) ?? 0
  const notifyId = item?.connect?.("notify", update) ?? 0

  let cleaned = false
  const disconnectItem = () => {
    if (cleaned) return
    cleaned = true
    for (const id of [changedId, readyId, notifyId]) {
      try { if (id) item?.disconnect?.(id) } catch {}
    }
    popoverMenu?.unparent()
  }
  onCleanup(disconnectItem)
  try {
    button.connect("destroy", disconnectItem)
  } catch {}
  const click = new Gtk.GestureClick()
  click.set_button(0)
  click.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
  click.connect("pressed", (gesture, _nPress, x, y) => {
    const mouseButton = gesture.get_current_button()

    if (mouseButton === 1) {
      if (itemPrefersMenu(item) && showItemMenu(item, popoverMenu)) {
        return
      }

      activateItem(item, x, y)
      return
    }

    if (mouseButton === 3) {
      if (showItemMenu(item, popoverMenu)) {
        return
      }

      secondaryActivateItem(item, x, y)
    }
  })

  button.add_controller(click)
  update()

  return button
}

export default function SysTray() {
  let tray: any = null
  let trayLoaded = false
  let disposed = false
  let itemScope = new ResourceScope()
  const traySignals: number[] = []
  onCleanup(() => {
    disposed = true; itemScope.dispose()
    for (const id of traySignals) { try { tray?.disconnect?.(id) } catch {} }
  })

  const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["tray-module", "tray-loading"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })

  const itemsBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["tray-items"],
    spacing: 3,
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })

  wrapper.append(itemsBox)

  function refresh() {
    if (disposed) return
    itemScope.dispose(); itemScope = new ResourceScope()
    clearBox(itemsBox)

    if (!trayLoaded || !tray) {
      wrapper.set_visible(false)
      replaceTrayClass(wrapper, "tray-loading")
      return
    }

    const items = getTrayItems(tray)

    if (items.length === 0) {
      wrapper.set_visible(false)
      replaceTrayClass(wrapper, "tray-empty")
      return
    }

    for (const item of items) {
      itemsBox.append(itemScope.run(() => createTrayButton(item)))
    }

    wrapper.set_visible(true)
    replaceTrayClass(wrapper, "tray-ready")
  }

  async function loadTray() {
    try {
      const module = (await import("gi://AstalTray?version=0.1")) as unknown as {
        default?: TrayNamespace
      } & TrayNamespace
      if (disposed) return
      const namespace = (module.default ?? module) as TrayNamespace
      tray = namespace.get_default?.() ?? namespace.Tray?.get_default?.() ?? null
      trayLoaded = Boolean(tray)

      if (tray) {
        for (const signal of ["item-added", "item-removed", "notify::items"]) {
          const id = tray.connect?.(signal, refresh)
          if (id) traySignals.push(id)
        }
      }
    } catch (error) {
      tray = null
      trayLoaded = false
      // AstalTray is optional. Keep the tray hidden when the typelib is unavailable.
    }

    refresh()
  }

  idle(GLib.PRIORITY_DEFAULT_IDLE, () => {
    loadTray()
    return GLib.SOURCE_REMOVE
  })

  refresh()

  return wrapper
}
