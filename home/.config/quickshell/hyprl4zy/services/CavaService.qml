pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io
import "Spectrum.js" as Spectrum

Item {
    id: root
    // One audio capture process shared by every monitor and media panel.
    readonly property int barCount: 12
    property var levels: Array(barCount).fill(0)
    property bool receiving: false
    property string error: ""
    property int retries: 0
    readonly property bool audible: levels.some(value => value > 0.012)
    readonly property string status: error.length ? error : (receiving ? (audible ? "Live audio" : "Silence") : "Starting Cava…")

    function restart() {
        if (capture.running)
            return
        retry.stop()
        retries = 0
        error = ""
        capture.running = true
    }

    Process {
        id: capture
        command: ["cava", "-p", decodeURIComponent(Qt.resolvedUrl("cava.conf").toString().substring(7))]
        running: true
        stdout: SplitParser {
            onRead: data => {
                const frame = Spectrum.parseFrame(data, root.barCount)
                if (!frame) return
                root.levels = frame
                root.receiving = true
                root.error = ""
                root.retries = 0
                retry.stop()
                stale.restart()
            }
        }
        stderr: SplitParser {
            onRead: data => {
                if (data.trim().length) {
                    root.error = "Cava unavailable — check log"
                    console.warn("Cava:", data.trim())
                }
            }
        }
        onRunningChanged: {
            if (!running) {
                root.levels = Array(root.barCount).fill(0)
                root.receiving = false
                root.error = "Cava unavailable — check installation/audio"
                if (root.retries < 3) retry.restart()
            }
        }
    }
    Timer {
        id: retry
        interval: 5000
        onTriggered: { root.retries += 1; capture.running = true }
    }
    Timer {
        id: stale
        interval: 1500
        onTriggered: {
            root.levels = Array(root.barCount).fill(0)
            root.receiving = false
        }
    }
}
