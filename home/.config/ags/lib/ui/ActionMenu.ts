import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

import { onCleanup } from "../lifecycle"
import { dismissHoverPopover, setHoverPopoverSuppressed } from "../gtk"

export type ActionMenuOptions = {
  icon: string
  title: string
  subtitle?: string
  content: Gtk.Widget
  className?: string
  iconXalign?: number
  onOpen?: () => void
}

export type ActionMenuRefs = {
  popover: Gtk.Popover
  card: Gtk.Box
  titleLabel: Gtk.Label
  subtitleLabel: Gtk.Label
  open: () => void
  close: () => void
  toggle: () => void
}

type ActiveActionMenu = {
  popover: Gtk.Popover
  close: () => void
}

let activeActionMenu: ActiveActionMenu | null = null
const MOTION_ARM_DELAY_MS = 28

function splitClasses(value = "") {
  return value.split(" ").map((item) => item.trim()).filter(Boolean)
}

export function createActionMenu(parent: Gtk.Widget, options: ActionMenuOptions): ActionMenuRefs {
  const icon = new Gtk.Label({
    label: options.icon,
    css_classes: ["module-action-icon"],
    valign: Gtk.Align.CENTER,
    xalign: options.iconXalign ?? 0.5,
    yalign: 0.5,
  })

  const kicker = new Gtk.Label({
    label: "ACTIONS",
    css_classes: ["module-action-kicker"],
    halign: Gtk.Align.START,
    xalign: 0,
  })

  const titleLabel = new Gtk.Label({
    label: options.title,
    css_classes: ["module-action-title"],
    halign: Gtk.Align.START,
    xalign: 0,
  })

  const subtitleLabel = new Gtk.Label({
    label: options.subtitle ?? "",
    css_classes: ["module-action-subtitle"],
    halign: Gtk.Align.START,
    xalign: 0,
    wrap: true,
  })
  subtitleLabel.set_visible(Boolean(options.subtitle))
  subtitleLabel.set_max_width_chars(34)

  const titleBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["module-action-heading"],
    spacing: 0,
    hexpand: true,
  })
  titleBox.append(kicker)
  titleBox.append(titleLabel)
  titleBox.append(subtitleLabel)

  const header = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["module-action-header"],
    spacing: 9,
  })
  header.append(icon)
  header.append(titleBox)

  const card = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["module-action-card", ...splitClasses(options.className)],
    spacing: 7,
  })
  card.append(header)
  card.append(options.content)

  const popover = new Gtk.Popover({
    has_arrow: false,
    autohide: true,
    position: Gtk.PositionType.RIGHT,
  })
  popover.add_css_class("module-action-popover")
  ;(popover as any).set_offset?.(0, 0)
  popover.set_child(card)
  popover.set_parent(parent)

  let pointerInside = false
  let motionSource = 0

  const clearMotionSource = () => {
    if (!motionSource) return
    GLib.source_remove(motionSource)
    motionSource = 0
  }

  const resetMotion = () => {
    clearMotionSource()
    card.remove_css_class("module-action-visible")
    card.add_css_class("module-action-entering")
  }

  const finalizeClosed = () => {
    clearMotionSource()
    pointerInside = false
    card.remove_css_class("module-action-entering")
    card.remove_css_class("module-action-visible")
    parent.remove_css_class("module-action-open")
    setHoverPopoverSuppressed(parent, false)
    if (activeActionMenu?.popover === popover) activeActionMenu = null
  }

  const close = () => {
    if (popover.get_mapped()) popover.popdown()
    else finalizeClosed()
  }

  const open = () => {
    if (activeActionMenu && activeActionMenu.popover !== popover) {
      activeActionMenu.close()
    }

    dismissHoverPopover(parent)
    setHoverPopoverSuppressed(parent, true)
    parent.add_css_class("module-action-open")
    activeActionMenu = { popover, close }
    options.onOpen?.()
    resetMotion()
    if (!popover.get_mapped()) popover.popup()
  }

  const toggle = () => {
    if (popover.get_mapped()) close()
    else open()
  }

  const popoverMotion = new Gtk.EventControllerMotion()
  popoverMotion.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
  popoverMotion.connect("enter", () => { pointerInside = true })
  popoverMotion.connect("leave", () => { pointerInside = false })
  popover.add_controller(popoverMotion)

  const click = new Gtk.GestureClick()
  click.set_button(1)
  click.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
  click.connect("released", () => {
    // Popovers are parented to their anchor for positioning. Ignore bubbled
    // clicks coming from controls inside the action surface.
    if (pointerInside) return
    toggle()
  })
  parent.add_controller(click)

  popover.connect("map", () => {
    resetMotion()
    motionSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MOTION_ARM_DELAY_MS, () => {
      motionSource = 0
      if (!popover.get_mapped()) return GLib.SOURCE_REMOVE
      card.remove_css_class("module-action-entering")
      card.add_css_class("module-action-visible")
      return GLib.SOURCE_REMOVE
    })
  })

  popover.connect("closed", finalizeClosed)
  popover.connect("unmap", finalizeClosed)

  const key = new Gtk.EventControllerKey()
  key.connect("key-pressed", (_controller, keyval) => {
    if (keyval !== 0xff1b) return false
    close()
    return true
  })
  popover.add_controller(key)

  onCleanup(() => {
    close()
    clearMotionSource()
    popover.unparent()
  })

  return { popover, card, titleLabel, subtitleLabel, open, close, toggle }
}

