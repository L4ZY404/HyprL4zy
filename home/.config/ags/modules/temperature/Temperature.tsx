import { type UiScale } from "../../theme"
import { createStatDialModule } from "../../lib/ui/StatDialModule"

type TemperatureProps = {
  ui?: UiScale
}

export default function Temperature({ ui }: TemperatureProps = {}) {
  return createStatDialModule({ id: "temperature", ui })
}
