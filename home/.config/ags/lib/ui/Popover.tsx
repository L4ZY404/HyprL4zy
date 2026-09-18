import { attachPopoverPaper } from "./AttachedPopover"
import { Gtk } from "ags/gtk4"
import { bindHoverPopover } from "../gtk"

type PopoverLabels = {
  icon: string
  title: string
  value: string
  detail: string
  extra?: Gtk.Widget
  className?: string
}

export type PopoverRefs = {
  popover: Gtk.Popover
  iconLabel: Gtk.Label
  titleLabel: Gtk.Label
  valueLabel: Gtk.Label
  detailLabel: Gtk.Label
  card: Gtk.Box
}

export function createInfoPopover(parent: Gtk.Widget, labels: PopoverLabels): PopoverRefs {
  const iconLabel = new Gtk.Label({
    label: labels.icon,
    css_classes: ["dial-popover-icon"],
  })

  const titleLabel = new Gtk.Label({
    label: labels.title,
    css_classes: ["dial-popover-title"],
  })

  const valueLabel = new Gtk.Label({
    label: labels.value,
    css_classes: ["dial-popover-value"],
    halign: Gtk.Align.START,
  })

  const detailLabel = new Gtk.Label({
    label: labels.detail,
    css_classes: ["dial-popover-detail"],
    halign: Gtk.Align.START,
  })

  const header = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["dial-popover-header"],
    spacing: 8,
  })

  header.append(iconLabel)
  header.append(titleLabel)

  const extraClasses = labels.className?.split(" ").filter(Boolean) ?? []

  const card = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["dial-popover-card", ...extraClasses],
    spacing: 6,
  })

  card.append(header)
  card.append(valueLabel)
  card.append(detailLabel)

  if (labels.extra) {
    card.append(labels.extra)
  }

  const popover = new Gtk.Popover({
    has_arrow: false,
    autohide: false,
    position: Gtk.PositionType.RIGHT,
  })

  const { prepareOpen, cancelOpen } = attachPopoverPaper(popover, card)
  ;(popover as any).set_offset?.(0, 0)
  popover.set_parent(parent)
  bindHoverPopover(parent, popover, prepareOpen, cancelOpen)

  return {
    popover,
    iconLabel,
    titleLabel,
    valueLabel,
    detailLabel,
    card,
  }
}
