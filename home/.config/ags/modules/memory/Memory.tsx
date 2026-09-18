import { type UiScale } from "../../theme"
import { createStatDialModule } from "../../lib/ui/StatDialModule"

type MemoryProps = {
  ui?: UiScale
}

export default function Memory({ ui }: MemoryProps = {}) {
  return createStatDialModule({ id: "memory", ui })
}
