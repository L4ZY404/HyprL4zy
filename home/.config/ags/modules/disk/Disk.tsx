import { timeout } from "../../lib/lifecycle"
import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

import { replaceCssClass } from "../../lib/gtk"
import { createActionsSection } from "../../lib/ui/Actions"
import { actionButton, actionButtonRow, actionHint, createActionMenu } from "../../lib/ui/ActionMenu"
import { FALLBACK_UI, type UiScale } from "../../theme"
import Dial from "../../lib/ui/Dial"
import { createInfoPopover } from "../../lib/ui/Popover"
import {
  DISK_CONFIG,
  DISK_REFRESH_MS,
  EMPTY_DISK,
  formatBytes,
  formatDiskDetail,
  formatDiskValue,
  getDiskClass,
  openDiskPath,
  openDiskUtility,
  readDisk,
  type DiskState,
} from "../../services/disk"

type DiskProps = {
  ui?: UiScale
}

type DiskRowWidget = {
  row: Gtk.Box
  valueWidget: Gtk.Label
}

type DiskItem = {
  state: DiskState
  wrapper: Gtk.Box
  row: Gtk.Box
  dial: Gtk.Widget
  popover: ReturnType<typeof createInfoPopover>
  rows: Record<string, DiskRowWidget>
}

const STATE_CLASSES = [
  "disk-safe",
  "disk-warn",
  "disk-critical",
  "disk-offline",
]

function createDiskDial(state: DiskState, ui: UiScale) {
  return Dial({
    icon: state.icon,
    value: state.usedPercent ?? 0,
    max: 100,
    active: state.kind !== "offline",
    warningAt: DISK_CONFIG.warningPercent,
    criticalAt: DISK_CONFIG.criticalPercent,
    className: "disk-dial",
    ui,
  })
}

function createInfoRow(label: string, value = "—"): DiskRowWidget {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["disk-popover-row", "popover-data-row"],
    spacing: 8,
  })

  const labelWidget = new Gtk.Label({
    label,
    css_classes: ["disk-popover-row-label", "popover-data-label"],
    halign: Gtk.Align.START,
    xalign: 0,
    hexpand: true,
  })

  const valueWidget = new Gtk.Label({
    label: value,
    css_classes: ["disk-popover-row-value", "popover-data-value"],
    halign: Gtk.Align.END,
    xalign: 1,
  })

  row.append(labelWidget)
  row.append(valueWidget)

  return { row, valueWidget }
}

function createDiskItem(state: DiskState, ui: UiScale): DiskItem {
  const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["speed-item", "disk-module", getDiskClass(state)],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    hexpand: false,
    vexpand: false,
  })

  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["speed-row", "disk-row", getDiskClass(state)],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    hexpand: false,
    vexpand: false,
  })

  const dial = createDiskDial(state, ui)

  row.append(dial)
  wrapper.append(row)

  const rowsBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["disk-popover-grid", "popover-data-grid"],
    spacing: 3,
  })

  const rows = {
    filesystem: createInfoRow("Filesystem"),
    path: createInfoRow("Path"),
    used: createInfoRow("Used"),
    free: createInfoRow("Free"),
    total: createInfoRow("Total"),
  }

  for (const item of Object.values(rows)) {
    rowsBox.append(item.row)
  }

  rowsBox.append(
    createActionsSection([
      { label: "Left click", value: "Open actions" },
      { label: "Right click", value: "Refresh disk" },
    ]),
  )

  const popover = createInfoPopover(wrapper, {
    icon: state.icon,
    title: "Disk",
    value: formatDiskValue(state),
    detail: formatDiskDetail(state),
    extra: rowsBox,
    className: "disk-popover-card system-popover-card",
  })

  return {
    state,
    wrapper,
    row,
    dial,
    popover,
    rows,
  }
}

function updateDiskRows(item: DiskItem, state: DiskState) {
  item.rows.filesystem.valueWidget.set_label(state.filesystem || "—")
  item.rows.path.valueWidget.set_label(state.path || "—")
  item.rows.used.valueWidget.set_label(formatBytes(state.usedBytes))
  item.rows.free.valueWidget.set_label(formatBytes(state.availableBytes))
  item.rows.total.valueWidget.set_label(formatBytes(state.totalBytes))
}

function updateDiskItem(item: DiskItem, state: DiskState, ui: UiScale) {
  item.state = state
  item.row.remove(item.dial)

  item.dial = createDiskDial(state, ui)
  item.row.append(item.dial)

  item.popover.iconLabel.set_label(state.icon)
  item.popover.titleLabel.set_label("Disk")
  item.popover.valueLabel.set_label(formatDiskValue(state))
  item.popover.detailLabel.set_label(formatDiskDetail(state))
  updateDiskRows(item, state)

  replaceCssClass(item.wrapper, STATE_CLASSES, getDiskClass(state))
  replaceCssClass(item.row, STATE_CLASSES, getDiskClass(state))
}

export default function Disk({ ui = FALLBACK_UI }: DiskProps = {}) {
  let refreshing = false
  const item = createDiskItem(EMPTY_DISK, ui)

  async function refresh() {
    if (refreshing) {
      return
    }

    refreshing = true

    try {
      updateDiskItem(item, await readDisk(), ui)
      syncActionUi()
    } finally {
      refreshing = false
    }
  }

  const actionBody = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  const actionStatus = actionHint(formatDiskDetail(item.state))
  actionBody.append(actionStatus)
  actionBody.append(actionButtonRow([
    actionButton("Open path", openDiskPath),
    actionButton("Disk utility", openDiskUtility),
  ]))
  actionBody.append(actionButtonRow([actionButton("Refresh", () => void refresh())]))
  const actionMenu = createActionMenu(item.wrapper, {
    icon: "󰋊",
    title: "Disk",
    subtitle: "Storage actions",
    content: actionBody,
    className: "disk-action-menu",
    onOpen: () => void refresh(),
  })

  function syncActionUi() {
    actionStatus.set_label(formatDiskDetail(item.state))
    actionMenu.subtitleLabel.set_label(formatDiskValue(item.state))
  }

  const click = new Gtk.GestureClick()
  click.set_button(0)
  click.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)

  click.connect("pressed", (gesture) => {
    if (gesture.get_current_button() === 3) {
      void refresh()
    }
  })

  item.wrapper.add_controller(click)

  updateDiskRows(item, EMPTY_DISK)
  syncActionUi()

  timeout(GLib.PRIORITY_DEFAULT, 1200, () => {
    void refresh()
    return GLib.SOURCE_REMOVE
  })

  timeout(GLib.PRIORITY_DEFAULT, DISK_REFRESH_MS, () => {
    void refresh()
    return GLib.SOURCE_CONTINUE
  })

  return item.wrapper
}
