export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

export function round(value: number) {
  return Math.round(value)
}

export function percent(value: number, max = 100) {
  if (max <= 0) return 0
  return clamp(Math.round((value / max) * 100))
}

export function hexToRgb(hex: string) {
  const clean = hex.replace("#", "")
  const num = parseInt(clean, 16)

  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  }
}

export function setCairoColor(cr: any, hex: string, alpha = 1) {
  const { r, g, b } = hexToRgb(hex)
  cr.setSourceRGBA(r, g, b, alpha)
}
