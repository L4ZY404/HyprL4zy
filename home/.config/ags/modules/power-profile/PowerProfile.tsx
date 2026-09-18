import { timeout } from "../../lib/lifecycle"
import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

import { replaceCssClass } from "../../lib/gtk"
import { createActionsSection } from "../../lib/ui/Actions"
import { actionButton, actionButtonRow, actionHint, actionSectionTitle, createActionMenu } from "../../lib/ui/ActionMenu"
import {
  getAvailableProfilesLabel,
  getPowerProfileClass,
  getPowerProfileDetail,
  getPowerProfileIcon,
  getPowerProfileTitle,
  getPowerProfileValue,
  openPowerSettings,
  readPowerProfile,
  refreshPowerProfile,
  setPowerProfile,
} from "../../services/powerProfile"
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
    css_classes: ["power-profile-popover-row", "popover-data-row"],
    spacing: 8,
  })

  const labelWidget = new Gtk.Label({
    label,
    css_classes: ["power-profile-popover-row-label", "popover-data-label"],
    halign: Gtk.Align.START,
    xalign: 0,
    hexpand: true,
  })

  const valueWidget = new Gtk.Label({
    label: value,
    css_classes: ["power-profile-popover-row-value", "popover-data-value"],
    halign: Gtk.Align.END,
    xalign: 1,
  })

  row.append(labelWidget)
  row.append(valueWidget)

  return { row, valueWidget }
}

export default function PowerProfile() {
  let state = readPowerProfile()
  let refreshing = false

  const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: [
      "connection-module",
      "power-profile-module",
      getPowerProfileClass(state),
    ],
  })

  const buttonBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["connection-button"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })

  const iconLabel = new Gtk.Label({
    label: getPowerProfileIcon(state),
    css_classes: ["connection-icon", "power-profile-icon"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
    yalign: 0.5,
  })

  buttonBox.append(iconLabel)
  wrapper.append(buttonBox)

  const popoverRows = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["power-profile-popover-grid", "popover-data-grid"],
    spacing: 3,
  })

  const currentRow = createInfoRow("Current")
  const availableRow = createInfoRow("Available")
  const driverRow = createInfoRow("Driver")
  const statusRow = createInfoRow("Status")

  for (const item of [currentRow, availableRow, driverRow, statusRow]) {
    popoverRows.append(item.row)
  }

  popoverRows.append(
    createActionsSection([
      { label: "Left click", value: "Open actions" },
      { label: "Middle click", value: "Refresh now" },
      { label: "Right click", value: "Open power settings" },
    ]),
  )

  const popover = createInfoPopover(wrapper, {
    icon: getPowerProfileIcon(state),
    title: getPowerProfileTitle(state),
    value: getPowerProfileValue(state),
    detail: getPowerProfileDetail(state),
    extra: popoverRows,
    className: "power-profile-popover-card",
  })

  const actionBody = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  actionBody.append(actionSectionTitle("Power plan"))
  const performanceButton = actionButton("Performance", () => applyProfile("performance"))
  const balancedButton = actionButton("Balanced", () => applyProfile("balanced"))
  const saverButton = actionButton("Power saver", () => applyProfile("power-saver"))
  actionBody.append(actionButtonRow([performanceButton, balancedButton, saverButton]))
  const actionStatus = actionHint(getPowerProfileDetail(state))
  actionBody.append(actionStatus)
  actionBody.append(actionButtonRow([
    actionButton("Refresh", () => void refresh(true)),
    actionButton("Power settings", openPowerSettings),
  ]))
  const actionMenu = createActionMenu(wrapper, {
    icon: getPowerProfileIcon(state),
    title: "Power profile",
    subtitle: "Performance and battery balance",
    content: actionBody,
    className: "power-profile-action-menu",
    onOpen: () => void refresh(true),
  })

  function setSelected(button: Gtk.Button, selected: boolean) {
    if (selected) button.add_css_class("selected")
    else button.remove_css_class("selected")
  }

  function applyProfile(profile: "performance" | "balanced" | "power-saver") {
    setPowerProfile(profile)
    state = { ...state, profile }
    updateUi()
    scheduleRefreshBurst()
  }

  function updateUi() {
    iconLabel.set_label(getPowerProfileIcon(state))
    popover.iconLabel.set_label(getPowerProfileIcon(state))
    popover.titleLabel.set_label(getPowerProfileTitle(state))
    popover.valueLabel.set_label(getPowerProfileValue(state))
    popover.detailLabel.set_label(getPowerProfileDetail(state))
    setSelected(performanceButton, state.profile === "performance")
    setSelected(balancedButton, state.profile === "balanced")
    setSelected(saverButton, state.profile === "power-saver")
    actionStatus.set_label(getPowerProfileDetail(state))
    actionMenu.subtitleLabel.set_label(`${getPowerProfileValue(state)} • ${state.driver || "no driver"}`)

    currentRow.valueWidget.set_label(getPowerProfileValue(state))
    availableRow.valueWidget.set_label(getAvailableProfilesLabel(state))
    driverRow.valueWidget.set_label(state.driver || "—")
    statusRow.valueWidget.set_label(state.status === "error" ? state.error : state.status)

    replaceCssClass(wrapper, STATE_CLASSES, getPowerProfileClass(state))
    wrapper.set_visible(state.available)
  }

  async function refresh(force = false) {
    if (refreshing && !force) {
      return
    }

    refreshing = true

    try {
      state = await refreshPowerProfile(force)
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
    if (mouseButton === 2) void refresh(true)
    if (mouseButton === 3) openPowerSettings()
  })
  wrapper.add_controller(click)
  wrapper.set_visible(false)

  updateUi()

  timeout(GLib.PRIORITY_DEFAULT, 2200, () => {
    void refresh(true)
    return GLib.SOURCE_REMOVE
  })

  timeout(GLib.PRIORITY_DEFAULT, 30000, () => {
    void refresh()
    return GLib.SOURCE_CONTINUE
  })

  return wrapper
}
