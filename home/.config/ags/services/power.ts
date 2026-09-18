import { CONFIG_HOME } from "../lib/paths"
import { shellQuote, spawn } from "../lib/shell"

export type PowerAction = "shutdown" | "reboot" | "lock" | "logout"

const lockScript = `${CONFIG_HOME}/ags/scripts/lock.sh`

export function runPowerAction(action: PowerAction) {
  switch (action) {
    case "shutdown":
      return spawn("systemctl poweroff")
    case "reboot":
      return spawn("systemctl reboot")
    case "lock":
      return spawn(`bash ${shellQuote(lockScript)}`)
    case "logout":
      return spawn("hyprctl dispatch exit")
  }
}
