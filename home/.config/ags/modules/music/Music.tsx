import { attachPopoverPaper } from "../../lib/ui/AttachedPopover"
import { bindHoverPopover } from "../../lib/gtk"
import { cancelSource, onCleanup } from "../../lib/lifecycle"
import { preferences } from "../../services/preferences"
import { readBattery, refreshBattery } from "../../services/battery"
import { timeout } from "../../lib/lifecycle"
import { Gtk, Gdk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"
import Cairo from "gi://cairo?version=1.0"
import Pango from "gi://Pango?version=1.0"
import GdkPixbuf from "gi://GdkPixbuf?version=2.0"

import { setCairoColor } from "../../lib/math"
import { createActionsSection } from "../../lib/ui/Actions"
import {
  actionButton,
  actionButtonRow,
  actionHint,
  actionSectionTitle,
  createActionMenu,
} from "../../lib/ui/ActionMenu"
import { FALLBACK_UI, type UiScale } from "../../theme"
import { createAudioStudioPanel } from "./AudioStudioPanel"
import { ensureCavaRunning, readCavaValues, setVisualizerActive } from "../../services/cava"

import {
  getMusicClass,
  getStatusIcon,
  getStatusText,
  nextTrack,
  previousTrack,
  readPlayer,
  refreshPlayerCache,
  togglePlayPause,
  type PlayerState,
} from "../../services/music"

const COVER_SIZE_BASE = 128

type MusicProps = {
  ui?: UiScale
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function roundedRect(
  cr: Cairo.Context,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2)

  cr.newSubPath()
  cr.arc(x + width - r, y + r, r, -Math.PI / 2, 0)
  cr.arc(x + width - r, y + height - r, r, 0, Math.PI / 2)
  cr.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI)
  cr.arc(x + r, y + r, r, Math.PI, (3 * Math.PI) / 2)
  cr.closePath()
}

function drawVisualizer(
  cr: Cairo.Context,
  width: number,
  height: number,
  values: number[],
  player: PlayerState,
  ui: UiScale,
) {
  const paddingX = Math.max(3, Math.round(4 * ui.factor))
  const paddingY = Math.max(3, Math.round(4 * ui.factor))
  const gap = Math.max(2, Math.round(3 * ui.factor))

  const availableWidth = width - paddingX * 2
  const availableHeight = height - paddingY * 2

  const barWidth = Math.max(
    3,
    Math.floor((availableWidth - gap * (values.length - 1)) / values.length),
  )

  const color =
    player.status === "Playing"
      ? ui.colors.fg
      : player.status === "Paused"
        ? ui.colors.warning
        : ui.colors.muted

  const baseAlpha =
    player.status === "Playing"
      ? 0.78
      : player.status === "Paused"
        ? 0.52
        : 0.28

  for (let index = 0; index < values.length; index += 1) {
    const value = clamp01(values[index] ?? 0)
    const minHeight = Math.max(3, Math.round(4 * ui.factor))
    const barHeight = Math.max(minHeight, Math.round(availableHeight * value))

    const x = paddingX + index * (barWidth + gap)
    const y = paddingY + availableHeight - barHeight
    const radius = Math.max(2, Math.round(barWidth / 2))

    // Keep Cava on the rice accent family instead of introducing GTK theme colors.
    roundedRect(cr, x, y, barWidth, barHeight, radius)
    setCairoColor(cr, color, Math.min(1, baseAlpha + value * 0.22))
    cr.fill()

    if (player.status === "Playing" && barHeight > minHeight + 1) {
      const capHeight = Math.max(1, Math.round(1.35 * ui.factor))
      roundedRect(cr, x, y, barWidth, Math.min(capHeight, barHeight), radius)
      setCairoColor(cr, color, 1)
      cr.fill()
    }
  }
}

function setPlayerClass(wrapper: Gtk.Widget, player: PlayerState) {
  wrapper.remove_css_class("playing")
  wrapper.remove_css_class("paused")
  wrapper.remove_css_class("stopped")

  wrapper.add_css_class(getMusicClass(player))
}

