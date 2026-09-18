import { onCleanup } from "../../lib/lifecycle"
import { CONFIG_HOME } from "../../lib/paths"
import { Gtk } from "ags/gtk4"
import { replaceCssClass } from "../../lib/gtk"
import { shellQuote, spawn, commandExists } from "../../lib/shell"
import { createActionsSection } from "../../lib/ui/Actions"
import {
  actionButton,
  actionButtonRow,
  actionHint,
  actionSectionTitle,
  createActionMenu,
} from "../../lib/ui/ActionMenu"
import { createInfoPopover } from "../../lib/ui/Popover"
import {
  getOfficialBackendLabel,
  getUpdateHelperLabel,
  readUpdatesState,
  refreshUpdates,
  startUpdatesAutoRefresh,
  subscribeUpdates,
  type UpdatesState,
} from "../../services/updates"

const UPDATE_SCRIPT = `${CONFIG_HOME}/ags/scripts/update_system.sh`
const STATE_CLASSES = ["updates-green", "updates-yellow", "updates-red", "updates-checking", "updates-error"]

function openUpdater() {
  const command = `bash ${shellQuote(UPDATE_SCRIPT)}`
  if (commandExists("kitty")) return spawn(`kitty --title "System Update" -e bash -lc ${shellQuote(command)}`)
  if (commandExists("foot")) return spawn(`foot -T "System Update" bash -lc ${shellQuote(command)}`)
  if (commandExists("alacritty")) return spawn(`alacritty --title "System Update" -e bash -lc ${shellQuote(command)}`)
  if (commandExists("wezterm")) return spawn(`wezterm start -- bash -lc ${shellQuote(command)}`)
  spawn(`notify-send "HyprLazy Updates" "No supported terminal was found"`)
}

function shouldShowUpdates(state: UpdatesState) {
  return state.total > 0 || state.status === "error"
}

function getBarCountLabel(state: UpdatesState) {
  if (state.status === "checking") return "…"
  if (state.status === "error") return "!"
  return `${state.total}`
}

function getPopoverValue(state: UpdatesState) {
  if (state.status === "checking") return "Checking..."
  if (state.status === "error") return "Check failed"
  if (state.total === 0) return "System is up to date"
  return `${state.total} available`
}

function getPopoverDetail(state: UpdatesState) {
  if (state.status === "error") return state.error || "Unable to check updates"
  if (state.status === "checking") return `Last checked: ${state.lastCheckedLabel}`
  if (state.officialWarning && state.aurWarning) return `Official: ${state.official} | Cached source | AUR unavailable`
  if (state.officialWarning) return `Official: ${state.official} | Cached repository data`
  if (state.aurWarning) return `Official: ${state.official} | AUR check unavailable`
  return `Official: ${state.official} | AUR: ${state.aur}`
}

function createInfoRow(label: string, value = "—") {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["updates-popover-row"],
    spacing: 8,
  })
  const labelWidget = new Gtk.Label({
    label,
    css_classes: ["updates-popover-row-label"],
    halign: Gtk.Align.START,
    xalign: 0,
    hexpand: true,
  })
  const valueWidget = new Gtk.Label({
    label: value,
    css_classes: ["updates-popover-row-value"],
    halign: Gtk.Align.END,
    xalign: 1,
  })
  row.append(labelWidget)
  row.append(valueWidget)
  return { row, valueWidget }
}

function clearBox(box: Gtk.Box) {
  let child = box.get_first_child()
  while (child) {
    const next = child.get_next_sibling()
    box.remove(child)
    child = next
  }
}

function packageLabel(line: string, source: string) {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["update-package-row"],
    spacing: 8,
  })
  row.append(new Gtk.Label({ label: source, css_classes: ["update-package-source"] }))
  row.append(new Gtk.Label({
    label: line,
    css_classes: ["update-package-name"],
    halign: Gtk.Align.START,
    xalign: 0,
    hexpand: true,
    max_width_chars: 42,
  }))
  return row
}

type UpdatesProps = { island?: boolean }

