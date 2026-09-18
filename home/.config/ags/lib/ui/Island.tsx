import { Gtk } from "ags/gtk4"

const VERTICAL = Gtk.Orientation.VERTICAL

type IslandProps = {
  children?: any
  className?: string
  spacing?: number
}

export default function Island({ children, className = "", spacing = 6 }: IslandProps) {
  return (
    <box
      orientation={VERTICAL}
      class={`island ${className}`}
      spacing={spacing}
      halign={Gtk.Align.FILL}
      valign={Gtk.Align.CENTER}
      hexpand={true}
    >
      {children}
    </box>
  )
}
