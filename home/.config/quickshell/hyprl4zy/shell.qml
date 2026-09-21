import QtQuick
import Quickshell
import Quickshell.Io
import "bar"
import "notifications"
import "services"

ShellRoot {
    id: root

    Variants {
        model: Quickshell.screens
        Bar { }
    }

    // Keep notification presentation instantiated from session start. This also
    // forces NotificationService/NotificationServer to claim the Freedesktop
    // notification DBus service before Electron apps query capabilities.
    Variants {
        model: Quickshell.screens
        NotificationOverlay { }
    }

    Timer {
        id: routerRecovery
        interval: 2000
        onTriggered: commandRouter.running = true
    }

    Process {
        id: commandRouter
        running: true
        command: ["bash", Quickshell.shellPath("launcher.sh"), "--listen"]

        stdout: SplitParser {
            onRead: message => {
                const action = String(message).trim()
                if (action.length > 0)
                    ShellControl.dispatchAction(action)
            }
        }

        stderr: SplitParser {
            onRead: message => console.warn("hyprl4zy router:", String(message).trim())
        }

        onStarted: console.log("hyprl4zy command mailbox listener started")
        onExited: (exitCode, exitStatus) => {
            console.warn("hyprl4zy command listener exited:", exitCode, exitStatus)
            routerRecovery.restart()
        }
    }
}
