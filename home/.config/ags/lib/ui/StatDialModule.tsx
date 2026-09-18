import { timeout } from "../lifecycle"
import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"
import Pango from "gi://Pango?version=1.0"

import { replaceCssClass } from "../gtk"
import { FALLBACK_UI, type UiScale } from "../../theme"
import {
  dropFilesystemCache,
  getStatClass,
  openSystemMonitor,
  readStats,
  refreshStats,
  type StatRow,
  type StatState,
} from "../../services/stats"
import {
  readPowerProfile,
  refreshPowerProfile,
  setPowerProfile,
} from "../../services/powerProfile"
import { createActionsSection } from "./Actions"
import {
  actionButton,
  actionButtonRow,
  actionHint,
  actionSectionTitle,
  createActionMenu,
} from "./ActionMenu"
import Dial from "./Dial"
import { createInfoPopover } from "./Popover"

export type StatDialModuleId = "cpu" | "memory" | "temperature"

type StatDialModuleOptions = { id: StatDialModuleId; ui?: UiScale }
type StatRowWidget = { row: Gtk.Box; labelWidget: Gtk.Label; valueWidget: Gtk.Label }
type StatDialItem = {
  state: StatState
  wrapper: Gtk.Box
  row: Gtk.Box
  dial: Gtk.Widget
  popover: ReturnType<typeof createInfoPopover>
  rowsBox: Gtk.Box
  rowWidgets: StatRowWidget[]
  profileLabel: Gtk.Label
  performanceButton: Gtk.Button
  balancedButton: Gtk.Button
  saverButton: Gtk.Button
}

const STATE_CLASSES = ["normal", "warning", "critical", "disabled"]
const REFRESH_INTERVAL = 2000

function getCurrentStat(id: StatDialModuleId, force = false) {
  const states = force ? refreshStats() : readStats()
  return states[id]
}

function createInfoRow(rowData: StatRow): StatRowWidget {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["system-popover-row", "popover-data-row"],
    spacing: 8,
  })
  const labelWidget = new Gtk.Label({
    label: rowData.label,
    css_classes: ["system-popover-row-label", "popover-data-label"],
    halign: Gtk.Align.START,
    xalign: 0,
    hexpand: true,
  })
  const valueWidget = new Gtk.Label({
    label: rowData.value,
    css_classes: ["system-popover-row-value", "popover-data-value"],
    halign: Gtk.Align.END,
    xalign: 1,
    max_width_chars: 24,
    ellipsize: Pango.EllipsizeMode.END,
  })
  row.append(labelWidget)
  row.append(valueWidget)
  return { row, labelWidget, valueWidget }
}

function updateRows(item: StatDialItem, rows: StatRow[]) {
  while (item.rowWidgets.length > rows.length) {
    const removed = item.rowWidgets.pop()
    if (removed) item.rowsBox.remove(removed.row)
  }
  while (item.rowWidgets.length < rows.length) {
    const rowWidget = createInfoRow({ label: "", value: "" })
    item.rowWidgets.push(rowWidget)
    item.rowsBox.append(rowWidget.row)
  }
  for (let index = 0; index < rows.length; index += 1) {
    const rowData = rows[index]
    const rowWidget = item.rowWidgets[index]
    if (!rowData || !rowWidget) continue
    rowWidget.labelWidget.set_label(rowData.label)
    rowWidget.valueWidget.set_label(rowData.value)
  }
}

function formatProfile(profile: string) {
  if (profile === "power-saver") return "Power saver"
  if (profile === "performance") return "Performance"
  if (profile === "balanced") return "Balanced"
  return "Unavailable"
}

function setSelected(button: Gtk.Button, selected: boolean) {
  if (selected) button.add_css_class("selected")
  else button.remove_css_class("selected")
}

