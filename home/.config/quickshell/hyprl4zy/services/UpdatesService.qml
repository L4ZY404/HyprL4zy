pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

Item {
    id: root

    property int updateCount: 0
    property int officialCount: 0
    property int aurCount: 0
    property bool checking: false
    property var updateLines: []
    property string errorText: ""
    property string warningText: ""
    property string officialBackend: "none"
    property string aurHelper: "none"
    property string lastChecked: ""
    property bool timedOut: false

    function refresh() {
        if (checking || checkProcess.running)
            return
        errorText = ""
        warningText = ""
        timedOut = false
        checking = true
        checkProcess.running = true
        timeout.restart()
    }

    function parseOutput(text) {
        const repo = []
        const aur = []
        const warnings = []
        let backend = "none"
        let helper = "none"
        let fatal = ""
        const lines = String(text || "").split("\n")
        for (let i = 0; i < lines.length; ++i) {
            const line = lines[i]
            if (!line.length)
                continue
            const fields = line.split("\t")
            if (fields[0] === "META" && fields.length >= 3) {
                if (fields[1] === "backend") backend = fields.slice(2).join("\t")
                else if (fields[1] === "helper") helper = fields.slice(2).join("\t")
            } else if (fields[0] === "WARN" && fields.length >= 3) {
                warnings.push(fields.slice(2).join("\t"))
            } else if (fields[0] === "ERROR" && fields.length >= 3) {
                fatal = fields.slice(2).join("\t")
            } else if (fields[0] === "PKG" && fields.length >= 3) {
                const value = fields.slice(2).join("\t")
                if (fields[1] === "aur") aur.push(value)
                else repo.push(value)
            }
        }
        root.officialBackend = backend
        root.aurHelper = helper
        root.officialCount = repo.length
        root.aurCount = aur.length
        root.updateCount = repo.length + aur.length
        root.updateLines = repo.map(value => "Repo\t" + value).concat(aur.map(value => "AUR\t" + value))
        root.warningText = warnings.join(" ")
        root.errorText = fatal
    }

    Process {
        id: checkProcess
        command: ["bash", Quickshell.shellPath("scripts/updates-query.sh")]
        stdout: StdioCollector { id: output }
        stderr: StdioCollector { id: errors }
        onExited: (exitCode, exitStatus) => {
            timeout.stop()
            root.checking = false
            if (root.timedOut)
                return
            root.parseOutput(output.text)
            const diagnostic = errors.text.trim()
            if ((exitStatus !== 0 || exitCode !== 0) && !root.errorText.length)
                root.errorText = diagnostic.length ? diagnostic : "Update check failed."
            root.lastChecked = Qt.formatTime(new Date(), "HH:mm")
        }
    }

    Timer {
        id: timeout
        // Repository, fallback and AUR checks can take 225 seconds in total.
        interval: 240000
        onTriggered: {
            root.timedOut = true
            root.errorText = "Update check timed out."
            checkProcess.running = false
        }
    }

    Timer {
        interval: 30 * 60 * 1000
        repeat: true
        running: true
        triggeredOnStart: true
        onTriggered: root.refresh()
    }
}
