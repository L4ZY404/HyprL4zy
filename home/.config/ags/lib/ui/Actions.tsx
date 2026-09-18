import { Gtk } from "ags/gtk4"

export type ActionHint = {
  label: string
  value: string
}

function createActionRow(action: ActionHint) {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["actions-row"],
    spacing: 8,
  })

  const label = new Gtk.Label({
    label: action.label,
    css_classes: ["actions-label"],
    halign: Gtk.Align.START,
    xalign: 0,
    hexpand: true,
  })

  const value = new Gtk.Label({
    label: action.value,
    css_classes: ["actions-value"],
    halign: Gtk.Align.END,
    xalign: 1,
  })

  row.append(label)
  row.append(value)

  return row
}

export function createActionsSection(actions: ActionHint[]) {
  const section = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["actions-section"],
    spacing: 3,
  })

  const title = new Gtk.Label({
    label: "Actions",
    css_classes: ["actions-title"],
    halign: Gtk.Align.START,
    xalign: 0,
  })

  section.append(title)

  for (const action of actions) {
    section.append(createActionRow(action))
  }

  return section
}
