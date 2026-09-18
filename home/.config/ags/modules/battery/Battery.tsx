import { timeout } from "../../lib/lifecycle"
import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

import { replaceCssClass } from "../../lib/gtk"
import { type UiScale, FALLBACK_UI } from "../../theme"
import Dial from "../../lib/ui/Dial"
import { createActionsSection } from "../../lib/ui/Actions"
import { actionButton, actionButtonRow, actionHint, createActionMenu } from "../../lib/ui/ActionMenu"
import {
  getBatteryCycleLabel,
  getBatteryDetail,
  getBatteryHealthLabel,
  getBatteryIcon,
  getBatteryPowerLabel,
  getBatteryStateClass,
  getBatteryTimeLabel,
  getBatteryTitle,
  hasBattery,
  openPowerSettings,
  readBattery,
  refreshBattery,
} from "../../services/battery"
import { createInfoPopover } from "../../lib/ui/Popover"

const STATE_CLASSES = ["normal", "warning", "critical", "disabled"]

type BatteryProps = {
  ui?: UiScale
}

export { hasBattery }

function createInfoRow(label: string, value = "—") {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["battery-popover-row", "popover-data-row"],
    spacing: 8,
  })

  const labelWidget = new Gtk.Label({
    label,
    css_classes: ["battery-popover-row-label", "popover-data-label"],
    halign: Gtk.Align.START,
    xalign: 0,
    hexpand: true,
  })

  const valueWidget = new Gtk.Label({
    label: value,
    css_classes: ["battery-popover-row-value", "popover-data-value"],
    halign: Gtk.Align.END,
    xalign: 1,
  })

  row.append(labelWidget)
  row.append(valueWidget)

  return { row, valueWidget }
}

export default function Battery({ ui = FALLBACK_UI }: BatteryProps) {
  let state = readBattery()
  let refreshing = false

  const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["speed-item", "battery-module", getBatteryStateClass(state)],
  })

  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["speed-row", getBatteryStateClass(state)],
  })

  let dial = Dial({
    icon: getBatteryIcon(state),
    value: state.percent,
    active: state.available,
    warningAt: 30,
    criticalAt: 15,
    lowIsBad: true,
    ui,
  })

  row.append(dial)
  wrapper.append(row)

  const popoverRows = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["battery-popover-grid", "popover-data-grid"],
    spacing: 3,
  })

  const statusRow = createInfoRow("Status")
  const timeRow = createInfoRow("Time")
  const drawRow = createInfoRow("Power draw")
  const healthRow = createInfoRow("Health")
  const cycleRow = createInfoRow("Cycles")
  const deviceRow = createInfoRow("Device")

  for (const item of [statusRow, timeRow, drawRow, healthRow, cycleRow, deviceRow]) {
    popoverRows.append(item.row)
  }

  popoverRows.append(
    createActionsSection([
      { label: "Left click", value: "Open actions" },
      { label: "Right click", value: "Refresh now" },
    ]),
  )

  const popover = createInfoPopover(wrapper, {
    icon: getBatteryIcon(state),
    title: getBatteryTitle(state),
    value: state.available ? `${state.percent}%` : "Unavailable",
    detail: getBatteryDetail(state),
    extra: popoverRows,
    className: "battery-popover-card",
  })

  const actionBody = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  const actionStatus = actionHint(getBatteryDetail(state))
  actionBody.append(actionStatus)
  actionBody.append(actionButtonRow([
    actionButton("Refresh", () => void refresh(true)),
    actionButton("Power settings", openPowerSettings),
  ]))
  const actionMenu = createActionMenu(wrapper, {
    icon: getBatteryIcon(state),
    title: "Battery",
    subtitle: "Power and battery actions",
    content: actionBody,
    className: "battery-action-menu",
    onOpen: () => void refresh(true),
  })

  function updateUi() {
    row.remove(dial)
    dial = Dial({
      icon: getBatteryIcon(state),
      value: state.percent,
      active: state.available,
      warningAt: 30,
      criticalAt: 15,
      lowIsBad: true,
      ui,
    })
    row.append(dial)

    popover.iconLabel.set_label(getBatteryIcon(state))
    popover.titleLabel.set_label(getBatteryTitle(state))
    popover.valueLabel.set_label(state.available ? `${state.percent}%` : "Unavailable")
    popover.detailLabel.set_label(getBatteryDetail(state))
    actionStatus.set_label(getBatteryDetail(state))
    actionMenu.subtitleLabel.set_label(state.available ? `${state.percent}% • ${state.status}` : "Battery unavailable")

    statusRow.valueWidget.set_label(state.status)
    timeRow.valueWidget.set_label(getBatteryTimeLabel(state))
    drawRow.valueWidget.set_label(getBatteryPowerLabel(state))
    healthRow.valueWidget.set_label(getBatteryHealthLabel(state))
    cycleRow.valueWidget.set_label(getBatteryCycleLabel(state))
    deviceRow.valueWidget.set_label(state.name || "—")

    replaceCssClass(wrapper, STATE_CLASSES, getBatteryStateClass(state))
    replaceCssClass(row, STATE_CLASSES, getBatteryStateClass(state))
    wrapper.set_visible(state.available)
  }

  async function refresh(force = false) {
    if (refreshing && !force) {
      return
    }

    refreshing = true

    try {
      state = await refreshBattery(force)
      updateUi()
    } finally {
      refreshing = false
    }
  }

  const click = new Gtk.GestureClick()
  click.set_button(0)
  click.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
  click.connect("pressed", (gesture) => {
    if (gesture.get_current_button() === 3) void refresh(true)
  })
  wrapper.add_controller(click)

  updateUi()
  void refresh(true)

  timeout(GLib.PRIORITY_DEFAULT, 30000, () => {
    void refresh()
    return GLib.SOURCE_CONTINUE
  })

  return wrapper
}
