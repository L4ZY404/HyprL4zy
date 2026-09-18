import { Gtk } from "ags/gtk4"

// Only one frame callback runs per animation; reversal starts at the current value.
export function frameMotion(widget: Gtk.Widget, update: (value: number) => void, initial = 0) {
  let value = initial
  let tick = 0
  let disposed = false
  function stop() {
    if (tick) widget.remove_tick_callback(tick)
    tick = 0
  }
  function to(target: number, duration: number, done?: () => void, scaleDuration = true) {
    if (disposed) return
    stop()
    const from = value
    let start: number | null = null
    if (from === target) { update(value); done?.(); return }
    tick = widget.add_tick_callback((_widget, clock) => {
      const now = clock.get_frame_time() / 1000
      if (start === null) start = now
      const t = Math.min(1, (now - start) / Math.max(1, duration * (scaleDuration ? Math.abs(target - from) : 1)))
      // Smoothstep-like quintic motion: zero velocity at both ends keeps the
      // sheet attached to the screen edge while avoiding the abrupt launch
      // and stop of a pure ease-out curve.
      const eased = t * t * t * (t * (t * 6 - 15) + 10)
      value = from + (target - from) * eased
      update(value)
      if (t < 1) return true
      tick = 0
      done?.()
      return false
    })
  }
  return { to, stop, value: () => value, dispose: () => { disposed = true; stop() } }
}
