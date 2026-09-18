import { commandExists, execAsync, shellQuote, spawn } from "../lib/shell"

export function hasEasyEffects() {
  return commandExists("easyeffects")
}

export function openEasyEffects() {
  if (hasEasyEffects()) {
    spawn("easyeffects")
    return
  }

  if (commandExists("notify-send")) {
    spawn(`notify-send "Audio Studio" ${shellQuote("EasyEffects is not installed. Install the audio-effects component.")}`)
  }
}

export function toggleEasyEffectsBypass() {
  if (!hasEasyEffects()) return
  spawn("easyeffects --bypass-toggle")
}

export function loadEasyEffectsPreset(name: string) {
  if (!hasEasyEffects() || !name.trim()) return
  spawn(`easyeffects --load-preset ${shellQuote(name.trim())}`)
}

export async function getLastEasyEffectsPreset() {
  if (!hasEasyEffects()) return "Unavailable"

  try {
    const output = await execAsync(["bash", "-c", "timeout 4 easyeffects --last-loaded-preset output 2>/dev/null"])
    return output.trim() || "None"
  } catch {
    return "Unknown"
  }
}

export async function listEasyEffectsPresets() {
  if (!hasEasyEffects()) return []

  try {
    const output = await execAsync(["bash", "-c", "timeout 5 easyeffects --presets 2>/dev/null"])
    const presets: string[] = []
    const seen = new Set<string>()

    for (const rawLine of output.split("\n")) {
      const line = rawLine.trim().replace(/^[-*•]\s*/, "")
      if (!line || /presets?:$/i.test(line) || /^no .*presets/i.test(line)) continue
      if (seen.has(line)) continue
      seen.add(line)
      presets.push(line)
    }

    return presets.slice(0, 12)
  } catch (error) {
    console.error("EasyEffects preset query failed:", error)
    return []
  }
}
