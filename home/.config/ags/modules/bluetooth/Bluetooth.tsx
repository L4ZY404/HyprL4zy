import { timeout } from "../../lib/lifecycle"
import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

import { replaceCssClass } from "../../lib/gtk"
import { createActionsSection } from "../../lib/ui/Actions"
import {
  actionButton,
  actionButtonRow,
  actionHint,
  actionSectionTitle,
  actionToggle,
  createActionMenu,
} from "../../lib/ui/ActionMenu"
import {
  connectBluetoothDevice,
  disconnectBluetoothDevice,
  EMPTY_BLUETOOTH,
  forgetBluetoothDevice,
  getBatteryIcon,
  getBluetoothClass,
  getBluetoothDetail,
  getBluetoothIcon,
  getBluetoothValue,
  hasBluetooth,
  listBluetoothDevices,
  openBluetoothManager,
  pairBluetoothDevice,
  readBluetooth,
  refreshBluetooth,
  toggleBluetooth,
  type BluetoothManagedDevice,
  type BluetoothState,
} from "../../services/bluetooth"
import { createInfoPopover } from "../../lib/ui/Popover"

const STATE_CLASSES = ["connection-online", "connection-warning", "connection-offline"]
const REFRESH_BURST_DELAYS = [700, 1800, 3500, 6500, 10000]

function clearBox(box: Gtk.Box) {
  let child = box.get_first_child()
  while (child) {
    const next = child.get_next_sibling()
    box.remove(child)
    child = next
  }
}

function updateHoverDeviceList(list: Gtk.Box, state: BluetoothState) {
  clearBox(list)
  for (const device of state.connectedDevices) {
    const row = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      css_classes: ["bt-device-row"],
      spacing: 8,
    })
    row.append(new Gtk.Label({ label: device.icon, css_classes: ["bt-device-icon"] }))
    row.append(new Gtk.Label({
      label: device.alias,
      css_classes: ["bt-device-name"],
      hexpand: true,
      halign: Gtk.Align.START,
    }))
    row.append(new Gtk.Label({
      label: device.battery !== null ? `${getBatteryIcon(device.battery)} ${device.battery}%` : "",
      css_classes: ["bt-device-battery"],
    }))
    list.append(row)
  }
}

export { hasBluetooth }

