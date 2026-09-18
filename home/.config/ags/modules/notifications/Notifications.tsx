import { timeout } from "../../lib/lifecycle"
import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

import { replaceCssClass } from "../../lib/gtk"
import { createActionsSection } from "../../lib/ui/Actions"
import { actionButton, actionButtonRow, actionHint, actionToggle, createActionMenu } from "../../lib/ui/ActionMenu"
import {
  clearNotifications,
  EMPTY_NOTIFICATIONS,
  getDndLabel,
  getNotificationDaemonLabel,
  getNotificationsClass,
  getNotificationsDetail,
  getNotificationsIcon,
  getNotificationsValue,
  openNotificationCenter,
  readNotifications,
  refreshNotifications,
  toggleDnd,
} from "../../services/notifications"
import { createInfoPopover } from "../../lib/ui/Popover"

const STATE_CLASSES = ["connection-online", "connection-warning", "connection-offline"]

const REFRESH_BURST_DELAYS = [
  450,
  1300,
  2800,
]

function createInfoRow(label: string, value = "—") {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["notifications-popover-row", "popover-data-row"],
    spacing: 8,
  })

  const labelWidget = new Gtk.Label({
    label,
    css_classes: ["notifications-popover-row-label", "popover-data-label"],
    halign: Gtk.Align.START,
    xalign: 0,
    hexpand: true,
  })

  const valueWidget = new Gtk.Label({
    label: value,
    css_classes: ["notifications-popover-row-value", "popover-data-value"],
    halign: Gtk.Align.END,
    xalign: 1,
  })

  row.append(labelWidget)
  row.append(valueWidget)

  return { row, valueWidget }
}

export default function Notifications() {
  let state = EMPTY_NOTIFICATIONS
  let refreshing = false

  const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: [
      "connection-module",
      "notifications-module",
      getNotificationsClass(state),
    ],
  })

  const buttonBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["connection-button"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })

  const iconLabel = new Gtk.Label({
    label: getNotificationsIcon(state),
    css_classes: ["connection-icon", "notifications-icon"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
    yalign: 0.5,
  })

  buttonBox.append(iconLabel)
  wrapper.append(buttonBox)

  const popoverRows = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["notifications-popover-grid", "popover-data-grid"],
    spacing: 3,
  })

  const daemonRow = createInfoRow("Daemon")
  const dndRow = createInfoRow("DND")
  const countRow = createInfoRow("Waiting")
  const checkedRow = createInfoRow("Last checked")

  for (const item of [daemonRow, dndRow, countRow, checkedRow]) {
    popoverRows.append(item.row)
  }

  popoverRows.append(
    createActionsSection([
      { label: "Left click", value: "Open actions" },
      { label: "Middle click", value: "Clear notifications" },
      { label: "Right click", value: "Toggle DND" },
    ]),
  )

  const popover = createInfoPopover(wrapper, {
    icon: getNotificationsIcon(state),
    title: "Notifications",
    value: getNotificationsValue(state),
    detail: getNotificationsDetail(state),
    extra: popoverRows,
    className: "notifications-popover-card",
  })

  const actionBody = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  const dndToggle = actionToggle(
    "Do not disturb",
    "Pause notification popups when supported by the active daemon",
    state.dnd === true,
    (active) => {
      if (state.dnd === null || active !== state.dnd) {
        toggleDnd(state)
        scheduleRefreshBurst()
      }
    },
  )
  const actionStatus = actionHint(getNotificationsDetail(state))
  actionBody.append(dndToggle.row)
  actionBody.append(actionStatus)
  actionBody.append(actionButtonRow([
    actionButton("Open center", () => { openNotificationCenter(state); scheduleRefreshBurst() }),
    actionButton("Clear", () => { clearNotifications(state); scheduleRefreshBurst() }, "danger"),
    actionButton("Refresh", () => void refresh(true)),
  ]))
  const actionMenu = createActionMenu(wrapper, {
    icon: getNotificationsIcon(state),
    title: "Notifications",
    subtitle: "Center and DND controls",
    content: actionBody,
    className: "notifications-action-menu",
    onOpen: () => void refresh(true),
  })

  function updateUi() {
    iconLabel.set_label(getNotificationsIcon(state))
    popover.iconLabel.set_label(getNotificationsIcon(state))
    popover.valueLabel.set_label(getNotificationsValue(state))
    popover.detailLabel.set_label(getNotificationsDetail(state))
    dndToggle.setActive(state.dnd === true)
    dndToggle.setDetail(state.dnd === null ? "DND state is unavailable for this daemon" : state.dnd ? "Notification popups are paused" : "Notification popups are enabled")
    actionStatus.set_label(getNotificationsDetail(state))
    actionMenu.subtitleLabel.set_label(`${getNotificationDaemonLabel(state.daemon)} • ${getDndLabel(state)} DND • ${state.count} waiting`)

    daemonRow.valueWidget.set_label(getNotificationDaemonLabel(state.daemon))
    dndRow.valueWidget.set_label(getDndLabel(state))
    countRow.valueWidget.set_label(`${state.count}`)
    checkedRow.valueWidget.set_label(state.lastCheckedLabel)

    replaceCssClass(wrapper, STATE_CLASSES, getNotificationsClass(state))
    wrapper.set_visible(state.available)
  }

  async function refresh(force = false) {
    if (refreshing && !force) {
      return
    }

    refreshing = true

    try {
      state = await refreshNotifications(force)
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
      clearNotifications(state)
      scheduleRefreshBurst()
    }
    if (mouseButton === 3) {
      toggleDnd(state)
      scheduleRefreshBurst()
    }
  })
  wrapper.add_controller(click)
  wrapper.set_visible(false)

  state = readNotifications()
  updateUi()

  timeout(GLib.PRIORITY_DEFAULT, 1800, () => {
    void refresh(true)
    return GLib.SOURCE_REMOVE
  })

  timeout(GLib.PRIORITY_DEFAULT, 30000, () => {
    void refresh()
    return GLib.SOURCE_CONTINUE
  })

  return wrapper
}
