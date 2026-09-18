import { timeout } from "../../lib/lifecycle"
import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

import { replaceCssClass } from "../../lib/gtk"
import { createActionsSection } from "../../lib/ui/Actions"
import { actionButton, actionButtonRow, actionHint, createActionMenu } from "../../lib/ui/ActionMenu"
import { createInfoPopover } from "../../lib/ui/Popover"
import {
  clearClipboardHistory,
  copyLastClipboardItem,
  EMPTY_CLIPBOARD,
  getClipboardClass,
  getClipboardDetail,
  getClipboardIcon,
  getClipboardPickerLabel,
  getClipboardValue,
  openClipboardPicker,
  readClipboard,
  refreshClipboard,
} from "../../services/clipboard"

const STATE_CLASSES = ["connection-online", "connection-warning", "connection-offline"]
const REFRESH_BURST_DELAYS = [350, 1100, 2400]

function createInfoRow(label: string, value = "—") {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["clipboard-popover-row", "popover-data-row"],
    spacing: 8,
  })

  const labelWidget = new Gtk.Label({
    label,
    css_classes: ["clipboard-popover-row-label", "popover-data-label"],
    halign: Gtk.Align.START,
    xalign: 0,
    hexpand: true,
  })

  const valueWidget = new Gtk.Label({
    label: value,
    css_classes: ["clipboard-popover-row-value", "popover-data-value"],
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

export default function Clipboard() {
  let state = EMPTY_CLIPBOARD
  let refreshing = false

  const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["connection-module", "clipboard-module", getClipboardClass(state)],
  })

  const button = new Gtk.Button({ css_classes: ["connection-button", "clipboard-button"] })

  const iconLabel = new Gtk.Label({
    label: getClipboardIcon(state),
    css_classes: ["connection-icon", "clipboard-icon"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
    yalign: 0.5,
  })

  button.set_child(iconLabel)
  wrapper.append(button)

  const rows = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["clipboard-popover-grid", "popover-data-grid"],
    spacing: 3,
  })

  const itemsRow = createInfoRow("Items")
  const pickerRow = createInfoRow("Picker")
  const cliphistRow = createInfoRow("cliphist")
  const wlCopyRow = createInfoRow("wl-copy")
  const checkedRow = createInfoRow("Last checked")

  for (const item of [itemsRow, pickerRow, cliphistRow, wlCopyRow, checkedRow]) {
    rows.append(item.row)
  }

  rows.append(
    createActionsSection([
      { label: "Left click", value: "Open actions" },
      { label: "Middle click", value: "Copy last item" },
      { label: "Right click", value: "Clear history" },
    ]),
  )

  const popover = createInfoPopover(wrapper, {
    icon: getClipboardIcon(state),
    title: "Clipboard",
    value: getClipboardValue(state),
    detail: getClipboardDetail(state),
    extra: rows,
    className: "clipboard-popover-card",
  })

  const actionBody = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  const actionStatus = actionHint(getClipboardDetail(state))
  actionBody.append(actionStatus)
  actionBody.append(actionButtonRow([
    actionButton("Open picker", () => { openClipboardPicker(state); scheduleRefreshBurst() }),
    actionButton("Copy last", () => { copyLastClipboardItem(state); scheduleRefreshBurst() }),
  ]))
  actionBody.append(actionButtonRow([
    actionButton("Clear history", () => { clearClipboardHistory(state); scheduleRefreshBurst() }, "danger"),
  ]))
  const actionMenu = createActionMenu(wrapper, {
    icon: getClipboardIcon(state),
    title: "Clipboard",
    subtitle: "History actions",
    content: actionBody,
    className: "clipboard-action-menu",
    onOpen: () => void refresh(true),
  })

  function updateUi() {
    iconLabel.set_label(getClipboardIcon(state))
    popover.iconLabel.set_label(getClipboardIcon(state))
    popover.valueLabel.set_label(getClipboardValue(state))
    popover.detailLabel.set_label(getClipboardDetail(state))
    actionStatus.set_label(getClipboardDetail(state))
    actionMenu.subtitleLabel.set_label(`${state.items} item${state.items === 1 ? "" : "s"} • ${getClipboardPickerLabel(state.picker)}`)

    itemsRow.valueWidget.set_label(`${state.items}`)
    pickerRow.valueWidget.set_label(getClipboardPickerLabel(state.picker))
    cliphistRow.valueWidget.set_label(yesNo(state.cliphist))
    wlCopyRow.valueWidget.set_label(yesNo(state.wlCopy))
    checkedRow.valueWidget.set_label(state.lastCheckedLabel)

    replaceCssClass(wrapper, STATE_CLASSES, getClipboardClass(state))
  }

  async function refresh(force = false) {
    if (refreshing && !force) {
      return
    }

    refreshing = true

    try {
      state = await refreshClipboard(force)
      updateUi()
    } finally {
      refreshing = false
    }
  }

  function scheduleRefreshBurst() {
    for (const delay of REFRESH_BURST_DELAYS) {
      timeout(GLib.PRIORITY_DEFAULT, delay, () => {
        void refresh(true)
        return GLib.SOURCE_REMOVE
      })
    }
  }

  const click = new Gtk.GestureClick()
  click.set_button(0)
  click.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
  click.connect("pressed", (gesture) => {
    const mouseButton = gesture.get_current_button()
    if (mouseButton === 2) {
      copyLastClipboardItem(state)
      scheduleRefreshBurst()
    }
    if (mouseButton === 3) {
      clearClipboardHistory(state)
      scheduleRefreshBurst()
    }
  })
  wrapper.add_controller(click)

  state = readClipboard()
  updateUi()

  timeout(GLib.PRIORITY_DEFAULT, 2100, () => {
    void refresh(true)
    return GLib.SOURCE_REMOVE
  })

  timeout(GLib.PRIORITY_DEFAULT, 30000, () => {
    void refresh()
    return GLib.SOURCE_CONTINUE
  })

  return wrapper
}
