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
  connectWifiNetwork,
  EMPTY_NETWORK,
  getNetworkClass,
  getNetworkDetail,
  getNetworkDownloadLabel,
  getNetworkIcon,
  getNetworkInterfaceLabel,
  getNetworkIpLabel,
  getNetworkNameLabel,
  getNetworkSignalLabel,
  getNetworkTitle,
  getNetworkUploadLabel,
  getNetworkValue,
  openNetworkManager,
  readNetwork,
  refreshNetwork,
  scanWifiNetworks,
  toggleWifi,
  type WifiNetwork,
} from "../../services/network"
import { createInfoPopover } from "../../lib/ui/Popover"

const STATE_CLASSES = ["connection-online", "connection-warning", "connection-offline"]
const REFRESH_BURST_DELAYS = [500, 1600, 3600]

function createInfoRow(label: string, value = "—") {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["network-popover-row", "popover-data-row"],
    spacing: 8,
  })
  const labelWidget = new Gtk.Label({
    label,
    css_classes: ["network-popover-row-label", "popover-data-label"],
    halign: Gtk.Align.START,
    xalign: 0,
    hexpand: true,
  })
  const valueWidget = new Gtk.Label({
    label: value,
    css_classes: ["network-popover-row-value", "popover-data-value"],
    halign: Gtk.Align.END,
    xalign: 1,
  })
  row.append(labelWidget)
  row.append(valueWidget)
  return { row, valueWidget }
}

function clearBox(box: Gtk.Box) {
  let child = box.get_first_child()
  while (child) {
    const next = child.get_next_sibling()
    box.remove(child)
    child = next
  }
}

function networkRow(network: WifiNetwork, connect: (network: WifiNetwork) => void) {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["module-action-device-row", network.active ? "active" : ""].filter(Boolean),
    spacing: 8,
  })
  const icon = network.signal >= 75 ? "󰤨" : network.signal >= 50 ? "󰤥" : network.signal >= 25 ? "󰤢" : "󰤟"
  row.append(new Gtk.Label({ label: icon, css_classes: ["module-action-device-icon"] }))
  row.append(new Gtk.Label({
    label: network.ssid,
    css_classes: ["module-action-device-name"],
    halign: Gtk.Align.START,
    xalign: 0,
    hexpand: true,
  }))
  row.append(new Gtk.Label({
    label: network.active ? "Connected" : `${network.signal}%`,
    css_classes: ["module-action-device-detail"],
  }))
  if (!network.active) row.append(actionButton("Connect", () => connect(network)))
  return row
}

