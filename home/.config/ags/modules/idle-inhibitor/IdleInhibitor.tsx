import { timeout } from "../../lib/lifecycle"
import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

import { replaceCssClass } from "../../lib/gtk"
import { createActionsSection } from "../../lib/ui/Actions"
import { actionButton, actionButtonRow, actionHint, actionToggle, createActionMenu } from "../../lib/ui/ActionMenu"
import { createInfoPopover } from "../../lib/ui/Popover"
import {
  disableIdleInhibitor,
  EMPTY_IDLE_INHIBITOR,
  enableIdleInhibitor,
  getIdleInhibitorClass,
  getIdleInhibitorDetail,
  getIdleInhibitorIcon,
  getIdleInhibitorValue,
  openPowerSettings,
  readIdleInhibitor,
  refreshIdleInhibitor,
} from "../../services/idleInhibitor"

const STATE_CLASSES = ["connection-online", "connection-warning", "connection-offline"]
const REFRESH_BURST_DELAYS = [350, 1200, 2600]

function createInfoRow(label: string, value = "—") {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["idle-popover-row", "popover-data-row"],
    spacing: 8,
  })

  const labelWidget = new Gtk.Label({
    label,
    css_classes: ["idle-popover-row-label", "popover-data-label"],
    halign: Gtk.Align.START,
    xalign: 0,
    hexpand: true,
  })

  const valueWidget = new Gtk.Label({
    label: value,
    css_classes: ["idle-popover-row-value", "popover-data-value"],
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

function basename(path: string) {
  const parts = path.split("/").filter(Boolean)

  return parts.length > 0 ? parts[parts.length - 1] : path
}

export default function IdleInhibitor() {
  let state = EMPTY_IDLE_INHIBITOR
  let refreshing = false

  const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["connection-module", "idle-module", getIdleInhibitorClass(state)],
  })

  const button = new Gtk.Button({ css_classes: ["connection-button", "idle-button"] })

  const iconLabel = new Gtk.Label({
    label: getIdleInhibitorIcon(state),
    css_classes: ["connection-icon", "idle-icon"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
    yalign: 0.5,
  })

  button.set_child(iconLabel)
  wrapper.append(button)

  const rows = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["idle-popover-grid", "popover-data-grid"],
    spacing: 3,
  })

  const statusRow = createInfoRow("Status")
  const swayidleRow = createInfoRow("swayidle")
  const lockRow = createInfoRow("Lock")
  const screenOffRow = createInfoRow("Screen off")
  const scriptRow = createInfoRow("Script")
  const checkedRow = createInfoRow("Last checked")

  for (const item of [statusRow, swayidleRow, lockRow, screenOffRow, scriptRow, checkedRow]) {
    rows.append(item.row)
  }

  rows.append(
    createActionsSection([
      { label: "Left click", value: "Open actions" },
      { label: "Middle click", value: "Refresh" },
    ]),
  )

  const popover = createInfoPopover(wrapper, {
    icon: getIdleInhibitorIcon(state),
    title: "Idle Inhibitor",
    value: getIdleInhibitorValue(state),
    detail: getIdleInhibitorDetail(state),
    extra: rows,
    className: "idle-popover-card",
  })

  const actionBody = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  const inhibitorToggle = actionToggle(
    "Keep system awake",
    getIdleInhibitorDetail(state),
    state.inhibited,
    (active) => {
      if (active === state.inhibited) return
      if (active) enableIdleInhibitor()
      else disableIdleInhibitor(state)
      state = { ...state, inhibited: active, swayidleRunning: !active }
      updateUi()
      scheduleRefreshBurst()
    },
  )
  const actionStatus = actionHint(getIdleInhibitorDetail(state))
  actionBody.append(inhibitorToggle.row)
  actionBody.append(actionStatus)
  actionBody.append(actionButtonRow([
    actionButton("Refresh", () => void refresh(true)),
    actionButton("Power settings", openPowerSettings),
  ]))
  const actionMenu = createActionMenu(wrapper, {
    icon: getIdleInhibitorIcon(state),
    title: "Idle inhibitor",
    subtitle: "Session power behavior",
    content: actionBody,
    className: "idle-action-menu",
    onOpen: () => void refresh(true),
  })

  function updateUi() {
    iconLabel.set_label(getIdleInhibitorIcon(state))
    popover.iconLabel.set_label(getIdleInhibitorIcon(state))
    popover.valueLabel.set_label(getIdleInhibitorValue(state))
    popover.detailLabel.set_label(getIdleInhibitorDetail(state))
    inhibitorToggle.setActive(state.inhibited)
    inhibitorToggle.setDetail(state.inhibited ? "Automatic idle actions are paused" : "Automatic idle actions are enabled")
    actionStatus.set_label(getIdleInhibitorDetail(state))
    actionMenu.subtitleLabel.set_label(state.inhibited ? "Inhibited • system kept awake" : "Normal idle behavior")

    statusRow.valueWidget.set_label(getIdleInhibitorValue(state))
    swayidleRow.valueWidget.set_label(yesNo(state.swayidleRunning))
    lockRow.valueWidget.set_label(state.lockTimeLabel)
    screenOffRow.valueWidget.set_label(state.screenOffTimeLabel)
    scriptRow.valueWidget.set_label(basename(state.scriptPath))
    checkedRow.valueWidget.set_label(state.lastCheckedLabel)

    replaceCssClass(wrapper, STATE_CLASSES, getIdleInhibitorClass(state))
  }

  async function refresh(force = false) {
    if (refreshing && !force) {
      return
    }

    refreshing = true

    try {
      state = await refreshIdleInhibitor(force)
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
    if (gesture.get_current_button() === 2) void refresh(true)
  })
  wrapper.add_controller(click)

  state = readIdleInhibitor()
  updateUi()

  timeout(GLib.PRIORITY_DEFAULT, 2400, () => {
    void refresh(true)
    return GLib.SOURCE_REMOVE
  })

  timeout(GLib.PRIORITY_DEFAULT, 30000, () => {
    void refresh()
    return GLib.SOURCE_CONTINUE
  })

  return wrapper
}
