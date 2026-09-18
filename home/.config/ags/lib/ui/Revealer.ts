import { cancelSource } from "../lifecycle"
import { timeout } from "../lifecycle"
import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

type SlideRevealOptions = {
  child: Gtk.Widget
  visible?: boolean
  duration?: number
  className?: string
  transition?: Gtk.RevealerTransitionType
}

type CollapsingSlideRevealOptions = {
  child: Gtk.Widget
  visible?: boolean
  duration?: number
  className?: string
  edgeTransition?: Gtk.RevealerTransitionType
  collapseTransition?: Gtk.RevealerTransitionType
}

export function createSlideReveal({
  child,
  visible = true,
  duration = 180,
  className = "",
  transition = Gtk.RevealerTransitionType.SLIDE_RIGHT,
}: SlideRevealOptions) {
  const revealer = new Gtk.Revealer({
    reveal_child: visible,
    transition_duration: duration,
    transition_type: transition,
    css_classes: [
      "slide-reveal",
      ...className.split(" ").filter(Boolean),
    ],
  })

  revealer.set_child(child)

  return {
    revealer,

    show() {
      revealer.set_reveal_child(true)
    },

    hide() {
      revealer.set_reveal_child(false)
    },

    setVisible(value: boolean) {
      revealer.set_reveal_child(value)
    },
  }
}

export function createCollapsingSlideReveal({
  child,
  visible = true,
  duration = 180,
  className = "",
  edgeTransition = Gtk.RevealerTransitionType.SLIDE_RIGHT,
  collapseTransition = Gtk.RevealerTransitionType.SLIDE_DOWN,
}: CollapsingSlideRevealOptions) {
  let currentVisible = visible
  let collapseTimer = 0
  let edgeTimer = 0

  const edgeRevealer = new Gtk.Revealer({
    reveal_child: visible,
    transition_duration: duration,
    transition_type: edgeTransition,
    css_classes: ["edge-reveal"],
  })

  edgeRevealer.set_child(child)

  const revealer = new Gtk.Revealer({
    reveal_child: visible,
    transition_duration: duration,
    transition_type: collapseTransition,
    css_classes: [
      "collapse-reveal",
      ...className.split(" ").filter(Boolean),
    ],
  })

  revealer.set_child(edgeRevealer)

  function clearCollapseTimer() {
    if (collapseTimer === 0) {
      return
    }

    cancelSource(collapseTimer)
    collapseTimer = 0
  }

  function clearEdgeTimer() {
    if (edgeTimer === 0) {
      return
    }

    cancelSource(edgeTimer)
    edgeTimer = 0
  }

  function show() {
    if (currentVisible) {
      return
    }

    currentVisible = true
    clearCollapseTimer()
    clearEdgeTimer()

    // Allocate the vertical wrapper instantly and animate only from the bar edge.
    // This keeps modules from visually dropping down from the item above them.
    revealer.set_transition_type(Gtk.RevealerTransitionType.NONE)
    edgeRevealer.set_reveal_child(false)
    revealer.set_reveal_child(true)

    edgeTimer = timeout(GLib.PRIORITY_DEFAULT, 16, () => {
      edgeTimer = 0
      revealer.set_transition_type(collapseTransition)
      edgeRevealer.set_transition_type(edgeTransition)
      edgeRevealer.set_reveal_child(true)
      return GLib.SOURCE_REMOVE
    })
  }

  function hide() {
    if (!currentVisible) {
      return
    }

    currentVisible = false
    clearCollapseTimer()
    clearEdgeTimer()

    revealer.set_transition_type(collapseTransition)
    edgeRevealer.set_transition_type(edgeTransition)
    edgeRevealer.set_reveal_child(false)

    collapseTimer = timeout(GLib.PRIORITY_DEFAULT, duration, () => {
      revealer.set_reveal_child(false)
      collapseTimer = 0

      return GLib.SOURCE_REMOVE
    })
  }

  return {
    revealer,
    show,
    hide,

    setVisible(value: boolean) {
      if (value) {
        show()
      } else {
        hide()
      }
    },
  }
}