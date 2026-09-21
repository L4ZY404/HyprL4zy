pragma Singleton
import QtQuick
import Quickshell.Io

Item {
    id: root

    property real cpuPercent: 0
    property real memoryPercent: 0
    readonly property real temperatureC: HardwareService.temperature === null ? 0 : HardwareService.temperature
    readonly property bool temperatureAvailable: HardwareService.temperature !== null
    property real previousCpuTotal: 0
    property real previousCpuIdle: 0

    property real memoryTotalGiB: 0
    property real memoryUsedGiB: 0
    property real swapTotalGiB: 0
    property real swapUsedGiB: 0
    property real swapPercent: 0
    property real uptimeSeconds: 0
    property string hostname: "Unknown host"
    property string kernel: "Unknown kernel"
    property real load1: 0
    property real load5: 0
    property real load15: 0
    property int processRunning: 0
    property int processTotal: 0
    property int logicalCpuCount: 0

    property bool diskAvailable: false
    property real diskTotalGiB: 0
    property real diskUsedGiB: 0
    property real diskFreeGiB: 0
    property real diskPercent: 0
    property string diskError: ""

    readonly property string uptimeText: {
        const minutes = Math.floor(uptimeSeconds / 60)
        const hours = Math.floor(minutes / 60)
        const days = Math.floor(hours / 24)
        return (days ? days + "d " : "") + (hours % 24) + "h " + (minutes % 60) + "m"
    }

    FileView {
        id: uptimeFile
        path: "/proc/uptime"
        printErrors: false
        onLoaded: root.uptimeSeconds = Number(text().split(" ")[0]) || 0
    }

    FileView {
        path: "/proc/sys/kernel/hostname"
        printErrors: false
        onLoaded: root.hostname = text().trim()
    }

    FileView {
        path: "/proc/sys/kernel/osrelease"
        printErrors: false
        onLoaded: root.kernel = text().trim()
    }

    FileView {
        id: loadFile
        path: "/proc/loadavg"
        printErrors: false
        onLoaded: root.updateLoad()
    }

    FileView {
        id: cpuInfoFile
        path: "/proc/cpuinfo"
        printErrors: false
        onLoaded: root.updateCpuCount()
    }

    function updateCpu() {
        if (!cpuFile.loaded)
            return

        const line = cpuFile.text().split("\n").find(entry => entry.indexOf("cpu ") === 0)
        if (!line)
            return

        const fields = line.trim().split(/\s+/).slice(1).map(Number)
        if (fields.length < 4)
            return

        let total = 0
        for (let i = 0; i < Math.min(8, fields.length); ++i)
            total += isNaN(fields[i]) ? 0 : fields[i]

        const idle = (fields[3] || 0) + (fields[4] || 0)

        if (previousCpuTotal > 0) {
            const deltaTotal = total - previousCpuTotal
            const deltaIdle = idle - previousCpuIdle
            if (deltaTotal > 0)
                cpuPercent = Math.max(0, Math.min(100, 100 * (1 - deltaIdle / deltaTotal)))
        }

        previousCpuTotal = total
        previousCpuIdle = idle
    }

    function updateMemory() {
        if (!memoryFile.loaded)
            return

        const text = memoryFile.text()
        let total = 0
        let available = 0
        let swapTotal = 0
        let swapFree = 0
        const lines = text.split("\n")

        for (let i = 0; i < lines.length; ++i) {
            const line = lines[i]
            if (line.indexOf("MemTotal:") === 0)
                total = Number(line.replace(/[^0-9]/g, ""))
            else if (line.indexOf("MemAvailable:") === 0)
                available = Number(line.replace(/[^0-9]/g, ""))
            else if (line.indexOf("SwapTotal:") === 0)
                swapTotal = Number(line.replace(/[^0-9]/g, ""))
            else if (line.indexOf("SwapFree:") === 0)
                swapFree = Number(line.replace(/[^0-9]/g, ""))
        }

        if (total > 0) {
            memoryTotalGiB = total / 1048576
            memoryUsedGiB = Math.max(0, total - available) / 1048576
            memoryPercent = Math.max(0, Math.min(100, 100 * (1 - available / total)))
        }

        swapTotalGiB = swapTotal / 1048576
        swapUsedGiB = Math.max(0, swapTotal - swapFree) / 1048576
        swapPercent = swapTotal > 0 ? Math.max(0, Math.min(100, 100 * (1 - swapFree / swapTotal))) : 0
    }

    function updateLoad() {
        if (!loadFile.loaded)
            return
        const fields = loadFile.text().trim().split(/\s+/)
        if (fields.length < 4)
            return
        load1 = Number(fields[0]) || 0
        load5 = Number(fields[1]) || 0
        load15 = Number(fields[2]) || 0
        const processes = fields[3].split("/")
        processRunning = Number(processes[0]) || 0
        processTotal = Number(processes[1]) || 0
    }

    function updateCpuCount() {
        if (!cpuInfoFile.loaded)
            return
        const matches = cpuInfoFile.text().match(/^processor\s*:/gm)
        logicalCpuCount = matches ? matches.length : 0
    }

    function refreshDisk() {
        if (!diskProcess.running)
            diskProcess.running = true
    }

    function parseDisk(text) {
        const lines = String(text || "").trim().split("\n").filter(line => line.trim().length > 0)
        if (lines.length < 2) {
            diskAvailable = false
            diskError = "Storage data unavailable"
            return
        }

        const fields = lines[lines.length - 1].trim().split(/\s+/)
        if (fields.length < 6) {
            diskAvailable = false
            diskError = "Storage data unavailable"
            return
        }

        const total = Number(fields[1])
        const used = Number(fields[2])
        const free = Number(fields[3])
        if (!isFinite(total) || total <= 0 || !isFinite(used) || !isFinite(free)) {
            diskAvailable = false
            diskError = "Storage data unavailable"
            return
        }

        diskTotalGiB = total / 1073741824
        diskUsedGiB = used / 1073741824
        diskFreeGiB = free / 1073741824
        diskPercent = Math.max(0, Math.min(100, used / total * 100))
        diskAvailable = true
        diskError = ""
    }

    FileView {
        id: cpuFile
        path: "/proc/stat"
        printErrors: false
        onLoaded: root.updateCpu()
    }

    FileView {
        id: memoryFile
        path: "/proc/meminfo"
        printErrors: false
        onLoaded: root.updateMemory()
    }


    Process {
        id: diskProcess
        command: ["df", "-P", "-B1", "/"]
        stdout: StdioCollector { id: diskOutput }
        stderr: StdioCollector { id: diskErrors }
        onExited: (exitCode, exitStatus) => {
            if (exitStatus !== 0 || exitCode !== 0 || diskErrors.text.trim().length > 0) {
                root.diskAvailable = false
                root.diskError = "Storage data unavailable"
                return
            }
            root.parseDisk(diskOutput.text)
        }
    }

    Timer {
        interval: 1500
        repeat: true
        running: true
        triggeredOnStart: true
        onTriggered: {
            cpuFile.reload()
            memoryFile.reload()
            uptimeFile.reload()
            loadFile.reload()
        }
    }

    Timer {
        interval: 30000
        repeat: true
        running: true
        triggeredOnStart: true
        onTriggered: root.refreshDisk()
    }
}