export default function Network() {
  let state = EMPTY_NETWORK
  let refreshing = false
  let scanning = false

  const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["connection-module", "network-module", getNetworkClass(state)],
  })
  const buttonBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["connection-button"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })
  const iconLabel = new Gtk.Label({
    label: getNetworkIcon(state),
    css_classes: ["connection-icon", "network-icon"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
    yalign: 0.5,
  })
  buttonBox.append(iconLabel)
  wrapper.append(buttonBox)

  // Preserve the original informational hover popover.
  const popoverRows = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["network-popover-grid", "popover-data-grid"],
    spacing: 3,
  })
  const ifaceRow = createInfoRow("Interface")
  const nameRow = createInfoRow("Network")
  const signalRow = createInfoRow("Signal")
  const ipRow = createInfoRow("IP")
  const downloadRow = createInfoRow("Download")
  const uploadRow = createInfoRow("Upload")
  for (const item of [ifaceRow, nameRow, signalRow, ipRow, downloadRow, uploadRow]) popoverRows.append(item.row)
  popoverRows.append(createActionsSection([
    { label: "Left click", value: "Open actions" },
    { label: "Middle click", value: "Refresh now" },
    { label: "Right click", value: "Toggle Wi-Fi" },
  ]))

  const popover = createInfoPopover(wrapper, {
    icon: getNetworkIcon(state),
    title: getNetworkTitle(state),
    value: getNetworkValue(state),
    detail: getNetworkDetail(state),
    extra: popoverRows,
    className: "network-popover-card",
  })

  // Click opens a deliberately separate action surface.
  const actionBody = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["module-action-body"],
    spacing: 6,
  })
  const wifiToggle = actionToggle(
    "Wi-Fi radio",
    "Enable or disable the wireless radio",
    true,
    () => {
      toggleWifi(state)
      scheduleRefreshBurst()
    },
  )
  actionBody.append(wifiToggle.row)
  actionBody.append(actionSectionTitle("Nearby networks"))

  const wifiList = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["module-action-list"],
    spacing: 4,
  })
  const wifiStatus = actionHint("Open Actions to scan nearby Wi-Fi networks.")
  actionBody.append(wifiList)
  actionBody.append(wifiStatus)
  actionBody.append(actionButtonRow([
    actionButton("Rescan", () => void scanNetworks()),
    actionButton("Manager", openNetworkManager),
  ]))

  const actionMenu = createActionMenu(wrapper, {
    icon: "󰤨",
    title: "Wi-Fi",
    subtitle: "Connection controls and nearby networks",
    content: actionBody,
    className: "network-action-menu",
    onOpen: () => {
      void refresh(true)
      void scanNetworks()
    },
  })

  function updateUi() {
    iconLabel.set_label(getNetworkIcon(state))
    popover.iconLabel.set_label(getNetworkIcon(state))
    popover.titleLabel.set_label(getNetworkTitle(state))
    popover.valueLabel.set_label(getNetworkValue(state))
    popover.detailLabel.set_label(getNetworkDetail(state))
    ifaceRow.valueWidget.set_label(getNetworkInterfaceLabel(state))
    nameRow.valueWidget.set_label(getNetworkNameLabel(state))
    signalRow.valueWidget.set_label(getNetworkSignalLabel(state))
    ipRow.valueWidget.set_label(getNetworkIpLabel(state))
    downloadRow.valueWidget.set_label(getNetworkDownloadLabel(state))
    uploadRow.valueWidget.set_label(getNetworkUploadLabel(state))
    wifiToggle.setActive(state.wifiAvailable && !state.wifiBlocked)
    wifiToggle.setDetail(state.wifiBlocked ? "Wireless radio is blocked" : state.connected && state.type === "wifi" ? state.name : "Wireless radio available")
    actionMenu.subtitleLabel.set_label(state.connected ? `${state.name} • ${getNetworkIpLabel(state)}` : getNetworkDetail(state))
    replaceCssClass(wrapper, STATE_CLASSES, getNetworkClass(state))
  }

  async function refresh(force = false) {
    if (refreshing && !force) return
    refreshing = true
    try {
      state = await refreshNetwork(force)
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

  async function scanNetworks() {
    if (scanning) return
    scanning = true
    wifiStatus.set_label("Scanning...")
    try {
      const networks = await scanWifiNetworks()
      clearBox(wifiList)
      const connect = (network: WifiNetwork) => {
        wifiStatus.set_label(`Connecting to ${network.ssid}...`)
        connectWifiNetwork(network.ssid)
        scheduleRefreshBurst()
        timeout(GLib.PRIORITY_DEFAULT, 1600, () => {
          void scanNetworks()
          return GLib.SOURCE_REMOVE
        })
      }
      for (const network of networks) wifiList.append(networkRow(network, connect))
      wifiStatus.set_label(
        networks.length > 0
          ? "Saved/open networks connect directly. Use Manager when credentials are required."
          : "No Wi-Fi networks found or nmcli is unavailable.",
      )
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
    if (mouseButton === 3) {
      toggleWifi(state)
      scheduleRefreshBurst()
    }
  })
  wrapper.add_controller(click)

  state = readNetwork()
  updateUi()
  timeout(GLib.PRIORITY_DEFAULT, 1200, () => {
    void refresh(true)
    return GLib.SOURCE_REMOVE
  })
  timeout(GLib.PRIORITY_DEFAULT, 2000, () => {
    void refresh()
    return GLib.SOURCE_CONTINUE
  })

  return wrapper
}
