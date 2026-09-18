import { timeout } from "../../lib/lifecycle"
import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

import { replaceCssClass } from "../../lib/gtk"
import { createActionsSection } from "../../lib/ui/Actions"
import { actionButton, actionButtonRow, actionHint, actionSectionTitle, createActionMenu } from "../../lib/ui/ActionMenu"
import { createInfoPopover } from "../../lib/ui/Popover"
import {
  captureArea,
  captureDelayed,
  captureScreen,
  getCaptureClass,
  getCaptureIcon,
  openCapturesFolder,
  readCaptureState,
  type CaptureState,
} from "../../services/capture"

const STATE_CLASSES = ["connection-online", "connection-offline"]

function createInfoRow(label: string, value = "—") {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["capture-popover-row", "popover-data-row"],
    spacing: 8,
  })

  const labelWidget = new Gtk.Label({
    label,
    css_classes: ["capture-popover-row-label", "popover-data-label"],
    halign: Gtk.Align.START,
    xalign: 0,
    hexpand: true,
  })

  const valueWidget = new Gtk.Label({
    label: value,
    css_classes: ["capture-popover-row-value", "popover-data-value"],
    halign: Gtk.Align.END,
    xalign: 1,
  })

  row.append(labelWidget)
  row.append(valueWidget)

  return { row, valueWidget }
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No"
}

export default function Capture() {
  let state: CaptureState = readCaptureState(true)

  const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["connection-module", "capture-module", getCaptureClass(state)],
  })

  const button = new Gtk.Button({ css_classes: ["connection-button", "capture-button"] })

  const iconLabel = new Gtk.Label({
    label: getCaptureIcon(state),
    css_classes: ["connection-icon", "capture-icon"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
    yalign: 0.5,
  })

  button.set_child(iconLabel)
  wrapper.append(button)

  const rows = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["capture-popover-grid", "popover-data-grid"],
    spacing: 3,
  })

  const directoryRow = createInfoRow("Directory")
  const grimRow = createInfoRow("grim")
  const slurpRow = createInfoRow("slurp")
  const clipboardRow = createInfoRow("Clipboard")
  const notifyRow = createInfoRow("Notifications")

  for (const item of [directoryRow, grimRow, slurpRow, clipboardRow, notifyRow]) {
    rows.append(item.row)
  }

  rows.append(
    createActionsSection([
      { label: "Left click", value: "Open actions" },
      { label: "Scroll", value: "Delayed screenshot" },
    ]),
  )

  const popover = createInfoPopover(wrapper, {
    icon: getCaptureIcon(state),
    title: "Capture",
    value: state.status === "ready" ? "Screenshot tools ready" : "Setup incomplete",
    detail: state.detail,
    extra: rows,
    className: "capture-popover-card",
  })

  const actionBody = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  actionBody.append(actionSectionTitle("Screenshot"))
  actionBody.append(actionButtonRow([
    actionButton("Region", captureArea),
    actionButton("Screen", captureScreen),
  ]))
  actionBody.append(actionSectionTitle("Delay"))
  actionBody.append(actionButtonRow([
    actionButton("5 seconds", () => captureDelayed(5)),
    actionButton("10 seconds", () => captureDelayed(10)),
  ]))
  const captureStatus = actionHint(state.detail)
  actionBody.append(captureStatus)
  actionBody.append(actionButtonRow([actionButton("Open folder", openCapturesFolder)]))
  const actionMenu = createActionMenu(wrapper, {
    icon: "󰄄",
    title: "Capture",
    subtitle: "Screenshot actions",
    content: actionBody,
    className: "capture-action-menu",
    onOpen: refresh,
  })

  function updateUi() {
    iconLabel.set_label(getCaptureIcon(state))
    popover.iconLabel.set_label(getCaptureIcon(state))
    popover.valueLabel.set_label(
      state.status === "ready" ? "Screenshot tools ready" : "Setup incomplete",
    )
    popover.detailLabel.set_label(state.detail)
    captureStatus.set_label(state.detail)
    actionMenu.subtitleLabel.set_label(state.status === "ready" ? "Screenshot tools ready" : "Setup incomplete")

    directoryRow.valueWidget.set_label(state.directory)
    grimRow.valueWidget.set_label(yesNo(state.grim))
    slurpRow.valueWidget.set_label(yesNo(state.slurp))
    clipboardRow.valueWidget.set_label(yesNo(state.wlCopy))
    notifyRow.valueWidget.set_label(
      state.dunstify ? "dunstify" : state.notifySend ? "notify-send" : "No",
    )

    replaceCssClass(wrapper, STATE_CLASSES, getCaptureClass(state))
  }

  function refresh() {
    state = readCaptureState(true)
    updateUi()
  }


  const scroll = new Gtk.EventControllerScroll({
    flags: Gtk.EventControllerScrollFlags.VERTICAL,
  })

  scroll.connect("scroll", (_controller, _dx, dy) => {
    captureDelayed(dy < 0 ? 5 : 10)
    return true
  })

  wrapper.add_controller(scroll)

  updateUi()

  timeout(GLib.PRIORITY_DEFAULT, 15000, () => {
    refresh()
    return GLib.SOURCE_CONTINUE
  })

  return wrapper
}
