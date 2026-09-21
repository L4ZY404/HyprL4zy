pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

QtObject {
    id: root

    property var special: ({})
    property var colors: ({})
    property int generation: 0
    property string status: "idle"

    function refresh() {
        reloadTimer.restart()
    }

    property Timer reloadTimer: Timer {
        interval: 90
        repeat: false
        onTriggered: {
            if (!paletteReader.running) {
                root.status = "loading"
                paletteReader.running = true
            }
        }
    }

    property Process paletteReader: Process {
        command: ["bash", "-lc", "cat -- \"${XDG_CACHE_HOME:-$HOME/.cache}/wal/colors.json\""]
        stdout: StdioCollector { id: paletteOutput }
        stderr: StdioCollector { id: paletteError }
        onExited: (exitCode, exitStatus) => {
            if (exitStatus !== 0 || exitCode !== 0) {
                root.status = paletteError.text.trim() || "palette unavailable"
                return
            }
            try {
                const data = JSON.parse(paletteOutput.text)
                root.special = data.special || ({})
                root.colors = data.colors || ({})
                root.generation += 1
                root.status = "ready"
            } catch (error) {
                root.status = "invalid palette"
            }
        }
    }

    // FileView is only a change trigger. Pywal may replace colors.json atomically,
    // so the actual bytes are always re-read through a fresh Process.
    property FileView paletteWatch: FileView {
        path: (Quickshell.env("XDG_CACHE_HOME") || ((Quickshell.env("HOME") || "") + "/.cache")) + "/wal/colors.json"
        printErrors: false
        watchChanges: true
        onFileChanged: root.refresh()
    }

    Component.onCompleted: refresh()
}