export default function Bluetooth() {
  let state = EMPTY_BLUETOOTH
  let scanning = false

  const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["connection-module", "bluetooth-module", getBluetoothClass(state)],
  })
  const buttonBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["connection-button"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })
  const iconLabel = new Gtk.Label({
    label: getBluetoothIcon(state),
    css_classes: ["connection-icon", "bluetooth-icon"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
    yalign: 0.5,
  })
  buttonBox.append(iconLabel)
  wrapper.append(buttonBox)

  const hoverDevices = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["bt-device-list"],
    spacing: 4,
  })
  const hoverExtra = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["bt-popover-extra"],
    spacing: 6,
  })
  hoverExtra.append(hoverDevices)
  hoverExtra.append(createActionsSection([
    { label: "Left click", value: "Open actions" },
    { label: "Middle click", value: "Refresh now" },
    { label: "Right click", value: "Toggle Bluetooth" },
  ]))

  const popover = createInfoPopover(wrapper, {
    icon: getBluetoothIcon(state),
    title: "Bluetooth",
    value: getBluetoothValue(state),
    detail: getBluetoothDetail(state),
    extra: hoverExtra,
    className: "bt-popover-card",
  })

  const actionBody = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  const powerToggle = actionToggle(
    "Bluetooth",
    "Enable or disable the Bluetooth controller",
    false,
    () => handleToggle(),
  )
  actionBody.append(powerToggle.row)
  actionBody.append(actionSectionTitle("Devices"))
  const deviceList = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["module-action-list"],
    spacing: 4,
  })
  const deviceStatus = actionHint("Open Actions to scan nearby and known devices.")
  actionBody.append(deviceList)
  actionBody.append(deviceStatus)
  actionBody.append(actionButtonRow([
    actionButton("Scan", () => void scanDevices(true)),
    actionButton("Manager", openBluetoothManager),
  ]))

  const actionMenu = createActionMenu(wrapper, {
    icon: "",
    title: "Bluetooth",
    subtitle: "Power, pairing and connected devices",
    content: actionBody,
    className: "bluetooth-action-menu",
    onOpen: () => {
      void refresh(true).then(() => scanDevices(false))
    },
  })

  function updateUi() {
    iconLabel.set_label(getBluetoothIcon(state))
    popover.iconLabel.set_label(getBluetoothIcon(state))
    popover.valueLabel.set_label(getBluetoothValue(state))
    popover.detailLabel.set_label(getBluetoothDetail(state))
    updateHoverDeviceList(hoverDevices, state)
    powerToggle.setActive(state.powered && !state.blocked)
    powerToggle.setDetail(state.blocked ? "Bluetooth is blocked" : state.powered ? `${state.connectedDevices.length} connected device${state.connectedDevices.length === 1 ? "" : "s"}` : "Bluetooth is off")
    actionMenu.subtitleLabel.set_label(getBluetoothDetail(state))
    replaceCssClass(wrapper, STATE_CLASSES, getBluetoothClass(state))
    wrapper.set_visible(state.available)
  }

  let pendingPowerTarget: boolean | null = null
  let pendingUntil = 0

  function isTargetReached(realState: BluetoothState, target: boolean) {
    return target ? realState.powered && !realState.blocked : !realState.powered || realState.blocked
  }

  function applyBluetoothState(realState: BluetoothState) {
    const now = Date.now()
    if (pendingPowerTarget !== null) {
      const targetReached = isTargetReached(realState, pendingPowerTarget)
      const pendingExpired = now >= pendingUntil
      if (targetReached || pendingExpired) {
        pendingPowerTarget = null
        pendingUntil = 0
        state = realState
        updateUi()
      }
      return
    }
    state = realState
    updateUi()
  }

  async function refresh(force = false) {
    applyBluetoothState(await refreshBluetooth(force))
  }

  function scheduleRefreshBurst() {
    for (const delay of REFRESH_BURST_DELAYS) {
      timeout(GLib.PRIORITY_DEFAULT, delay, () => {
        void refresh(true)
        return GLib.SOURCE_REMOVE
      })
    }
  }

  function handleToggle() {
    const realState = readBluetooth()
    const willPowerOn = realState.blocked || !realState.powered
    pendingPowerTarget = willPowerOn
    pendingUntil = Date.now() + 10000
    state = {
      ...realState,
      blocked: false,
      powered: willPowerOn,
      connectedDevices: willPowerOn ? realState.connectedDevices : [],
    }
    updateUi()
    void toggleBluetooth(realState)
    scheduleRefreshBurst()
  }

  function createDeviceRow(device: BluetoothManagedDevice) {
    const row = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      css_classes: ["module-action-device-row", device.connected ? "active" : ""].filter(Boolean),
      spacing: 6,
    })
    row.append(new Gtk.Label({ label: device.icon, css_classes: ["module-action-device-icon"] }))
    const text = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 1, hexpand: true })
    text.append(new Gtk.Label({
      label: device.alias,
      css_classes: ["module-action-device-name"],
      halign: Gtk.Align.START,
      xalign: 0,
    }))
    text.append(new Gtk.Label({
      label: `${device.connected ? "Connected" : device.paired ? "Paired" : "Available"}${device.battery !== null ? ` • ${getBatteryIcon(device.battery)} ${device.battery}%` : ""}`,
      css_classes: ["module-action-device-detail"],
      halign: Gtk.Align.START,
      xalign: 0,
    }))
    row.append(text)
    row.append(actionButton(device.connected ? "Disconnect" : device.paired ? "Connect" : "Pair", () => {
      if (device.connected) disconnectBluetoothDevice(device.mac)
      else if (device.paired) connectBluetoothDevice(device.mac)
      else pairBluetoothDevice(device.mac)
      scheduleRefreshBurst()
      timeout(GLib.PRIORITY_DEFAULT, 900, () => {
        void scanDevices(false)
        return GLib.SOURCE_REMOVE
      })
    }))
    if (device.paired && !device.connected) {
      row.append(actionButton("Forget", () => {
        forgetBluetoothDevice(device.mac)
        timeout(GLib.PRIORITY_DEFAULT, 700, () => {
          void scanDevices(false)
          return GLib.SOURCE_REMOVE
        })
      }, "danger"))
    }
    return row
  }

  async function scanDevices(scan = true) {
    if (scanning || !state.powered) {
      if (!state.powered) deviceStatus.set_label("Turn Bluetooth on to scan devices.")
      return
    }
    scanning = true
    deviceStatus.set_label(scan ? "Scanning..." : "Refreshing...")
    try {
      const devices = await listBluetoothDevices(scan)
      clearBox(deviceList)
      for (const device of devices) deviceList.append(createDeviceRow(device))
      deviceStatus.set_label(devices.length > 0 ? `${devices.length} device${devices.length === 1 ? "" : "s"}` : "No devices found.")
    } finally {
      scanning = false
    }
  }

  const click = new Gtk.GestureClick()
  click.set_button(0)
  click.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
  click.connect("pressed", (gesture) => {
    const mouseButton = gesture.get_current_button()
    if (mouseButton === 2) void refresh(true)
    if (mouseButton === 3) handleToggle()
  })
  wrapper.add_controller(click)

  state = readBluetooth()
  updateUi()
  void refresh(true)
  timeout(GLib.PRIORITY_DEFAULT, 6000, () => {
    void refresh()
    return GLib.SOURCE_CONTINUE
  })
  return wrapper
}