export function actionSectionTitle(text: string) {
  return new Gtk.Label({
    label: text,
    css_classes: ["module-action-section-title"],
    halign: Gtk.Align.START,
    xalign: 0,
  })
}

export function actionHint(text: string) {
  const label = new Gtk.Label({
    label: text,
    css_classes: ["module-action-hint"],
    halign: Gtk.Align.START,
    xalign: 0,
    wrap: true,
  })
  label.set_max_width_chars(36)
  return label
}

export function actionButton(label: string, onClick: () => void, cssClass = "") {
  const button = new Gtk.Button({
    label,
    css_classes: ["module-action-button", ...splitClasses(cssClass)],
    hexpand: true,
  })
  button.connect("clicked", onClick)
  return button
}

export function actionButtonRow(buttons: Gtk.Widget[]) {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["module-action-button-row"],
    spacing: 6,
    hexpand: true,
  })
  for (const button of buttons) row.append(button)
  return row
}

export type ActionToggleRefs = {
  row: Gtk.Box
  switchWidget: Gtk.Switch
  detailLabel: Gtk.Label
  setActive: (active: boolean) => void
  setDetail: (detail: string) => void
}

export function actionToggle(
  label: string,
  detail: string,
  active: boolean,
  onToggle: (active: boolean) => void,
): ActionToggleRefs {
  let syncing = false
  const name = new Gtk.Label({
    label,
    css_classes: ["module-action-toggle-label"],
    halign: Gtk.Align.START,
    xalign: 0,
  })
  const detailLabel = new Gtk.Label({
    label: detail,
    css_classes: ["module-action-toggle-detail"],
    halign: Gtk.Align.START,
    xalign: 0,
    wrap: true,
  })
  detailLabel.set_max_width_chars(27)

  const text = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 1,
    hexpand: true,
  })
  text.append(name)
  text.append(detailLabel)

  const switchWidget = new Gtk.Switch({
    active,
    css_classes: ["module-action-switch"],
    valign: Gtk.Align.CENTER,
  })
  switchWidget.connect("state-set", (_widget, nextState) => {
    if (syncing) return false
    onToggle(nextState)
    return false
  })

  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["module-action-toggle-row"],
    spacing: 10,
  })
  row.append(text)
  row.append(switchWidget)

  return {
    row,
    switchWidget,
    detailLabel,
    setActive: (next) => {
      if (switchWidget.get_active() === next) return
      syncing = true
      switchWidget.set_active(next)
      syncing = false
    },
    setDetail: (next) => detailLabel.set_label(next),
  }
}

export type ActionSliderRefs = {
  box: Gtk.Box
  scale: Gtk.Scale
  valueLabel: Gtk.Label
  setValue: (value: number) => void
}

export function actionSlider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  onChange: (value: number) => void,
): ActionSliderRefs {
  let syncing = false
  const name = new Gtk.Label({
    label,
    css_classes: ["module-action-slider-label"],
    halign: Gtk.Align.START,
    xalign: 0,
    hexpand: true,
  })
  const valueLabel = new Gtk.Label({
    label: `${Math.round(value)}%`,
    css_classes: ["module-action-slider-value"],
    halign: Gtk.Align.END,
    xalign: 1,
  })
  const heading = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
  heading.append(name)
  heading.append(valueLabel)

  const scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, min, max, step)
  scale.set_draw_value(false)
  scale.set_hexpand(true)
  scale.add_css_class("module-action-slider")
  scale.set_value(value)
  scale.connect("value-changed", () => {
    if (syncing) return
    const next = scale.get_value()
    valueLabel.set_label(`${Math.round(next)}%`)
    onChange(next)
  })

  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["module-action-slider-box"],
    spacing: 3,
  })
  box.append(heading)
  box.append(scale)

  return {
    box,
    scale,
    valueLabel,
    setValue: (next) => {
      syncing = true
      scale.set_value(next)
      valueLabel.set_label(`${Math.round(next)}%`)
      syncing = false
    },
  }
}
