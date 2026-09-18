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
  actionSlider,
  actionToggle,
  createActionMenu,
} from "../../lib/ui/ActionMenu"
import {
  changeVolume,
  getInputActiveLabel,
  getInputMuteLabel,
  getMicrophoneDetail,
  getMicrophoneIcon,
  getOutputMuteLabel,
  getVolumeClass,
  getVolumeDetail,
  getVolumeIcon,
  openMixer,
  readVolume,
  refreshVolume,
  setMicVolume,
  setVolume,
  toggleMicMute,
  toggleMute,
} from "../../services/audio"
import { createInfoPopover } from "../../lib/ui/Popover"

const STATE_CLASSES = ["connection-online", "connection-warning", "connection-offline"]

function createInfoRow(label: string, value = "—") {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["audio-popover-row", "popover-data-row"],
    spacing: 8,
  })
  const labelWidget = new Gtk.Label({
    label,
    css_classes: ["audio-popover-row-label", "popover-data-label"],
    halign: Gtk.Align.START,
    xalign: 0,
    hexpand: true,
  })
  const valueWidget = new Gtk.Label({
    label: value,
    css_classes: ["audio-popover-row-value", "popover-data-value"],
    halign: Gtk.Align.END,
    xalign: 1,
  })
  row.append(labelWidget)
  row.append(valueWidget)
  return { row, valueWidget }
}

export default function Volume() {
  let state = readVolume()
  let refreshing = false

  const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["connection-module", "volume-module", getVolumeClass(state)],
  })
  const buttonBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["connection-button"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })
  const iconLabel = new Gtk.Label({
    label: getVolumeIcon(state),
    css_classes: ["connection-icon", "volume-icon"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
    yalign: 0.5,
  })
  buttonBox.append(iconLabel)
  wrapper.append(buttonBox)

  // Original information-only hover surface.
  const popoverRows = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["audio-popover-grid", "popover-data-grid"],
    spacing: 3,
  })
  const outputRow = createInfoRow("Output")
  const outputVolumeRow = createInfoRow("Volume")
  const outputMutedRow = createInfoRow("Output muted")
  const inputRow = createInfoRow("Input")
  const inputVolumeRow = createInfoRow("Mic volume")
  const inputMutedRow = createInfoRow("Mic muted")
  const inputActiveRow = createInfoRow("Mic active")
  const inputStatusRow = createInfoRow("Mic status")
  for (const item of [
    outputRow,
    outputVolumeRow,
    outputMutedRow,
    inputRow,
    inputVolumeRow,
    inputMutedRow,
    inputActiveRow,
    inputStatusRow,
  ]) popoverRows.append(item.row)
  popoverRows.append(createActionsSection([
    { label: "Left click", value: "Open actions" },
    { label: "Middle click", value: "Toggle mic mute" },
    { label: "Right click", value: "Toggle output mute" },
    { label: "Scroll", value: "Change output volume" },
  ]))

  const popover = createInfoPopover(wrapper, {
    icon: getVolumeIcon(state),
    title: "Audio",
    value: `${state.volume}%`,
    detail: getVolumeDetail(state),
    extra: popoverRows,
    className: "audio-popover-card volume-popover-card",
  })

  const actionBody = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  const outputSlider = actionSlider("Output volume", 0, 150, 1, state.volume, (value) => {
    setVolume(value)
    refreshSoon(90)
  })
  const outputMute = actionToggle("Mute output", "Silence the default output device", state.muted, (active) => {
    if (active !== state.muted) toggleMute()
    refreshSoon(120)
  })
  const inputSlider = actionSlider("Microphone level", 0, 150, 1, state.sourceVolume, (value) => {
    setMicVolume(value)
    refreshSoon(90)
  })
  const micMute = actionToggle("Mute microphone", "Disable the default input device", state.sourceMuted, (active) => {
    if (active !== state.sourceMuted) toggleMicMute()
    refreshSoon(120)
  })

  actionBody.append(actionSectionTitle("Output"))
  actionBody.append(outputSlider.box)
  actionBody.append(outputMute.row)
  actionBody.append(actionSectionTitle("Input"))
  actionBody.append(inputSlider.box)
  actionBody.append(micMute.row)
  const audioHint = actionHint(getMicrophoneDetail(state))
  actionBody.append(audioHint)
  actionBody.append(actionButtonRow([actionButton("Open mixer", openMixer)]))

  const actionMenu = createActionMenu(wrapper, {
    icon: "",
    title: "Audio controls",
    subtitle: "Output and microphone",
    content: actionBody,
    className: "audio-action-menu",
    onOpen: () => void refresh(),
  })

  function updateUi() {
    iconLabel.set_label(getVolumeIcon(state))
    popover.iconLabel.set_label(getVolumeIcon(state))
    popover.valueLabel.set_label(`${state.volume}%`)
    popover.detailLabel.set_label(getVolumeDetail(state))
    outputRow.valueWidget.set_label(state.sink || "—")
    outputVolumeRow.valueWidget.set_label(`${state.volume}%`)
    outputMutedRow.valueWidget.set_label(getOutputMuteLabel(state))
    inputRow.valueWidget.set_label(state.source || "—")
    inputVolumeRow.valueWidget.set_label(`${getMicrophoneIcon(state)} ${state.sourceVolume}%`)
    inputMutedRow.valueWidget.set_label(getInputMuteLabel(state))
    inputActiveRow.valueWidget.set_label(getInputActiveLabel(state))
    inputStatusRow.valueWidget.set_label(getMicrophoneDetail(state))
    outputSlider.setValue(state.volume)
    inputSlider.setValue(state.sourceVolume)
    outputMute.setActive(state.muted)
    outputMute.setDetail(state.muted ? "Output is muted" : state.sink || "Default output")
    micMute.setActive(state.sourceMuted)
    micMute.setDetail(getMicrophoneDetail(state))
    audioHint.set_label(`${getInputActiveLabel(state)} active input • ${getMicrophoneDetail(state)}`)
    actionMenu.subtitleLabel.set_label(`${state.volume}% output • ${state.sourceVolume}% mic`)
    replaceCssClass(wrapper, STATE_CLASSES, getVolumeClass(state))
  }

  async function refresh() {
    if (refreshing) return
    refreshing = true
    try {
      state = await refreshVolume()
      updateUi()
    } finally {
      refreshing = false
    }
  }

  function refreshSoon(delay = 100) {
    timeout(GLib.PRIORITY_DEFAULT, delay, () => {
      void refresh()
      return GLib.SOURCE_REMOVE
    })
  }

  const click = new Gtk.GestureClick()
  click.set_button(0)
  click.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
  click.connect("pressed", (gesture) => {
    const mouseButton = gesture.get_current_button()
    if (mouseButton === 2) {
      toggleMicMute()
      refreshSoon(120)
    }
    if (mouseButton === 3) {
      toggleMute()
      refreshSoon(120)
    }
  })
  wrapper.add_controller(click)

  const scroll = new Gtk.EventControllerScroll({ flags: Gtk.EventControllerScrollFlags.VERTICAL })
  scroll.connect("scroll", (_controller, _dx, dy) => {
    if (dy < 0) changeVolume(5)
    else if (dy > 0) changeVolume(-5)
    refreshSoon(80)
    return true
  })
  wrapper.add_controller(scroll)

  updateUi()
  void refresh()
  timeout(GLib.PRIORITY_DEFAULT, 5000, () => {
    void refresh()
    return GLib.SOURCE_CONTINUE
  })
  return wrapper
}
