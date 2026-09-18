import { type UiScale } from "../../theme"
import { createStatDialModule } from "../../lib/ui/StatDialModule"

type CpuProps = {
  ui?: UiScale
}

export default function Cpu({ ui }: CpuProps = {}) {
  return createStatDialModule({ id: "cpu", ui })
}
