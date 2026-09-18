import { Gtk } from "ags/gtk4"
import Cairo from "gi://cairo?version=1.0"
import Pango from "gi://Pango?version=1.0"
import PangoCairo from "gi://PangoCairo?version=1.0"

import { clamp, round, setCairoColor } from "../math"
import { FALLBACK_UI, type UiScale } from "../../theme"

type DialState = "normal" | "warning" | "critical" | "disabled"

const DIAL_ICON_RATIO = 0.38

type DialProps = {
  icon: string
  value: number
  max?: number
  active?: boolean
  warningAt?: number
  criticalAt?: number
  className?: string
  iconSize?: number
  lowIsBad?: boolean
  ui?: UiScale
}

function drawCenteredIcon(
  cr: any,
  width: number,
  height: number,
  icon: string,
  color: string,
  size: number,
) {
  const layout = PangoCairo.create_layout(cr)

  layout.set_text(icon, -1)
  layout.set_font_description(
    Pango.FontDescription.from_string(`Symbols Nerd Font ${size}`),
  )

  const [inkRect] = layout.get_extents()

  const inkX = inkRect.x / Pango.SCALE
  const inkY = inkRect.y / Pango.SCALE
  const inkW = inkRect.width / Pango.SCALE
  const inkH = inkRect.height / Pango.SCALE

  const x = Math.round((width - inkW) / 2 - inkX)
  const y = Math.round((height - inkH) / 2 - inkY)

  setCairoColor(cr, color, 1)
  cr.moveTo(x, y)
  PangoCairo.show_layout(cr, layout)
}

function getState(
  value: number,
  active: boolean,
  warningAt: number,
  criticalAt: number,
  lowIsBad: boolean,
): DialState {
  if (!active) return "disabled"

  if (lowIsBad) {
    if (value <= criticalAt) return "critical"
    if (value <= warningAt) return "warning"
    return "normal"
  }

  if (value >= criticalAt) return "critical"
  if (value >= warningAt) return "warning"

  return "normal"
}

function getIconSize(dialSize: number, iconSize?: number) {
  return iconSize ?? round(dialSize * DIAL_ICON_RATIO)
}

function getColor(state: DialState, ui: UiScale) {
  if (state === "critical") return ui.colors.critical
  if (state === "warning") return ui.colors.warning
  if (state === "disabled") return ui.colors.muted

  return ui.colors.fg
}

export default function Dial({
  icon,
  value,
  max = 100,
  active = true,
  warningAt = 70,
  criticalAt = 90,
  className = "",
  iconSize,
  lowIsBad = false,
  ui = FALLBACK_UI,
}: DialProps) {
  const dialSize = ui.dialSize
  const arcWidth = Math.max(3, ui.dialArcWidth)
  const resolvedIconSize = getIconSize(dialSize, iconSize)

  const area = new Gtk.DrawingArea({
    css_classes: ["speedometer", ...className.split(" ").filter(Boolean)],
  })

  area.set_size_request(dialSize, dialSize)
  area.set_content_width(dialSize)
  area.set_content_height(dialSize)

  area.set_draw_func((_area, cr: Cairo.Context, width: number, height: number) => {
    const currentState = getState(value, active, warningAt, criticalAt, lowIsBad)
    const color = getColor(currentState, ui)
    const percent = clamp(value / max, 0, 1)
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.min(width, height) / 2 - arcWidth / 2 - 1
    const start = -Math.PI / 2
    const end = start + Math.PI * 2 * percent

    cr.setLineWidth(arcWidth)
    cr.setLineCap(Cairo.LineCap.ROUND)

    setCairoColor(cr, ui.colors.muted, 0.35)
    cr.arc(centerX, centerY, radius, 0, Math.PI * 2)
    cr.stroke()

    if (active) {
      setCairoColor(cr, color, 1)
      cr.arc(centerX, centerY, radius, start, end)
      cr.stroke()
    }

    drawCenteredIcon(cr, width, height, icon, color, resolvedIconSize)
  })

  return area
}
