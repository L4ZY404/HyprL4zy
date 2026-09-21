pragma Singleton
import QtQuick
import Quickshell.Io
import Quickshell.Networking

Item {
    id: root

    property bool available: false
    property bool iwctlPresent: false
    property bool probing: false
    property bool powered: false
    property bool scanning: false
    property bool busy: false
    property bool panelActive: false
    property string deviceName: ""
    property string state: "unknown"
    property string connectedSsid: ""
    property string errorText: ""
    property var rawNetworks: []
    property var networks: []
    property var knownNetworks: []
    property var actionCommand: []
    property string actionName: ""
    property string actionSsid: ""

    readonly property bool nativeWifiReady: Networking.backend !== NetworkBackendType.None
        && Networking.devices.values.some(device => device.type === DeviceType.Wifi)
    readonly property bool connected: connectedSsid.length > 0
    readonly property bool canControl: !nativeWifiReady && available && deviceName.length > 0

    signal actionFinished(bool success, string action, string ssid)

    function cleanText(value) {
        return String(value || "")
            .replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, "")
            .replace(/\r/g, "")
    }

    function normalizedLines(value) {
        return cleanText(value).split("\n").map(line => line.replace(/[│┃]/g, " "))
    }

    function isSeparator(line) {
        const text = String(line || "").trim()
        return !text.length || /^[\-─━═]+$/.test(text)
    }

    function parseStationList(value) {
        const lines = normalizedLines(value)
        let foundName = ""
        let foundState = "unknown"

        for (let i = 0; i < lines.length; ++i) {
            let line = lines[i].trim()
            if (isSeparator(line)
                    || /^Devices in Station Mode/i.test(line)
                    || /^Name\s+/i.test(line))
                continue

            const parts = line.split(/\s{2,}/).filter(part => part.length > 0)
            if (parts.length < 2)
                continue

            const candidateState = String(parts[1] || "").toLowerCase()
            if (["connected", "disconnected", "connecting", "disconnecting", "roaming"].indexOf(candidateState) < 0)
                continue

            foundName = String(parts[0] || "").trim()
            foundState = candidateState
            break
        }

        root.deviceName = foundName
        root.state = foundState
        root.available = foundName.length > 0
        if (!root.available) {
            root.powered = false
            root.connectedSsid = ""
            root.networks = []
        }
    }


    function parseDeviceList(value) {
        const lines = normalizedLines(value)
        let foundName = ""
        let foundPowered = false

        for (let i = 0; i < lines.length; ++i) {
            const line = lines[i].trim()
            if (isSeparator(line) || /^Devices$/i.test(line) || /^Name\s+/i.test(line))
                continue

            const parts = line.split(/\s{2,}/).filter(part => part.trim().length > 0)
            if (parts.length < 5)
                continue
            const mode = String(parts[parts.length - 1] || "").toLowerCase()
            if (mode !== "station")
                continue

            foundName = String(parts[0] || "").trim()
            const poweredToken = String(parts[2] || "").toLowerCase()
            foundPowered = poweredToken === "on" || poweredToken === "yes" || poweredToken === "true"
            break
        }

        root.deviceName = foundName
        root.available = foundName.length > 0
        root.powered = root.available && foundPowered
        root.state = root.available ? "disconnected" : "unknown"
        root.connectedSsid = ""
        if (!root.available)
            root.networks = []
    }

    function parseStationShow(value) {
        const lines = normalizedLines(value)
        let nextState = root.state
        let nextSsid = ""

        for (let i = 0; i < lines.length; ++i) {
            const line = lines[i].trim()
            let match = line.match(/^State\s+(.+)$/i)
            if (match) {
                nextState = String(match[1] || "").trim().toLowerCase()
                continue
            }
            match = line.match(/^Connected network\s+(.+)$/i)
            if (match) {
                nextSsid = String(match[1] || "").trim()
                continue
            }
        }

        root.state = nextState
        root.connectedSsid = nextState === "connected" ? nextSsid : ""
        rebuildNetworks()
    }

    function parseDeviceShow(value) {
        const lines = normalizedLines(value)
        let seenPowered = false
        let nextPowered = root.powered

        for (let i = 0; i < lines.length; ++i) {
            const line = lines[i].trim()
            const match = line.match(/^Powered\s+(on|off|yes|no|true|false)$/i)
            if (!match)
                continue
            const token = String(match[1]).toLowerCase()
            nextPowered = token === "on" || token === "yes" || token === "true"
            seenPowered = true
            break
        }

        if (seenPowered)
            root.powered = nextPowered
        else if (root.available)
            root.powered = true
    }

    function parseSignal(value) {
        const text = String(value || "")
        const percent = text.match(/(\d+)\s*%/)
        if (percent)
            return Math.max(0, Math.min(1, Number(percent[1]) / 100))
        const stars = (text.match(/\*/g) || []).length
        if (stars > 0)
            return Math.max(0, Math.min(1, stars / 4))
        const numeric = text.match(/-?\d+/)
        if (numeric) {
            const valueNumber = Number(numeric[0])
            if (valueNumber <= 0)
                return Math.max(0, Math.min(1, (valueNumber + 100) / 70))
        }
        return 0
    }

    function parseNetworkList(value) {
        const lines = normalizedLines(value)
        const entries = []

        for (let i = 0; i < lines.length; ++i) {
            let original = lines[i]
            let line = original.trim()
            if (isSeparator(line)
                    || /^Available networks/i.test(line)
                    || /^Network name\s+/i.test(line))
                continue

            const selected = /^>\s*/.test(line)
            line = line.replace(/^>\s*/, "")
            let parts = line.split(/\s{2,}/).filter(part => part.trim().length > 0)
            if (parts.length < 3)
                continue

            const signalText = String(parts.pop() || "").trim()
            const security = String(parts.pop() || "unknown").trim().toLowerCase()
            const name = parts.join("  ").trim()
            if (!name.length)
                continue

            entries.push({
                name: name,
                security: security,
                signalStrength: parseSignal(signalText),
                selected: selected
            })
        }

        root.rawNetworks = entries
        rebuildNetworks()
    }

    function parseKnownNetworks(value) {
        const lines = normalizedLines(value)
        const names = []

        for (let i = 0; i < lines.length; ++i) {
            const line = lines[i].trim()
            if (isSeparator(line)
                    || /^Known Networks/i.test(line)
                    || /^Name\s+/i.test(line))
                continue

            const match = line.match(/^(.*?)\s{2,}(open|psk|psk3|sae|8021x|hotspot|owe)\s{2,}/i)
            if (match && String(match[1] || "").trim().length)
                names.push(String(match[1]).trim())
        }

        root.knownNetworks = names
        rebuildNetworks()
    }

    function rebuildNetworks() {
        const known = root.knownNetworks
        const active = root.connectedSsid
        root.networks = root.rawNetworks.map(entry => ({
            iwd: true,
            name: entry.name,
            security: entry.security,
            signalStrength: entry.signalStrength,
            connected: entry.selected || (active.length > 0 && entry.name === active),
            known: known.indexOf(entry.name) >= 0,
            stateChanging: root.busy && root.actionSsid === entry.name
        })).sort((a, b) => {
            if (a.connected !== b.connected) return a.connected ? -1 : 1
            if (a.known !== b.known) return a.known ? -1 : 1
            return Number(b.signalStrength || 0) - Number(a.signalStrength || 0)
        })
    }

    function probe() {
        if (nativeWifiReady || commandCheckProcess.running || probeProcess.running)
            return
        probing = true
        errorText = ""
        if (!iwctlPresent)
            commandCheckProcess.running = true
        else
            probeProcess.running = true
    }

    function refreshState() {
        if (!canControl)
            return
        if (!stationShowProcess.running)
            stationShowProcess.running = true
        if (!deviceShowProcess.running)
            deviceShowProcess.running = true
        if (!knownProcess.running)
            knownProcess.running = true
    }

    function requestScan() {
        if (!canControl || !powered || scanning || busy)
            return
        scanning = true
        errorText = ""
        scanProcess.running = true
    }

    function refreshNetworks() {
        if (!canControl || networkListProcess.running)
            return
        networkListProcess.running = true
    }

    function runAction(command, action, ssid) {
        if (!canControl || busy || !command || command.length === 0)
            return false
        root.errorText = ""
        root.actionCommand = command
        root.actionName = action
        root.actionSsid = String(ssid || "")
        root.busy = true
        rebuildNetworks()
        actionProcess.running = true
        return true
    }

    function setPowered(enabled) {
        return runAction(
            ["iwctl", "device", deviceName, "set-property", "Powered", enabled ? "on" : "off"],
            enabled ? "power-on" : "power-off",
            ""
        )
    }

    function connectNetwork(ssid, passphrase) {
        const target = String(ssid || "")
        if (!target.length)
            return false
        const password = String(passphrase || "")
        const command = password.length
            ? ["iwctl", "--dont-ask", "--passphrase", password, "station", deviceName, "connect", target]
            : ["iwctl", "--dont-ask", "station", deviceName, "connect", target]
        return runAction(command, "connect", target)
    }

    function disconnect() {
        return runAction(["iwctl", "station", deviceName, "disconnect"], "disconnect", connectedSsid)
    }

    function forgetNetwork(ssid) {
        const target = String(ssid || "")
        if (!target.length)
            return false
        return runAction(["iwctl", "known-networks", target, "forget"], "forget", target)
    }

    onNativeWifiReadyChanged: {
        if (nativeWifiReady) {
            panelActive = false
            scanning = false
            busy = false
        } else {
            probeKick.restart()
        }
    }

    onPanelActiveChanged: {
        if (panelActive) {
            if (!available)
                probe()
            else {
                refreshState()
                scanKick.restart()
            }
        }
    }

    Process {
        id: commandCheckProcess
        command: ["sh", "-c", "command -v iwctl >/dev/null 2>&1"]
        stdout: StdioCollector { }
        stderr: StdioCollector { }
        onExited: (exitCode, exitStatus) => {
            root.iwctlPresent = exitStatus === 0 && exitCode === 0
            if (!root.iwctlPresent) {
                root.probing = false
                root.available = false
                root.errorText = "iwd fallback unavailable"
                return
            }
            probeProcess.running = true
        }
    }

    Process {
        id: probeProcess
        command: ["iwctl", "station", "list"]
        environment: ({ LC_ALL: "C", TERM: "dumb", NO_COLOR: "1", COLUMNS: "200" })
        stdout: StdioCollector { id: probeOut }
        stderr: StdioCollector { id: probeErr }
        onExited: (exitCode, exitStatus) => {
            root.probing = false
            if (exitStatus !== 0 || exitCode !== 0) {
                root.available = false
                root.deviceName = ""
                root.errorText = "iwd fallback unavailable"
                return
            }
            root.parseStationList(probeOut.text)
            if (!root.available) {
                deviceListProbeProcess.running = true
                return
            }
            root.errorText = ""
            root.refreshState()
            if (root.panelActive)
                scanKick.restart()
        }
    }

    Process {
        id: deviceListProbeProcess
        command: ["iwctl", "device", "list"]
        environment: ({ LC_ALL: "C", TERM: "dumb", NO_COLOR: "1", COLUMNS: "200" })
        stdout: StdioCollector { id: deviceListProbeOut }
        stderr: StdioCollector { }
        onExited: (exitCode, exitStatus) => {
            root.probing = false
            if (exitStatus !== 0 || exitCode !== 0) {
                root.available = false
                root.errorText = "iwd fallback unavailable"
                return
            }
            root.parseDeviceList(deviceListProbeOut.text)
            if (!root.available) {
                root.errorText = "No iwd Wi-Fi station found"
                return
            }
            root.errorText = ""
            root.refreshState()
            if (root.panelActive && root.powered)
                scanKick.restart()
        }
    }

    Process {
        id: stationShowProcess
        command: ["iwctl", "station", root.deviceName, "show"]
        environment: ({ LC_ALL: "C", TERM: "dumb", NO_COLOR: "1", COLUMNS: "200" })
        stdout: StdioCollector { id: stationShowOut }
        stderr: StdioCollector { }
        onExited: (exitCode, exitStatus) => {
            if (exitStatus === 0 && exitCode === 0)
                root.parseStationShow(stationShowOut.text)
        }
    }

    Process {
        id: deviceShowProcess
        command: ["iwctl", "device", root.deviceName, "show"]
        environment: ({ LC_ALL: "C", TERM: "dumb", NO_COLOR: "1", COLUMNS: "200" })
        stdout: StdioCollector { id: deviceShowOut }
        stderr: StdioCollector { }
        onExited: (exitCode, exitStatus) => {
            if (exitStatus === 0 && exitCode === 0)
                root.parseDeviceShow(deviceShowOut.text)
        }
    }

    Process {
        id: knownProcess
        command: ["iwctl", "known-networks", "list"]
        environment: ({ LC_ALL: "C", TERM: "dumb", NO_COLOR: "1", COLUMNS: "200" })
        stdout: StdioCollector { id: knownOut }
        stderr: StdioCollector { }
        onExited: (exitCode, exitStatus) => {
            if (exitStatus === 0 && exitCode === 0)
                root.parseKnownNetworks(knownOut.text)
        }
    }

    Process {
        id: scanProcess
        command: ["iwctl", "station", root.deviceName, "scan"]
        environment: ({ LC_ALL: "C", TERM: "dumb", NO_COLOR: "1", COLUMNS: "200" })
        stdout: StdioCollector { }
        stderr: StdioCollector { id: scanErr }
        onExited: (exitCode, exitStatus) => {
            root.scanning = false
            if (exitStatus !== 0 || exitCode !== 0) {
                root.errorText = scanErr.text.trim().length
                    ? "Wi-Fi scan failed"
                    : "Wi-Fi scan unavailable"
                return
            }
            scanResultsDelay.restart()
        }
    }

    Process {
        id: networkListProcess
        command: ["iwctl", "station", root.deviceName, "get-networks"]
        environment: ({ LC_ALL: "C", TERM: "dumb", NO_COLOR: "1", COLUMNS: "200" })
        stdout: StdioCollector { id: networkListOut }
        stderr: StdioCollector { id: networkListErr }
        onExited: (exitCode, exitStatus) => {
            if (exitStatus !== 0 || exitCode !== 0) {
                if (root.panelActive)
                    root.errorText = "Could not read iwd networks"
                return
            }
            root.parseNetworkList(networkListOut.text)
            if (root.errorText === "Could not read iwd networks")
                root.errorText = ""
        }
    }

    Process {
        id: actionProcess
        command: root.actionCommand
        environment: ({ LC_ALL: "C", TERM: "dumb", NO_COLOR: "1", COLUMNS: "200" })
        stdout: StdioCollector { id: actionOut }
        stderr: StdioCollector { id: actionErr }
        onExited: (exitCode, exitStatus) => {
            const action = root.actionName
            const ssid = root.actionSsid
            const ok = exitStatus === 0 && exitCode === 0
            root.busy = false
            root.actionCommand = []
            root.actionName = ""
            root.actionSsid = ""
            root.rebuildNetworks()

            if (!ok) {
                const detail = root.cleanText(actionErr.text).trim()
                if (/passphrase|psk|credential|secret|authentication/i.test(detail))
                    root.errorText = "Wi-Fi authentication failed"
                else if (/not found|not provided|no station|no device/i.test(detail))
                    root.errorText = "iwd Wi-Fi device unavailable"
                else
                    root.errorText = action === "connect" ? "Could not connect to Wi-Fi" : "Wi-Fi action failed"
            } else {
                root.errorText = ""
            }

            root.actionFinished(ok, action, ssid)
            stateRefreshDelay.restart()
        }
    }

    Timer {
        interval: 10000
        repeat: true
        running: !root.nativeWifiReady
        triggeredOnStart: true
        onTriggered: {
            if (!root.available)
                root.probe()
        }
    }

    Timer {
        interval: 5000
        repeat: true
        running: root.available && !root.nativeWifiReady
        onTriggered: root.refreshState()
    }

    Timer {
        interval: 12000
        repeat: true
        running: root.panelActive && root.canControl && root.powered
        onTriggered: root.requestScan()
    }

    Timer {
        id: probeKick
        interval: 250
        repeat: false
        onTriggered: root.probe()
    }

    Timer {
        id: scanKick
        interval: 180
        repeat: false
        onTriggered: root.requestScan()
    }

    Timer {
        id: scanResultsDelay
        interval: 700
        repeat: false
        onTriggered: {
            root.refreshNetworks()
            if (!knownProcess.running)
                knownProcess.running = true
        }
    }

    Timer {
        id: stateRefreshDelay
        interval: 650
        repeat: false
        onTriggered: {
            root.refreshState()
            if (root.panelActive)
                scanKick.restart()
        }
    }
}
