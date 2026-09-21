pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io

Item {
    id: root

    property bool scanning: false
    property bool applying: false
    property string backend: "unknown"
    property bool pywalAvailable: false
    property bool ffmpegAvailable: false
    property bool mpvpaperAvailable: false
    property string errorText: ""
    property string statusText: ""
    property var entries: []
    property string pendingWallpaper: ""
    property string paletteStatus: ""

    readonly property string defaultDirectory: (Quickshell.env("HOME") || "") + "/Pictures/Wallpapers"
    readonly property string directory: SettingsService.wallpaperDirectory.trim().length > 0
        ? SettingsService.wallpaperDirectory.trim()
        : defaultDirectory
    readonly property bool imageAvailable: backend !== "none" && backend !== "unknown"
    readonly property bool videoAvailable: ffmpegAvailable && (mpvpaperAvailable || imageAvailable)
    readonly property bool available: imageAvailable || videoAvailable

    function fileName(path) {
        const value = String(path || "")
        const parts = value.split("/")
        return parts.length ? parts[parts.length - 1] : value
    }

    function kindLabel(kind) {
        return kind === "video" ? "Video" : "Image"
    }

    function refreshBackend() {
        if (!statusProcess.running)
            statusProcess.running = true
    }

    function refresh() {
        if (scanProcess.running)
            return
        errorText = ""
        statusText = "Scanning wallpapers…"
        scanning = true
        scanProcess.command = ["bash", Quickshell.shellPath("scripts/wallpaper-control.sh"), "scan", directory]
        scanProcess.running = true
    }

    function apply(path) {
        const target = String(path || "")
        if (!target.length || applying)
            return false
        pendingWallpaper = target
        errorText = ""
        statusText = "Applying " + fileName(target) + "…"
        applying = true
        applyProcess.command = ["bash", Quickshell.shellPath("scripts/wallpaper-control.sh"), "apply", target]
        applyProcess.running = true
        return true
    }

    function applyRandom() {
        if (!entries.length || applying)
            return false
        const index = Math.floor(Math.random() * entries.length)
        return apply(entries[index].path)
    }

    function openFolder() {
        if (folderProcess.running)
            return
        folderProcess.command = ["bash", Quickshell.shellPath("scripts/wallpaper-control.sh"), "open-folder", directory]
        folderProcess.running = true
    }

    Process {
        id: statusProcess
        command: ["bash", Quickshell.shellPath("scripts/wallpaper-control.sh"), "status"]
        stdout: StdioCollector { id: statusOutput }
        stderr: StdioCollector { id: statusError }
        onExited: (exitCode, exitStatus) => {
            if (exitStatus !== 0 || exitCode !== 0) {
                root.backend = "none"
                root.errorText = statusError.text.trim() || "Could not probe wallpaper backend."
                return
            }
            const lines = statusOutput.text.split("\n")
            let nextBackend = "none"
            let nextPywal = false
            let nextFfmpeg = false
            let nextMpvpaper = false
            for (let i = 0; i < lines.length; ++i) {
                const line = String(lines[i] || "").trim()
                if (line.indexOf("backend=") === 0) nextBackend = line.substring(8)
                else if (line === "pywal=1") nextPywal = true
                else if (line === "ffmpeg=1") nextFfmpeg = true
                else if (line === "mpvpaper=1") nextMpvpaper = true
            }
            root.backend = nextBackend
            root.pywalAvailable = nextPywal
            root.ffmpegAvailable = nextFfmpeg
            root.mpvpaperAvailable = nextMpvpaper
        }
    }

    Process {
        id: scanProcess
        command: []
        stdout: StdioCollector { id: scanOutput }
        stderr: StdioCollector { id: scanError }
        onExited: (exitCode, exitStatus) => {
            root.scanning = false
            if (exitStatus !== 0 || exitCode !== 0) {
                root.entries = []
                root.errorText = scanError.text.trim() || "Wallpaper directory could not be scanned."
                root.statusText = ""
                return
            }
            const values = []
            const lines = scanOutput.text.split("\n")
            for (let i = 0; i < lines.length; ++i) {
                const fields = lines[i].split("\t")
                if (fields.length < 4 || fields[0] !== "ENTRY")
                    continue
                values.push({ kind: fields[1], path: fields[2], preview: fields.slice(3).join("\t") })
            }
            root.entries = values
            const images = values.filter(value => value.kind === "image").length
            const videos = values.length - images
            root.statusText = values.length + " wallpapers · " + images + " images · " + videos + " videos"
        }
    }

    Process {
        id: applyProcess
        command: []
        stdout: StdioCollector { id: applyOutput }
        stderr: StdioCollector { id: applyError }
        onExited: (exitCode, exitStatus) => {
            root.applying = false
            if (exitStatus !== 0 || exitCode !== 0) {
                root.errorText = applyError.text.trim() || "Wallpaper could not be applied."
                root.statusText = "Apply failed"
                return
            }
            SettingsService.currentWallpaper = root.pendingWallpaper
            const lines = applyOutput.text.split("\n")
            let live = false
            let paletteResult = "unknown"
            for (let i = 0; i < lines.length; ++i) {
                const line = String(lines[i] || "").trim()
                if (line.indexOf("backend=") === 0) root.backend = line.substring(8)
                else if (line === "live=1") live = true
                else if (line.indexOf("palette=") === 0) paletteResult = line.substring(8)
            }
            root.paletteStatus = paletteResult
            PaletteService.refresh()
            paletteRefreshTimer.restart()
            root.statusText = "Applied " + root.fileName(root.pendingWallpaper)
                + (live ? " · live video" : "")
                + (paletteResult === "updated" ? " · Pywal refreshed" : (paletteResult === "failed" ? " · Pywal failed" : ""))
        }
    }

    Timer {
        id: paletteRefreshTimer
        interval: 260
        repeat: false
        onTriggered: PaletteService.refresh()
    }

    Process {
        id: folderProcess
        command: []
    }

    Component.onCompleted: {
        refreshBackend()
        refresh()
    }
}
