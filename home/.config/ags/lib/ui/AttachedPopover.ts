import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"
import { onCleanup } from "../lifecycle"

const ENTERING_CLASS = "popover-motion-entering"
const VISIBLE_CLASS = "popover-motion-visible"
const MOTION_ARM_DELAY_MS = 34

// Informational widgets use the Revealer only to give Gtk.Popover a stable
// natural size. The visible motion itself is a CSS translateX on the actual
// rounded card. Every map cycle deliberately holds the entering transform for
// one rendered frame before switching to the visible state, so the animation
// replays on every hover instead of only on the first mapping.
export function attachPopoverPaper(popover: Gtk.Popover, content: Gtk.Widget) {
  const reveal = new Gtk.Revealer({
    transition_type: Gtk.RevealerTransitionType.NONE,
    transition_duration: 0,
    reveal_child: false,
  })
  reveal.set_child(content)
  popover.set_child(reveal)
  popover.add_css_class("edge-widget-popover")

  let generation = 0
  let motionSource = 0

  const cancelMotionSource = () => {
    if (!motionSource) return
    GLib.source_remove(motionSource)
    motionSource = 0
  }

  const resetMotion = () => {
    content.remove_css_class(VISIBLE_CLASS)
    content.add_css_class(ENTERING_CLASS)
  }

  const prepareOpen = () => {
    generation++
    cancelMotionSource()
    resetMotion()
    reveal.set_reveal_child(true)
  }

  const cancelOpen = () => {
    generation++
    cancelMotionSource()
    content.remove_css_class(VISIBLE_CLASS)
    content.remove_css_class(ENTERING_CLASS)
    reveal.set_reveal_child(false)
  }

  popover.connect("map", () => {
    const token = generation

    // Re-assert the starting transform after mapping. GTK4 may otherwise reuse
    // the previous computed transform when a Popover is mapped again, causing
    // subsequent hovers to appear instantly. Keeping this state for ~2 frames
    // guarantees that -1.55em is actually painted before transitioning to 0.
    resetMotion()
    cancelMotionSource()
    motionSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MOTION_ARM_DELAY_MS, () => {
      motionSource = 0
      if (token !== generation || !popover.get_mapped()) return GLib.SOURCE_REMOVE
      content.remove_css_class(ENTERING_CLASS)
      content.add_css_class(VISIBLE_CLASS)
      return GLib.SOURCE_REMOVE
    })
  })

  popover.connect("unmap", cancelOpen)
  onCleanup(() => { cancelOpen(); popover.unparent() })

  return { prepareOpen, cancelOpen }
}