export default function Updates({ island = true }: UpdatesProps = {}) {
  let state = readUpdatesState()
  let refreshing = false

  const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: island ? ["island", "updates-island", "updates-green"] : ["updates-module", "updates-green"],
    spacing: 6,
    halign: island ? Gtk.Align.FILL : Gtk.Align.START,
    hexpand: island,
  })

  const buttonBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["updates-button"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })
  const content = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["updates-content"],
    spacing: 0,
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })
  const iconLabel = new Gtk.Label({ label: "󰚰", css_classes: ["updates-icon"], halign: Gtk.Align.CENTER, xalign: 0.5 })
  const countLabel = new Gtk.Label({ label: "0", css_classes: ["updates-count"], halign: Gtk.Align.CENTER, xalign: 0.5 })
  content.append(iconLabel)
  content.append(countLabel)
  buttonBox.append(content)
  wrapper.append(buttonBox)
  wrapper.set_visible(false)

  // Hover keeps the original compact information popover exactly as before.
  const popoverRows = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["updates-popover-grid"],
    spacing: 3,
  })
  const officialRow = createInfoRow("Official")
  const aurRow = createInfoRow("AUR")
  const helperRow = createInfoRow("Helper")
  const checkedRow = createInfoRow("Last checked")
  for (const item of [officialRow, aurRow, helperRow, checkedRow]) popoverRows.append(item.row)
  popoverRows.append(createActionsSection([
    { label: "Left click", value: "Open actions" },
    { label: "Right click", value: "Refresh now" },
    { label: "Middle click", value: "Refresh now" },
  ]))

  const popover = createInfoPopover(wrapper, {
    icon: "󰚰",
    title: "System Updates",
    value: "System is up to date",
    detail: "Official: 0 | AUR: 0",
    extra: popoverRows,
    className: "updates-popover-card",
  })

  // Click opens a separate actions surface with the complete package breakdown.
  const actionContent = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  const actionSource = actionHint("Official source: checking…")
  const actionHelper = actionHint("AUR helper: checking…")
  const actionChecked = actionHint("Last checked: Never")
  actionContent.append(actionSource)
  actionContent.append(actionHelper)
  actionContent.append(actionChecked)
  actionContent.append(actionSectionTitle("Package breakdown"))

  const packages = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["update-package-list"],
    spacing: 3,
  })
  const packageScroll = new Gtk.ScrolledWindow({
    css_classes: ["update-package-scroll"],
    hscrollbar_policy: Gtk.PolicyType.NEVER,
    vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
    propagate_natural_height: true,
    propagate_natural_width: true,
  })
  packageScroll.set_max_content_height(260)
  packageScroll.set_child(packages)
  actionContent.append(packageScroll)
  const packageHint = actionHint("Open the menu to inspect pending packages.")
  actionContent.append(packageHint)
  actionContent.append(actionButtonRow([
    actionButton("Update system", openUpdater),
    actionButton("Refresh", () => void refresh(true)),
  ]))

  const actionMenu = createActionMenu(wrapper, {
    icon: "󰚰",
    title: "Update actions",
    subtitle: "Packages and maintenance",
    content: actionContent,
    className: "updates-action-card",
    onOpen: () => void refresh(),
  })

  function updatePackageList() {
    clearBox(packages)
    for (const line of state.officialPackages.slice(0, 12)) packages.append(packageLabel(line, "Repo"))
    for (const line of state.aurPackages.slice(0, 12)) packages.append(packageLabel(line, "AUR"))

    const shown = Math.min(12, state.officialPackages.length) + Math.min(12, state.aurPackages.length)
    const hidden = Math.max(0, state.total - shown)
    const sourceWarning = state.officialWarning
      ? "Using pacman's current sync cache; a normal full upgrade will refresh package databases."
      : ""
    const aurWarning = state.aurWarning ? "AUR check is temporarily unavailable." : ""
    const warning = [sourceWarning, aurWarning].filter(Boolean).join(" ")
    const summary = state.total === 0
      ? "No pending packages from available sources."
      : hidden > 0
        ? `${shown} shown • ${hidden} more pending.`
        : `${state.total} package${state.total === 1 ? "" : "s"} pending.`

    packageHint.set_label(
      state.status === "error"
        ? state.error || "Update check failed."
        : warning
          ? `${summary} ${warning}`
          : summary,
    )
  }

  function updateUi() {
    countLabel.set_label(getBarCountLabel(state))
    popover.valueLabel.set_label(getPopoverValue(state))
    popover.detailLabel.set_label(getPopoverDetail(state))
    officialRow.valueWidget.set_label(`${state.official}`)
    aurRow.valueWidget.set_label(state.aurWarning ? "Unavailable" : `${state.aur}`)
    helperRow.valueWidget.set_label(getUpdateHelperLabel(state.helper))
    checkedRow.valueWidget.set_label(state.lastCheckedLabel)

    actionSource.set_label(
      `Official source: ${getOfficialBackendLabel(state.officialBackend)}${state.officialWarning ? " • fallback" : ""}`,
    )
    actionHelper.set_label(
      `AUR helper: ${getUpdateHelperLabel(state.helper)}${state.aurWarning ? " • unavailable" : ""}`,
    )
    actionChecked.set_label(`Last checked: ${state.lastCheckedLabel}`)
    actionMenu.subtitleLabel.set_label(
      state.status === "checking"
        ? "Checking package sources…"
        : state.status === "error"
          ? "Update check failed"
          : `${state.total} pending package${state.total === 1 ? "" : "s"}`,
    )
    actionMenu.subtitleLabel.set_visible(true)
    updatePackageList()

    replaceCssClass(wrapper, STATE_CLASSES, `updates-${state.severity}`)
    wrapper.set_visible(shouldShowUpdates(state))
  }

  onCleanup(subscribeUpdates((nextState) => {
    state = nextState
    updateUi()
  }))
  startUpdatesAutoRefresh()

  async function refresh(force = false) {
    if (refreshing && !force) return
    refreshing = true
    try {
      state = await refreshUpdates(force)
      updateUi()
    } finally {
      refreshing = false
    }
  }

  const click = new Gtk.GestureClick()
  click.set_button(0)
  click.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
  click.connect("pressed", (gesture) => {
    const mouseButton = gesture.get_current_button()
    if (mouseButton === 2 || mouseButton === 3) void refresh(true)
  })
  wrapper.add_controller(click)

  updateUi()
  return wrapper
}