function createStatDialItem(id: StatDialModuleId, state: StatState, ui: UiScale): StatDialItem {
  const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["speed-item", `${state.id}-module`, getStatClass(state)],
  })
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["speed-row", getStatClass(state)],
  })
  const dial = Dial({
    icon: state.icon,
    value: state.value,
    max: state.max,
    active: state.active,
    warningAt: state.warningAt,
    criticalAt: state.criticalAt,
    ui,
  })
  row.append(dial)
  wrapper.append(row)

  // Restore the compact information popover used before contextual controls.
  const rowsBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["system-popover-grid", "popover-data-grid"],
    spacing: 3,
  })
  const popover = createInfoPopover(wrapper, {
    icon: state.icon,
    title: state.label,
    value: `${state.value}${state.unit}`,
    detail: state.detail,
    extra: rowsBox,
    className: "system-popover-card",
  })

  const performanceButton = actionButton("Performance", () => setPower("performance"))
  const balancedButton = actionButton("Balanced", () => setPower("balanced"))
  const saverButton = actionButton("Saver", () => setPower("power-saver"))

  const actionBody = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  actionBody.append(actionSectionTitle("Maintenance"))
  actionBody.append(actionButtonRow([
    actionButton("System monitor", openSystemMonitor),
    actionButton("Drop FS cache", dropFilesystemCache, "danger"),
  ]))
  actionBody.append(actionHint("Dropping filesystem cache requires pkexec and may temporarily reduce performance while data is cached again."))
  actionBody.append(actionSectionTitle("Power plan"))
  const profileLabel = actionHint(`Current: ${formatProfile(readPowerProfile().profile)}`)
  actionBody.append(profileLabel)
  actionBody.append(actionButtonRow([performanceButton, balancedButton, saverButton]))

  const actionMenu = createActionMenu(wrapper, {
    icon: state.icon,
    title: `${state.label} actions`,
    subtitle: state.detail,
    content: actionBody,
    className: "system-action-menu",
    onOpen: () => {
      updateStatDialItem(item, getCurrentStat(id, true), ui)
      void refreshPowerProfile(true).then((power) => updatePowerUi(power.profile))
    },
  })

  const item: StatDialItem = {
    state,
    wrapper,
    row,
    dial,
    popover,
    rowsBox,
    rowWidgets: [],
    profileLabel,
    performanceButton,
    balancedButton,
    saverButton,
  }

  function updatePowerUi(profile: string) {
    item.profileLabel.set_label(`Current: ${formatProfile(profile)}`)
    setSelected(item.performanceButton, profile === "performance")
    setSelected(item.balancedButton, profile === "balanced")
    setSelected(item.saverButton, profile === "power-saver")
  }

  function setPower(profile: "performance" | "balanced" | "power-saver") {
    setPowerProfile(profile)
    updatePowerUi(profile)
    timeout(GLib.PRIORITY_DEFAULT, 500, () => {
      void refreshPowerProfile(true).then((power) => updatePowerUi(power.profile))
      return GLib.SOURCE_REMOVE
    })
  }

  updateRows(item, state.rows)
  rowsBox.append(createActionsSection([
    { label: "Left click", value: "Open actions" },
    { label: "Right click", value: "Refresh stats" },
  ]))
  updatePowerUi(readPowerProfile().profile)

  const click = new Gtk.GestureClick()
  click.set_button(0)
  click.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
  click.connect("pressed", (gesture) => {
    if (gesture.get_current_button() === 3) updateStatDialItem(item, getCurrentStat(id, true), ui)
  })
  wrapper.add_controller(click)

  // Keep the controller alive through its popover/controller references.
  void actionMenu
  return item
}

function updateStatDialItem(item: StatDialItem, state: StatState, ui: UiScale) {
  const previousClass = getStatClass(item.state)
  const nextClass = getStatClass(state)
  const changed =
    item.state.value !== state.value ||
    item.state.active !== state.active ||
    item.state.detail !== state.detail ||
    JSON.stringify(item.state.rows) !== JSON.stringify(state.rows) ||
    previousClass !== nextClass
  if (!changed) return

  item.state = state
  item.row.remove(item.dial)
  item.dial = Dial({
    icon: state.icon,
    value: state.value,
    max: state.max,
    active: state.active,
    warningAt: state.warningAt,
    criticalAt: state.criticalAt,
    ui,
  })
  item.row.append(item.dial)
  item.popover.iconLabel.set_label(state.icon)
  item.popover.titleLabel.set_label(state.label)
  item.popover.valueLabel.set_label(`${state.value}${state.unit}`)
  item.popover.detailLabel.set_label(state.detail)
  updateRows(item, state.rows)
  replaceCssClass(item.wrapper, STATE_CLASSES, nextClass)
  replaceCssClass(item.row, STATE_CLASSES, nextClass)
}

export function createStatDialModule({ id, ui = FALLBACK_UI }: StatDialModuleOptions) {
  const item = createStatDialItem(id, getCurrentStat(id), ui)
  timeout(GLib.PRIORITY_DEFAULT, REFRESH_INTERVAL, () => {
    updateStatDialItem(item, getCurrentStat(id), ui)
    return GLib.SOURCE_CONTINUE
  })
  return item.wrapper
}
