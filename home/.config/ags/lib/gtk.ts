import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

export function setStateClass(
  widget: Gtk.Widget,
  baseClasses: string[],
  stateClass: string,
  knownStates: string[],
) {
  widget.set_css_classes([
    ...baseClasses,
    stateClass,
    ...widget.get_css_classes().filter((name) => !knownStates.includes(name)),
  ])
}

export function replaceCssClass(
  widget: Gtk.Widget,
  knownClasses: string[],
  nextClass: string,
) {
  for (const name of knownClasses) {
    widget.remove_css_class(name)
  }

  widget.add_css_class(nextClass)
}

type HoverPopoverSession = {
  parent: Gtk.Widget
  popover: Gtk.Popover
  forceClose: () => void
}

// Informational popovers keep the original hover behavior: one active surface,
// a short pointer bridge, and no geometry changes on the bar island itself.
let activeHoverPopover: HoverPopoverSession | null = null
const suppressedHoverParents = new Set<Gtk.Widget>()

export function dismissHoverPopover(parent?: Gtk.Widget) {
  if (!activeHoverPopover) return
  if (parent && activeHoverPopover.parent !== parent) return
  activeHoverPopover.forceClose()
}

export function setHoverPopoverSuppressed(parent: Gtk.Widget, suppressed: boolean) {
  if (suppressed) {
    suppressedHoverParents.add(parent)
    dismissHoverPopover(parent)
    return
  }

  suppressedHoverParents.delete(parent)
}

export function bindHoverPopover(
  parent: Gtk.Widget,
  popover: Gtk.Popover,
  prepareOpen?: () => void,
  cancelOpen?: () => void,
) {
  const parentMotion = new Gtk.EventControllerMotion()
  const popoverMotion = new Gtk.EventControllerMotion()
  let parentInside = false
  let popoverInside = false
  let closeSource = 0
  let generation = 0

  const cancelClose = () => {
    generation++
    if (!closeSource) return
    GLib.source_remove(closeSource)
    closeSource = 0
  }

  let session: HoverPopoverSession

  const forceClose = () => {
    cancelClose()
    parentInside = false
    popoverInside = false
    cancelOpen?.()
    popover.popdown()
    if (activeHoverPopover === session) activeHoverPopover = null
  }

  session = { parent, popover, forceClose }

  const open = () => {
    cancelClose()
    if (suppressedHoverParents.has(parent)) return

    if (activeHoverPopover && activeHoverPopover !== session) {
      activeHoverPopover.forceClose()
    }

    activeHoverPopover = session
    prepareOpen?.()
    popover.popup()
  }

  const scheduleClose = () => {
    cancelClose()
    const token = generation
    closeSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 170, () => {
      closeSource = 0
      if (token !== generation) return GLib.SOURCE_REMOVE
      if (!parentInside && !popoverInside) forceClose()
      return GLib.SOURCE_REMOVE
    })
  }

  parentMotion.connect("enter", () => {
    parentInside = true
    open()
  })
  parentMotion.connect("leave", () => {
    parentInside = false
    scheduleClose()
  })

  popoverMotion.connect("enter", () => {
    if (activeHoverPopover !== session) return
    popoverInside = true
    cancelClose()
  })
  popoverMotion.connect("leave", () => {
    if (activeHoverPopover !== session) return
    popoverInside = false
    scheduleClose()
  })

  popover.connect("unmap", () => {
    cancelClose()
    if (activeHoverPopover === session) activeHoverPopover = null
  })

  parent.add_controller(parentMotion)
  popover.add_controller(popoverMotion)
}
