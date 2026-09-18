import { Gtk, Astal } from "ags/gtk4"
import { onCleanup, scopeCallback } from "../lifecycle"
import { frameMotion } from "./FrameMotion"

const activeSheets = new Map<number, () => void>()

export function attachEdgeSheet(window: Astal.Window, shell: Gtk.Widget,
  width: number, height: number, slot: number) {
  const root = new Gtk.Overlay()
  // A bounded panel viewport; no full-screen surface or custom border renderer.
  const viewport = new Gtk.Box()
  viewport.set_size_request(width, height)
  const stage = new Gtk.Fixed({ hexpand: true, vexpand: true })
  root.set_child(viewport)
  root.add_overlay(stage)
  root.set_measure_overlay(stage, false)
  root.set_clip_overlay(stage, true)
  shell.set_size_request(width, height)
  stage.put(shell, 0, height)
  window.set_child(root)
  window.set_default_size(width, height)
  window.set_anchor(Astal.WindowAnchor.BOTTOM)
  window.add_css_class("bottom-panel-window")
  window.hide()
  let opened = false
  const motion = frameMotion(window, value => {
    stage.move(shell, 0, height * (1 - value))
  })
  const hide = scopeCallback((after?: () => void) => {
    opened = false
    shell.set_sensitive(false)
    if (activeSheets.get(slot) === close) activeSheets.delete(slot)
    motion.to(0, 320, () => { window.hide(); after?.() })
  })
  const close = () => hide()
  const show = scopeCallback(() => {
    const previous = activeSheets.get(slot)
    if (previous && previous !== close) previous()
    activeSheets.set(slot, close)
    opened = true
    shell.set_sensitive(true)
    window.present()
    motion.to(1, 430)
  })
  onCleanup(() => {
    motion.dispose()
    if (activeSheets.get(slot) === close) activeSheets.delete(slot)
  })
  return { show, hide, isOpen: () => opened }
}
