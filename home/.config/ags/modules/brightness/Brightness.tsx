import { timeout } from "../../lib/lifecycle"
import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

import { replaceCssClass } from "../../lib/gtk"
import { type UiScale, FALLBACK_UI } from "../../theme"
import Dial from "../../lib/ui/Dial"
import { createActionsSection } from "../../lib/ui/Actions"
import { actionButton, actionButtonRow, actionHint, actionSectionTitle, actionSlider, createActionMenu } from "../../lib/ui/ActionMenu"
import {
  changeBrightness,
  getBrightnessClass,
  getBrightnessDetail,
  getBrightnessIcon,
  readBrightness,
  refreshBrightness,
  setBrightness,
} from "../../services/brightness"
import { createInfoPopover } from "../../lib/ui/Popover"

const STATE_CLASSES = ["normal", "warning", "critical", "disabled"]

type BrightnessProps = {
  ui?: UiScale
}

function createInfoRow(label: string, value = "—") {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["brightness-popover-row", "popover-data-row"],
    spacing: 8,
  })

  const labelWidget = new Gtk.Label({
    label,
    css_classes: ["brightness-popover-row-label", "popover-data-label"],
    halign: Gtk.Align.START,
    xalign: 0,
    hexpand: true,
  })

  const valueWidget = new Gtk.Label({
    label: value,
    css_classes: ["brightness-popover-row-value", "popover-data-value"],
    halign: Gtk.Align.END,
    xalign: 1,
  })

  row.append(labelWidget)
  row.append(valueWidget)

  return { row, valueWidget }
}

export default function Brightness({ ui = FALLBACK_UI }: BrightnessProps) {
  let state = readBrightness()
  let refreshing = false

  const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["speed-item", "brightness-module", getBrightnessClass(state)],
  })

  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["speed-row", getBrightnessClass(state)],
  })

  let dial = Dial({
    icon: getBrightnessIcon(state),
    value: state.percent,
    active: state.available,
    warningAt: 90,
    criticalAt: 101,
    ui,
  })

  row.append(dial)
  wrapper.append(row)

  const popoverRows = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["brightness-popover-grid", "popover-data-grid"],
    spacing: 3,
  })

  const currentRow = createInfoRow("Current")
  const deviceRow = createInfoRow("Device")
  const kindRow = createInfoRow("Kind")
  const statusRow = createInfoRow("Status")

  for (const item of [currentRow, deviceRow, kindRow, statusRow]) {
    popoverRows.append(item.row)
  }

  popoverRows.append(
    createActionsSection([
      { label: "Left click", value: "Open actions" },
      { label: "Scroll", value: "Adjust brightness" },
      { label: "Middle click", value: "Refresh now" },
    ]),
  )

  const popover = createInfoPopover(wrapper, {
    icon: getBrightnessIcon(state),
    title: "Brightness",
    value: state.available ? `${state.percent}%` : "Unavailable",
    detail: getBrightnessDetail(state),
    extra: popoverRows,
    className: "brightness-popover-card",
  })

  const actionBody = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  actionBody.append(actionSectionTitle("Display brightness"))
  const brightnessSlider = actionSlider("Brightness", 1, 100, 1, state.percent, (value) => {
    setBrightness(value)
    delayedRefresh(90)
  })
  const actionStatus = actionHint(getBrightnessDetail(state))
  actionBody.append(brightnessSlider.box)
  actionBody.append(actionButtonRow([
    actionButton("50%", () => { setBrightness(50); delayedRefresh() }),
    actionButton("100%", () => { setBrightness(100); delayedRefresh() }),
    actionButton("Refresh", () => void refresh(true)),
  ]))
  actionBody.append(actionStatus)
  const actionMenu = createActionMenu(wrapper, {
    icon: "󰃠",
    title: "Brightness",
    subtitle: "Display backlight",
    content: actionBody,
    className: "brightness-action-menu",
    onOpen: () => void refresh(true),
  })

  function updateUi() {
    row.remove(dial)
    dial = Dial({
      icon: getBrightnessIcon(state),
      value: state.percent,
      active: state.available,
      warningAt: 90,
      criticalAt: 101,
      ui,
    })
    row.append(dial)

    popover.iconLabel.set_label(getBrightnessIcon(state))
    popover.valueLabel.set_label(state.available ? `${state.percent}%` : "Unavailable")
    popover.detailLabel.set_label(getBrightnessDetail(state))
    brightnessSlider.setValue(state.percent)
    actionStatus.set_label(getBrightnessDetail(state))
    actionMenu.subtitleLabel.set_label(state.available ? `${state.percent}% • ${state.device || state.kind}` : "Brightness unavailable")

    currentRow.valueWidget.set_label(state.available ? `${state.percent}%` : "—")
    deviceRow.valueWidget.set_label(state.device || "—")
    kindRow.valueWidget.set_label(state.kind || "—")
    statusRow.valueWidget.set_label(state.status === "error" ? state.error : state.status)

    replaceCssClass(wrapper, STATE_CLASSES, getBrightnessClass(state))
    replaceCssClass(row, STATE_CLASSES, getBrightnessClass(state))
    wrapper.set_visible(state.available)
  }

  async function refresh(force = false) {
    if (refreshing && !force) {
      return
    }

    refreshing = true

    try {
      state = await refreshBrightness(force)
      updateUi()
    } finally {
      refreshing = false
    }
  }

  function delayedRefresh(delay = 120) {
    timeout(GLib.PRIORITY_DEFAULT, delay, () => {
      void refresh(true)
      return GLib.SOURCE_REMOVE
    })
  }

  const click = new Gtk.GestureClick()
  click.set_button(0)
  click.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
  click.connect("pressed", (gesture) => {
    if (gesture.get_current_button() === 2) void refresh(true)
  })
  wrapper.add_controller(click)

  const scroll = new Gtk.EventControllerScroll({
    flags: Gtk.EventControllerScrollFlags.VERTICAL,
  })

  scroll.connect("scroll", (_controller, _dx, dy) => {
    if (dy < 0) {
      changeBrightness(5)
    } else if (dy > 0) {
      changeBrightness(-5)
    }

    delayedRefresh(80)
    return true
  })

  wrapper.add_controller(scroll)
  wrapper.set_visible(false)

  updateUi()

  timeout(GLib.PRIORITY_DEFAULT, 2400, () => {
    void refresh(true)
    return GLib.SOURCE_REMOVE
  })

  timeout(GLib.PRIORITY_DEFAULT, 15000, () => {
    void refresh()
    return GLib.SOURCE_CONTINUE
  })

  return wrapper
}
