pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

Item {
    id: root
    property var temperature: null
    property string temperatureSource: ""
    property var battery: ({ available: false, percent: 0, status: "Unknown" })

    Process {
        id: monitor
        command: ["python3", Quickshell.shellPath("scripts/hardware-monitor.py")]
        running: true
        stdout: SplitParser {
            onRead: line => {
                try {
                    const data = JSON.parse(line)
                    root.temperature = data.temperature
                    root.temperatureSource = data.temperatureSource || ""
                    root.battery = data.battery
                } catch (error) {
                    console.warn("Invalid hardware sample:", error)
                }
            }
        }
        onExited: {
            root.temperature = null
            root.battery = ({ available: false, percent: 0, status: "Unknown" })
            retry.restart()
        }
    }
    Timer { id: retry; interval: 10000; onTriggered: monitor.running = true }
}
