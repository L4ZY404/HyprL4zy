import { timeout } from "../../lib/lifecycle"
import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

import { actionHint, actionSectionTitle, createActionMenu } from "../../lib/ui/ActionMenu"
import { createInfoPopover } from "../../lib/ui/Popover"

function formatTime() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

export default function Clock() {
  const label = new Gtk.Label({ label: formatTime(), css_classes: ["clock-label"] })
  const wrapper = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, css_classes: ["clock-wrapper"] })
  wrapper.append(label)

  // Keep the original date/time hover card untouched.
  const popover = createInfoPopover(wrapper, {
    icon: "󰃭",
    title: "Date and time",
    value: formatTime(),
    detail: formatDate(),
    className: "clock-popover-card",
  })

  const actionBody = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  actionBody.append(actionSectionTitle("Calendar"))
  const calendar = new Gtk.Calendar({
    css_classes: ["module-action-calendar"],
    show_day_names: true,
    show_heading: true,
  })
  actionBody.append(calendar)
  actionBody.append(actionHint("Use hover for a quick date. Click the clock when you need the calendar."))

  const actionMenu = createActionMenu(wrapper, {
    icon: "󰃭",
    title: "Calendar",
    subtitle: formatDate(),
    content: actionBody,
    className: "clock-action-menu",
  })

  timeout(GLib.PRIORITY_DEFAULT, 1000, () => {
    const time = formatTime()
    label.set_label(time)
    popover.valueLabel.set_label(time)
    const date = formatDate()
    popover.detailLabel.set_label(date)
    actionMenu.subtitleLabel.set_label(date)
    return GLib.SOURCE_CONTINUE
  })

  return wrapper
}
