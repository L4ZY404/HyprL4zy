import { Gtk } from "ags/gtk4"
import { onCleanup } from "../../lib/lifecycle"
import {
  applyRandomWallpaper,
  applyWallpaper,
  getWallpaperEntryKindLabel,
  openWallpapersFolder,
  readWallpaperEntries,
  type WallpaperEntry,
} from "../../services/theme"
import { column, label, pill, row } from "../../lib/ui/Studio"

type CardGeometry = {
  x: number
  y: number
  width: number
  height: number
  opacity: number
}

type CarouselCard = CardGeometry & {
  entry: WallpaperEntry
  button: Gtk.Button
  picture: Gtk.Picture
  pictureLoaded: boolean
}

type ThemeCarouselProps = {
  width: number
  height: number
  onStatus?: (message: string) => void
  onApplyRequest?: (entry: WallpaperEntry) => boolean | void
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function wrapIndex(index: number, size: number) {
  if (size <= 0) return 0
  return ((index % size) + size) % size
}

function circularOffset(selected: number, index: number, total: number) {
  if (total <= 1) return 0
  let diff = index - selected
  const half = total / 2
  while (diff > half) diff -= total
  while (diff < -half) diff += total
  return diff
}

function easeOutCubic(value: number) {
  const t = clamp(value, 0, 1)
  return 1 - Math.pow(1 - t, 3)
}

export default function ThemeCarousel(props: ThemeCarouselProps) {
  const compact = props.width < 1100
  const stageWidth = Math.max(620, Math.round(props.width - (compact ? 48 : 64)))
  const activeWidth = clamp(Math.round(stageWidth * (compact ? 0.38 : 0.32)), compact ? 330 : 460, compact ? 500 : 660)
  const activeHeight = Math.round(activeWidth * 9 / 16)
  // Keep the carousel stage close to the artwork height. The previous proportional
  // height left a large empty band and let Gtk.Fixed influence the window request while
  // cards were resizing during scroll animations.
  const stageHeight = clamp(activeHeight + (compact ? 18 : 22), compact ? 225 : 270, compact ? 300 : 370)
  const sideWidth = Math.round(activeWidth * 0.38)
  const sideHeight = Math.round(activeHeight * 0.88)
  const secondWidth = Math.round(sideWidth * 0.86)
  const secondHeight = Math.round(sideHeight * 0.92)
  const farWidth = Math.round(sideWidth * 0.68)
  const farHeight = Math.round(sideHeight * 0.84)
  const gap = compact ? 14 : 20
  const shellWidth = stageWidth + 12
  const shellHeight = stageHeight + (compact ? 66 : 72)

  const root = column("theme-carousel", 6)
  root.set_hexpand(false)
  root.set_vexpand(false)
  root.set_halign(Gtk.Align.CENTER)
  root.set_valign(Gtk.Align.START)
  root.set_size_request(shellWidth, shellHeight)

  const top = row("theme-carousel-toolbar", 8)
  top.set_hexpand(true)
  const selectionCopy = column("theme-carousel-selection", 2)
  selectionCopy.set_hexpand(true)
  const selectionName = label("Loading wallpapers…", "theme-carousel-selected-name")
  const selectionMeta = label("", "theme-carousel-selected-meta")
  selectionCopy.append(selectionName)
  selectionCopy.append(selectionMeta)
  top.append(selectionCopy)

  const actions = row("theme-carousel-actions", 7)
  const random = pill("󰒟  Random", () => {
    props.onStatus?.("Selecting a random wallpaper…")
    applyRandomWallpaper()
  }, "theme-carousel-action")
  const folder = pill("  Folder", () => openWallpapersFolder(), "theme-carousel-action")
  const refresh = pill("󰑓  Refresh", () => void load(true), "theme-carousel-action")
  actions.append(random)
  actions.append(folder)
  actions.append(refresh)
  top.append(actions)
  root.append(top)

  // The animated cards live in a Gtk.Fixed overlay that is explicitly excluded from
  // Gtk.Overlay measurement. A fixed-size base child is the only widget that contributes
  // to natural size, so changing card width/position during scroll cannot resize Theme.
  const viewportShell = new Gtk.Overlay({
    css_classes: ["theme-carousel-viewport-shell", "theme-carousel-fixed-viewport"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    hexpand: false,
    vexpand: false,
  })
  viewportShell.set_size_request(stageWidth, stageHeight)

  const viewportBase = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["theme-carousel-viewport-base"],
    hexpand: false,
    vexpand: false,
  })
  viewportBase.set_size_request(stageWidth, stageHeight)
  viewportShell.set_child(viewportBase)

  const stage = new Gtk.Fixed({ css_classes: ["theme-carousel-stage"] })
  stage.set_size_request(stageWidth, stageHeight)
  ;(stage as any).set_overflow?.((Gtk as any).Overflow?.HIDDEN ?? 1)
  viewportShell.add_overlay(stage)
  ;(viewportShell as any).set_measure_overlay?.(stage, false)
  ;(viewportShell as any).set_clip_overlay?.(stage, true)
  root.append(viewportShell)

  const footer = row("theme-carousel-footer", 10)
  footer.set_hexpand(true)
  const hint = label("← / →  Browse     Enter  Apply     Wheel  Browse", "theme-carousel-hint")
  hint.set_hexpand(true)
  footer.append(hint)
  const counter = label("0 / 0", "theme-carousel-counter")
  footer.append(counter)
  root.append(footer)

  let entries: WallpaperEntry[] = []
  let cards: CarouselCard[] = []
  let selected = 0
  let animationTick = 0
  let loadGeneration = 0
  let disposed = false
  let loaded = false
  let applyPath = ""
  let applyGuardUntil = 0
  let lastWheelAt = 0

  function sizeForDistance(distance: number) {
    if (distance === 0) return { width: activeWidth, height: activeHeight, opacity: 1 }
    if (distance === 1) return { width: sideWidth, height: sideHeight, opacity: 0.66 }
    if (distance === 2) return { width: secondWidth, height: secondHeight, opacity: 0.38 }
    if (distance === 3) return { width: farWidth, height: farHeight, opacity: 0.18 }
    return { width: farWidth, height: farHeight, opacity: 0 }
  }

  function layoutTargets(): CardGeometry[] {
    const targets = entries.map((_entry, index) => {
      const offset = circularOffset(selected, index, entries.length)
      const size = sizeForDistance(Math.abs(offset))
      return { x: 0, y: Math.round((stageHeight - size.height) / 2), ...size }
    })

    if (!targets[selected]) return targets

    const center = targets[selected]
    center.x = Math.round((stageWidth - center.width) / 2)

    const leftIndices = entries
      .map((_entry, index) => ({ index, offset: circularOffset(selected, index, entries.length) }))
      .filter(item => item.offset < 0)
      .sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset))

    let cursor = center.x - gap
    for (const item of leftIndices) {
      cursor -= targets[item.index].width
      targets[item.index].x = cursor
      cursor -= gap
    }

    const rightIndices = entries
      .map((_entry, index) => ({ index, offset: circularOffset(selected, index, entries.length) }))
      .filter(item => item.offset > 0)
      .sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset))

    cursor = center.x + center.width + gap
    for (const item of rightIndices) {
      targets[item.index].x = cursor
      cursor += targets[item.index].width + gap
    }

    return targets
  }

  function updateSelectionText() {
    const entry = entries[selected]
    if (!entry) {
      selectionName.set_label("No wallpapers found")
      selectionMeta.set_label("Check your wallpaper folder")
      counter.set_label("0 / 0")
      return
    }

    selectionName.set_label(entry.fileName)
    selectionMeta.set_label(`${getWallpaperEntryKindLabel(entry)}${entry.isCurrent ? " · Current wallpaper" : " · Enter or click the center card to apply"}`)
    counter.set_label(`${selected + 1} / ${entries.length}`)
  }

  function updateCardClasses() {
    cards.forEach((card, index) => {
      const distance = Math.abs(circularOffset(selected, index, entries.length))
      card.button.set_css_classes([
        "theme-carousel-card",
        ...(index === selected ? ["active"] : []),
        ...(distance === 1 ? ["near"] : []),
        ...(distance >= 2 ? ["far"] : []),
        ...(card.entry.isCurrent ? ["current"] : []),
      ])
    })
  }

  function applyGeometry(card: CarouselCard, geometry: CardGeometry) {
    // Avoid redundant layout invalidation; off-screen cards never enter the frame loop.
    if (card.width !== geometry.width || card.height !== geometry.height) {
      card.button.set_size_request(Math.max(1, geometry.width), Math.max(1, geometry.height))
    }
    if (card.opacity !== geometry.opacity) card.button.set_opacity(geometry.opacity)
    if (card.x !== geometry.x || card.y !== geometry.y) stage.move(card.button, geometry.x, geometry.y)
    Object.assign(card, geometry)
  }

  function setCardVisible(card: CarouselCard, visible: boolean) {
    if (visible && !card.pictureLoaded) {
      const path = card.entry.thumbnailPath || (card.entry.kind === "image" ? card.entry.path : "")
      if (path) card.picture.set_filename(path)
      card.pictureLoaded = true
    } else if (!visible && card.pictureLoaded) {
      card.picture.set_paintable(null)
      card.pictureLoaded = false
    }
    card.button.set_visible(visible)
  }

  function stopAnimation() {
    if (animationTick) root.remove_tick_callback(animationTick)
    animationTick = 0
  }

  function settleSelection() {
    stopAnimation()
    const targets = layoutTargets()
    cards.forEach((card, index) => {
      applyGeometry(card, targets[index])
      setCardVisible(card, targets[index].opacity > 0.01)
    })
  }

  function animateSelection() {
    stopAnimation()
    const targets = layoutTargets()
    updateCardClasses()
    updateSelectionText()
    if (!root.get_mapped()) { settleSelection(); return }

    const moving = cards.flatMap((card, index) => {
      const to = targets[index]
      if (card.opacity <= 0.01 && to.opacity <= 0.01) {
        applyGeometry(card, to)
        setCardVisible(card, false)
        return []
      }
      setCardVisible(card, true)
      const from = { x: card.x, y: card.y, width: card.width, height: card.height, opacity: card.opacity }
      return [{ card, from, to }]
    })
    let start: number | null = null
    const duration = 240
    animationTick = root.add_tick_callback((_widget, clock) => {
      if (disposed) { animationTick = 0; return false }
      const now = clock.get_frame_time() / 1000
      if (start === null) start = now
      const elapsed = clamp((now - start) / duration, 0, 1)
      const progress = easeOutCubic(elapsed)
      for (const { card, from, to } of moving) {
        applyGeometry(card, {
          x: Math.round(from.x + (to.x - from.x) * progress),
          y: Math.round(from.y + (to.y - from.y) * progress),
          width: Math.round(from.width + (to.width - from.width) * progress),
          height: Math.round(from.height + (to.height - from.height) * progress),
          opacity: from.opacity + (to.opacity - from.opacity) * progress,
        })
      }
      if (elapsed < 1) return true
      animationTick = 0
      for (const { card, to } of moving) setCardVisible(card, to.opacity > 0.01)
      return false
    })
  }

  function select(index: number, animate = true) {
    if (!entries.length) return
    const next = wrapIndex(index, entries.length)
    if (next === selected && loaded) return
    selected = next

    if (animate) {
      animateSelection()
      return
    }

    updateCardClasses()
    updateSelectionText()
    settleSelection()
  }

  function applySelected() {
    const entry = entries[selected]
    if (!entry) return
    const now = Date.now()
    if (entry.path === applyPath && now < applyGuardUntil) return
    applyPath = entry.path
    applyGuardUntil = now + 1800
    props.onStatus?.(`Applying ${entry.fileName}…`)
    const started = typeof props.onApplyRequest === "function"
      ? props.onApplyRequest(entry) !== false
      : applyWallpaper(entry.path)
    if (!started) props.onStatus?.("Wallpaper change already in progress")
  }

  function makeCard(entry: WallpaperEntry, index: number) {
    const button = new Gtk.Button({ css_classes: ["theme-carousel-card"], focusable: false })
    button.set_halign(Gtk.Align.START)
    button.set_valign(Gtk.Align.START)

    const frame = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      css_classes: ["theme-carousel-picture-frame"],
      hexpand: true,
      vexpand: true,
    })
    const picture = new Gtk.Picture({
      css_classes: ["theme-carousel-picture"],
      hexpand: true,
      vexpand: true,
      halign: Gtk.Align.FILL,
      valign: Gtk.Align.FILL,
    })
    ;(picture as any).set_content_fit?.((Gtk as any).ContentFit?.COVER ?? 2)
    // Decode only the visible neighborhood, not the entire wallpaper collection.
    button.set_size_request(farWidth, farHeight)
    button.set_opacity(0)
    button.set_visible(false)
    frame.append(picture)
    button.set_child(frame)

    button.connect("clicked", () => {
      if (selected !== index) {
        select(index)
        return
      }
      applySelected()
    })

    return {
      entry,
      button,
      picture,
      pictureLoaded: false,
      x: Math.round(stageWidth / 2),
      y: Math.round(stageHeight / 2),
      width: farWidth,
      height: farHeight,
      opacity: 0,
    } satisfies CarouselCard
  }

  function rebuild(nextEntries: WallpaperEntry[]) {
    stopAnimation()
    cards.forEach(card => card.picture.set_paintable(null))
    let child = stage.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      ;(stage as any).remove(child)
      child = next
    }

    entries = nextEntries
    cards = []

    entries.forEach((entry, index) => {
      const card = makeCard(entry, index)
      cards.push(card)
      ;(stage as any).put(card.button, card.x, card.y)
    })

    const current = entries.findIndex(entry => entry.isCurrent)
    selected = current >= 0 ? current : Math.min(Math.floor(entries.length / 2), Math.max(0, entries.length - 1))
    loaded = false
    select(selected, false)
    loaded = true
  }

  async function load(force = false) {
    const generation = ++loadGeneration
    props.onStatus?.(force ? "Refreshing wallpapers…" : "Loading wallpapers…")
    try {
      const next = await readWallpaperEntries(force)
      if (disposed || generation !== loadGeneration) return
      rebuild(next)
      props.onStatus?.(next.length ? "" : "No wallpapers found in the configured folder")
    } catch (error) {
      if (!disposed && generation === loadGeneration) props.onStatus?.("Unable to load wallpapers")
      console.error("Wallpaper carousel:", error)
    }
  }

  root.connect("unmap", () => { if (!disposed) settleSelection() })
  onCleanup(() => {
    disposed = true
    loadGeneration++
    stopAnimation()
    cards.forEach(card => card.picture.set_paintable(null))
  })

  const wheel = new Gtk.EventControllerScroll({
    flags: Gtk.EventControllerScrollFlags.VERTICAL | Gtk.EventControllerScrollFlags.HORIZONTAL,
  })
  wheel.connect("scroll", (_controller, dx, dy) => {
    if (!entries.length) return false
    const now = Date.now()
    if (now - lastWheelAt < 115) return true
    const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy
    if (Math.abs(delta) < 0.15) return true
    lastWheelAt = now
    if (delta > 0) select(selected + 1)
    else select(selected - 1)
    return true
  })
  viewportShell.add_controller(wheel)

  ;(root as any).themeCarouselSelectPrevious = () => select(selected - 1)
  ;(root as any).themeCarouselSelectNext = () => select(selected + 1)
  ;(root as any).themeCarouselApply = applySelected
  ;(root as any).themeCarouselReload = () => void load(true)

  void load(false)
  return root
}
