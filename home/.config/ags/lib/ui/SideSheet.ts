import { Astal, Gtk } from "ags/gtk4"
import { onCleanup, scopeCallback } from "../lifecycle"
import { frameMotion } from "./FrameMotion"

const activeSheets = new Map<number, () => void>()
const { RIGHT } = Astal.WindowAnchor

/**
 * Attach a right-edge sliding sheet.
 *
 * Width comes from the caller's monitor-relative geometry. Height is measured
 * from the completed GTK widget tree, so the layer-shell window always hugs
 * the actual content and cannot clip because of a hard-coded panel height.
 */
export function attachRightSheet(
  window: Astal.Window,
  shell: Gtk.Widget,
  width: number,
  slot: number,
) {
  // Explicit paintless wrappers prevent the GTK theme's default toplevel
  // background from leaking through the rounded top-left/bottom-left corners.
  const root = new Gtk.Overlay({ css_classes: ["right-sheet-root"] })
  const viewport = new Gtk.Box({ css_classes: ["right-sheet-viewport"] })
  const stage = new Gtk.Fixed({
    hexpand: true,
    vexpand: true,
    css_classes: ["right-sheet-stage"],
  })

  // Give the rounded left corners a small transparent paint gutter. The gutter
  // is derived from the panel width, so it scales with every monitor instead
  // of relying on a display-specific pixel constant. The shell still ends at
  // the exact right edge of the layer surface.
  const cornerGutter = Math.round(width * 0.018)
  const surfaceWidth = width + cornerGutter

  // Constrain only the horizontal axis first. GTK then reports the natural
  // vertical size for this exact monitor-relative width.
  shell.set_size_request(width, -1)

  stage.put(shell, surfaceWidth, cornerGutter)
  root.set_child(viewport)
  root.add_overlay(stage)
  root.set_measure_overlay(stage, false)
  root.set_clip_overlay(stage, true)
  window.set_child(root)

  const [, measuredHeight] = shell.measure(Gtk.Orientation.VERTICAL, width)
  const shellHeight = Math.max(1, Math.ceil(measuredHeight))
  const surfaceHeight = shellHeight + (cornerGutter * 2)

  viewport.set_size_request(surfaceWidth, surfaceHeight)
  stage.set_size_request(surfaceWidth, surfaceHeight)
  window.set_default_size(surfaceWidth, surfaceHeight)

  // Anchor only to the right edge. The unanchored vertical axis is centered by
  // layer-shell, keeping the naturally-sized card detached from top/bottom.
  window.set_anchor(RIGHT)
  window.remove_css_class("background")
  window.add_css_class("right-panel-window")
  window.hide()

  let opened = false
  const motion = frameMotion(window, value => {
    // Closed: the shell begins just beyond the right edge. Open: it rests
    // after the transparent corner gutter, leaving room for clean antialiasing.
    stage.move(shell, cornerGutter + width * (1 - value), cornerGutter)
  })

  const hide = scopeCallback((after?: () => void) => {
    opened = false
    shell.set_sensitive(false)
    if (activeSheets.get(slot) === close) activeSheets.delete(slot)
    motion.to(0, 260, () => {
      window.hide()
      after?.()
    })
  })

  const close = () => hide()

  const show = scopeCallback(() => {
    const previous = activeSheets.get(slot)
    if (previous && previous !== close) previous()
    activeSheets.set(slot, close)
    opened = true
    shell.set_sensitive(true)
    window.present()
    motion.to(1, 360)
  })

  onCleanup(() => {
    motion.dispose()
    if (activeSheets.get(slot) === close) activeSheets.delete(slot)
  })

  return { show, hide, isOpen: () => opened }
}
