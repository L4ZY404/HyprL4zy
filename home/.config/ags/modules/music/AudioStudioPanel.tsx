import { Gtk } from "ags/gtk4"
import {
  actionButton,
  actionButtonRow,
  actionHint,
  actionSectionTitle,
} from "../../lib/ui/ActionMenu"
import { restartCava } from "../../services/cava"
import {
  getLastEasyEffectsPreset,
  hasEasyEffects,
  listEasyEffectsPresets,
  loadEasyEffectsPreset,
  openEasyEffects,
  toggleEasyEffectsBypass,
} from "../../services/audioStudio"

function clearBox(box: Gtk.Box) {
  let child = box.get_first_child()
  while (child) {
    const next = child.get_next_sibling()
    box.remove(child)
    child = next
  }
}

export function createAudioStudioPanel() {
  const root = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["audio-studio-panel"],
    spacing: 6,
  })

  root.append(actionSectionTitle("Audio Studio"))
  const status = actionHint(hasEasyEffects() ? "EasyEffects ready" : "EasyEffects is not installed.")
  root.append(status)

  const presetList = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["audio-studio-presets"],
    spacing: 4,
  })
  root.append(actionSectionTitle("Output presets"))
  const presetScroll = new Gtk.ScrolledWindow({
    css_classes: ["audio-studio-preset-scroll"],
    hscrollbar_policy: Gtk.PolicyType.NEVER,
    vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
    propagate_natural_height: true,
    propagate_natural_width: true,
  })
  presetScroll.set_max_content_height(260)
  presetScroll.set_child(presetList)
  root.append(presetScroll)

  root.append(actionButtonRow([
    actionButton("EasyEffects", openEasyEffects),
    actionButton("Bypass", toggleEasyEffectsBypass),
    actionButton("Restart Cava", restartCava),
  ]))

  async function refresh() {
    const available = hasEasyEffects()
    if (!available) {
      status.set_label("EasyEffects is missing. Install the audio-effects component to enable presets and processing.")
      clearBox(presetList)
      return
    }

    const [presets, current] = await Promise.all([
      listEasyEffectsPresets(),
      getLastEasyEffectsPreset(),
    ])
    status.set_label(`Current preset: ${current}`)
    clearBox(presetList)

    if (presets.length === 0) {
      presetList.append(actionHint("No EasyEffects presets were reported. Create one in EasyEffects first."))
      return
    }

    for (const preset of presets) {
      presetList.append(actionButton(preset, () => {
        loadEasyEffectsPreset(preset)
        status.set_label(`Loading preset: ${preset}`)
      }, "preset"))
    }
  }

  return { widget: root, refresh }
}