export default function Music({ ui = FALLBACK_UI }: MusicProps) {

  ensureCavaRunning()

  let player = readPlayer()
  let cavaValues = readCavaValues()
  let displayedCavaValues = [...cavaValues]

  let coverPixbuf: GdkPixbuf.Pixbuf | null = null
  let currentCoverPath = ""

  const visualizerWidth = ui.musicWidth
  const visualizerHeight = ui.musicHeight
  const coverSize = Math.round(COVER_SIZE_BASE * ui.factor)

  const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["music-module", getMusicClass(player)],
  })

  const buttonBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["music-button"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })

  const area = new Gtk.DrawingArea({
    css_classes: ["music-visualizer"],
  })

  area.set_content_width(visualizerWidth)
  area.set_content_height(visualizerHeight)
  area.set_size_request(visualizerWidth, visualizerHeight)

  area.set_draw_func((_area, cr: Cairo.Context, width: number, height: number) => {
    cr.setLineCap(Cairo.LineCap.ROUND)
    drawVisualizer(cr, width, height, displayedCavaValues, player, ui)
  })

  buttonBox.append(area)
  wrapper.append(buttonBox)

  const coverImage = new Gtk.DrawingArea({
    css_classes: ["music-cover-art"],
  })

  coverImage.set_content_width(coverSize)
  coverImage.set_content_height(coverSize)
  coverImage.set_size_request(coverSize, coverSize)

  coverImage.set_draw_func((_area, cr: Cairo.Context, width: number, height: number) => {
    if (!coverPixbuf) {
      return
    }

    const sourceWidth = coverPixbuf.get_width()
    const sourceHeight = coverPixbuf.get_height()

    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return
    }

    const scale = Math.max(width / sourceWidth, height / sourceHeight)

    const drawWidth = sourceWidth * scale
    const drawHeight = sourceHeight * scale

    const x = Math.round((width - drawWidth) / 2)
    const y = Math.round((height - drawHeight) / 2)

    cr.save()

    roundedRect(cr, 0, 0, width, height, Math.round(8 * ui.factor))
    cr.clip()

    cr.translate(x, y)
    cr.scale(scale, scale)

    Gdk.cairo_set_source_pixbuf(cr, coverPixbuf, 0, 0)
    cr.paint()

    cr.restore()
  })

  const coverFallback = new Gtk.Label({
    label: getStatusIcon(player),
    css_classes: ["music-cover-fallback"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
    yalign: 0.5,
  })

  coverFallback.set_size_request(coverSize, coverSize)

  const coverStack = new Gtk.Stack({
    css_classes: ["music-cover-stack"],
  })

  coverStack.set_size_request(coverSize, coverSize)
  coverStack.add_named(coverImage, "art")
  coverStack.add_named(coverFallback, "fallback")

  const titleLabel = new Gtk.Label({
    label: player.title,
    css_classes: ["music-title"],
    halign: Gtk.Align.START,
    xalign: 0,
  })

  titleLabel.set_max_width_chars(28)
  titleLabel.set_ellipsize(Pango.EllipsizeMode.END)

  const artistLabel = new Gtk.Label({
    label: player.artist,
    css_classes: ["music-artist"],
    halign: Gtk.Align.START,
    xalign: 0,
  })

  artistLabel.set_max_width_chars(28)
  artistLabel.set_ellipsize(Pango.EllipsizeMode.END)

  const albumLabel = new Gtk.Label({
    label: player.album,
    css_classes: ["music-album"],
    halign: Gtk.Align.START,
    xalign: 0,
  })

  albumLabel.set_max_width_chars(28)
  albumLabel.set_ellipsize(Pango.EllipsizeMode.END)

  const playerLabel = new Gtk.Label({
    label: player.available
      ? `${player.player} • ${getStatusText(player)}`
      : getStatusText(player),
    css_classes: ["music-player"],
    halign: Gtk.Align.START,
    xalign: 0,
  })

  playerLabel.set_max_width_chars(28)
  playerLabel.set_ellipsize(Pango.EllipsizeMode.END)

  const header = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["music-popover-header"],
    spacing: 8,
  })

  const textGroup = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["music-text-group"],
    spacing: 2,
    hexpand: true,
  })

  textGroup.append(titleLabel)
  textGroup.append(artistLabel)
  textGroup.append(albumLabel)
  textGroup.append(playerLabel)

  header.append(coverStack)
  header.append(textGroup)

  const popoverContent = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["dial-popover-card", "music-popover-card"],
    spacing: 6,
  })

  popoverContent.append(header)
  popoverContent.append(
    createActionsSection([
      { label: "Left click", value: "Open actions" },
      { label: "Right click", value: "Play / pause" },
      { label: "Scroll up", value: "Next track" },
      { label: "Scroll down", value: "Previous track" },
      { label: "Middle click", value: "Refresh metadata" },
    ]),
  )

  const popover = new Gtk.Popover({
    has_arrow: false,
    autohide: false,
    position: Gtk.PositionType.RIGHT,
  })

  const { prepareOpen, cancelOpen } = attachPopoverPaper(popover, popoverContent)
  ;(popover as any).set_offset?.(0, 0)
  popover.set_parent(wrapper)

  const actionContent = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  const playbackHint = actionHint(player.available ? `${player.player} • ${getStatusText(player)}` : getStatusText(player))
  actionContent.append(playbackHint)
  actionContent.append(actionSectionTitle("Playback"))
  actionContent.append(actionButtonRow([
    actionButton("Previous", () => { previousTrack(); refreshBurst() }),
    actionButton("Play / pause", () => { togglePlayPause(); refreshBurst() }),
    actionButton("Next", () => { nextTrack(); refreshBurst() }),
  ]))

  const audioStudio = createAudioStudioPanel()
  actionContent.append(audioStudio.widget)

  const actionMenu = createActionMenu(wrapper, {
    icon: "󰝚",
    title: "Music actions",
    subtitle: player.title,
    content: actionContent,
    className: "music-action-card",
    onOpen: () => {
      void refreshPlayer(true)
      void audioStudio.refresh()
    },
  })

  function updateCover() {
    if (player.artPath) {
      try {
        if (currentCoverPath !== player.artPath) {
          coverPixbuf = GdkPixbuf.Pixbuf.new_from_file(player.artPath)
          currentCoverPath = player.artPath
        }

        coverImage.queue_draw()
        coverStack.set_visible_child_name("art")

        return
      } catch {
        coverPixbuf = null
        currentCoverPath = ""
      }
    }

    coverPixbuf = null
    currentCoverPath = ""

    coverFallback.set_label(getStatusIcon(player))
    coverStack.set_visible_child_name("fallback")
  }

  function applyPlayerState(nextPlayer: PlayerState) {
    player = nextPlayer

    titleLabel.set_label(player.title)
    artistLabel.set_label(player.artist)
    albumLabel.set_label(player.album)

    playerLabel.set_label(
      player.available
        ? `${player.player} • ${getStatusText(player)}`
        : getStatusText(player),
    )

    updateCover()
    setPlayerClass(wrapper, player)
    playbackHint.set_label(player.available ? `${player.player} • ${getStatusText(player)}` : getStatusText(player))
    actionMenu.subtitleLabel.set_label(player.title)
    actionMenu.subtitleLabel.set_visible(true)
  }

  let playerRefreshQueued = false

  async function refreshPlayer(force = false) {
    if (playerRefreshQueued) {
      return
    }

    playerRefreshQueued = true

    try {
      applyPlayerState(await refreshPlayerCache(force))
    } finally {
      playerRefreshQueued = false
    }
  }

  function refreshVisualizer() {
    cavaValues = readCavaValues()

    let changed = false

    displayedCavaValues = cavaValues.map((value, index) => {
      const current = displayedCavaValues[index] ?? value
      const next = current + (value - current) * 0.38

      if (Math.abs(next - current) > 0.004) {
        changed = true
      }

      return next
    })

    if (changed) {
      area.queue_draw()
    }
  }

  function refreshBurst() {
    for (const delay of [350, 1200]) {
      timeout(GLib.PRIORITY_DEFAULT, delay, () => {
        void refreshPlayer(true)
        return GLib.SOURCE_REMOVE
      })
    }
  }

  const click = new Gtk.GestureClick()
  click.set_button(0)
  click.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)

  click.connect("pressed", (gesture) => {
    const mouseButton = gesture.get_current_button()

    if (mouseButton === 2) {
      void refreshPlayer(true)
      return
    }

    if (mouseButton === 3) {
      togglePlayPause()
      refreshBurst()
      return
    }

    if (mouseButton === 8) {
      previousTrack()
      refreshBurst()
      return
    }

    if (mouseButton === 9) {
      nextTrack()
      refreshBurst()
    }
  })

  wrapper.add_controller(click)

  const scroll = new Gtk.EventControllerScroll({
    flags: Gtk.EventControllerScrollFlags.VERTICAL,
  })

  scroll.connect("scroll", (_controller, _dx, dy) => {
    if (dy < 0) {
      nextTrack()
      refreshBurst()
      return true
    }

    if (dy > 0) {
      previousTrack()
      refreshBurst()
      return true
    }

    return false
  })

  wrapper.add_controller(scroll)

  bindHoverPopover(
    wrapper,
    popover,
    () => {
      void refreshPlayer(true)
      prepareOpen()
    },
    cancelOpen,
  )

  updateCover()
  void refreshPlayer(true)
  refreshVisualizer()

  const visualizerConsumer = {}
  let frameTimer = 0
  let frameInterval = 0
  function syncVisualizerTimer() {
    const playing = wrapper.get_mapped() && player.status === "Playing"
    setVisualizerActive(visualizerConsumer, playing)
    const fps = readBattery().discharging ? preferences.visualizerBatteryFps : preferences.visualizerFps
    const interval = Math.round(1000 / fps)
    if (frameTimer && (!playing || frameInterval !== interval)) {
      cancelSource(frameTimer); frameTimer = 0
    }
    if (playing && !frameTimer) {
      frameInterval = interval
      frameTimer = timeout(GLib.PRIORITY_DEFAULT, interval, () => {
        if (!wrapper.get_mapped() || player.status !== "Playing") {
          frameTimer = 0
          return GLib.SOURCE_REMOVE
        }
        refreshVisualizer()
        return GLib.SOURCE_CONTINUE
      })
    }
  }
  wrapper.connect("map", syncVisualizerTimer)
  wrapper.connect("unmap", syncVisualizerTimer)
  timeout(GLib.PRIORITY_DEFAULT, 2000, () => {
    syncVisualizerTimer()
    return GLib.SOURCE_CONTINUE
  })
  onCleanup(() => { setVisualizerActive(visualizerConsumer, false); if (frameTimer) { cancelSource(frameTimer); frameTimer = 0 } })
  timeout(GLib.PRIORITY_DEFAULT, 5000, () => {
    void refreshPlayer()
    return GLib.SOURCE_CONTINUE
  })

  timeout(GLib.PRIORITY_DEFAULT, 30000, () => {
    void refreshBattery()
    ensureCavaRunning()
    return GLib.SOURCE_CONTINUE
  })

  return wrapper
}