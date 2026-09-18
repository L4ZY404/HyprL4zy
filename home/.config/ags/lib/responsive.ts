export type StudioResponsiveOptions = {
  widthRatio?: number
  heightRatio?: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  marginRatio?: number
  minMargin?: number
  maxMargin?: number
}

export type StudioGeometry = {
  width: number
  height: number
  fontScale: number
  sizeClass: "compact" | "standard" | "wide"
  short: boolean
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Calculate a Studio surface in GDK logical pixels.
 *
 * Gdk.Monitor geometry is already expressed in logical coordinates, so HiDPI
 * scale factors must not be multiplied into the requested GTK size. This keeps
 * the physical footprint consistent on 1x/1.25x/2x displays.
 */
export function computeStudioGeometry(
  boundsWidth: number,
  boundsHeight: number,
  referenceWidth: number,
  referenceHeight: number,
  barScaleRatio = 1,
  options: StudioResponsiveOptions = {},
): StudioGeometry {
  const safeWidth = Math.max(480, Number.isFinite(boundsWidth) ? boundsWidth : 1280)
  const safeHeight = Math.max(420, Number.isFinite(boundsHeight) ? boundsHeight : 800)
  const marginRatio = clamp(options.marginRatio ?? 0.035, 0.015, 0.12)
  const minMargin = Math.max(12, options.minMargin ?? 24)
  const maxMargin = Math.max(minMargin, options.maxMargin ?? 72)
  const marginX = clamp(Math.round(safeWidth * marginRatio), minMargin, maxMargin)
  const marginY = clamp(Math.round(safeHeight * marginRatio), minMargin, maxMargin)
  const availableWidth = Math.max(360, safeWidth - marginX * 2)
  const availableHeight = Math.max(320, safeHeight - marginY * 2)

  const minWidth = Math.min(availableWidth, Math.max(360, options.minWidth ?? Math.round(referenceWidth * 0.62)))
  const minHeight = Math.min(availableHeight, Math.max(320, options.minHeight ?? Math.round(referenceHeight * 0.62)))
  const maxWidth = Math.min(availableWidth, Math.max(minWidth, options.maxWidth ?? Math.round(referenceWidth * 1.12)))
  const maxHeight = Math.min(availableHeight, Math.max(minHeight, options.maxHeight ?? Math.round(referenceHeight * 1.12)))

  const scale = clamp(Number.isFinite(barScaleRatio) ? barScaleRatio : 1, 0.72, 1.6)
  const preferredWidth = options.widthRatio
    ? safeWidth * clamp(options.widthRatio, 0.25, 0.96)
    : referenceWidth * clamp(scale, 0.86, 1.22)
  const preferredHeight = options.heightRatio
    ? safeHeight * clamp(options.heightRatio, 0.3, 0.96)
    : referenceHeight * clamp(scale, 0.86, 1.18)

  const width = Math.round(clamp(preferredWidth, minWidth, maxWidth))
  const height = Math.round(clamp(preferredHeight, minHeight, maxHeight))

  // Typography follows the actual space available, but with conservative caps
  // so a tiny laptop stays readable and a 4K desktop never becomes comically large.
  const widthScale = width / Math.max(1, referenceWidth)
  const heightScale = height / Math.max(1, referenceHeight)
  const layoutScale = Math.sqrt(widthScale * heightScale)
  const fontScale = Number(clamp(layoutScale * 0.82 + scale * 0.18, 0.84, 1.16).toFixed(3))
  const sizeClass = width < 720 ? "compact" : width >= 1240 ? "wide" : "standard"

  return { width, height, fontScale, sizeClass, short: height < 660 }
}
