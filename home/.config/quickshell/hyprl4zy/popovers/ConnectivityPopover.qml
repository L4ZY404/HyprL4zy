import QtQuick
import Quickshell
import Quickshell.Bluetooth
import Quickshell.Networking
import "../services"

Rectangle {
    id: root

    required property real unit
    required property color backgroundColor
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    required property color surfaceColor
    property bool panelVisible: false
    property int selectedTab: 0

    property string pendingSsid: ""
    property string lastActionSsid: ""
    property string wifiError: ""

    readonly property bool nativeNetworkBackendAvailable: Networking.backend !== NetworkBackendType.None
    readonly property var wifiDevice: nativeNetworkBackendAvailable
        ? Networking.devices.values.find(device => device.type === DeviceType.Wifi) || null
        : null
    readonly property bool nativeWifiReady: wifiDevice !== null
    readonly property bool iwdWifiReady: !nativeWifiReady && IwdWifiService.available
    readonly property bool networkBackendAvailable: nativeWifiReady || iwdWifiReady
    readonly property string wifiBackendLabel: nativeWifiReady ? "NATIVE" : (iwdWifiReady ? "IWD" : "OFFLINE")
    readonly property var connectedWifi: nativeWifiReady
        ? wifiDevice.networks.values.find(network => network.connected) || null
        : null
    readonly property string connectedWifiName: nativeWifiReady
        ? (connectedWifi ? connectedWifi.name : "")
        : (iwdWifiReady ? IwdWifiService.connectedSsid : "")
    readonly property bool wifiHardwareAvailable: nativeWifiReady
        ? Networking.wifiHardwareEnabled
        : iwdWifiReady
    readonly property bool wifiOn: nativeWifiReady
        ? Networking.wifiEnabled
        : (iwdWifiReady ? IwdWifiService.powered : false)
    readonly property var wifiNetworks: nativeWifiReady
        ? wifiDevice.networks.values.slice().sort((a, b) => {
            if (a.connected !== b.connected) return a.connected ? -1 : 1
            if (a.known !== b.known) return a.known ? -1 : 1
            return Number(b.signalStrength || 0) - Number(a.signalStrength || 0)
        })
        : (iwdWifiReady ? IwdWifiService.networks : [])

    readonly property var bluetoothAdapter: Bluetooth.defaultAdapter
    readonly property bool bluetoothOn: bluetoothAdapter ? bluetoothAdapter.enabled : false
    readonly property var bluetoothDevices: bluetoothAdapter
        ? bluetoothAdapter.devices.values.slice().sort((a, b) => {
            if (a.connected !== b.connected) return a.connected ? -1 : 1
            if (a.paired !== b.paired) return a.paired ? -1 : 1
            return String(a.name || a.address).localeCompare(String(b.name || b.address))
        })
        : []

    readonly property real preferredHeight: selectedTab === 0
        ? unit * (pendingSsid.length > 0 ? 5.65 : 5.18)
        : unit * 5.18

    implicitHeight: preferredHeight
    radius: unit * 0.28
    color: backgroundColor
    border.width: Math.max(1, unit * 0.025)
    border.color: backgroundColor
    antialiasing: true
    clip: true

    function updateWifiScanner() {
        const active = panelVisible && selectedTab === 0 && wifiOn
        if (wifiDevice)
            wifiDevice.scannerEnabled = active
        IwdWifiService.panelActive = active && iwdWifiReady
    }

    function toggleWifi() {
        if (nativeWifiReady) {
            Networking.wifiEnabled = !Networking.wifiEnabled
            return
        }
        if (iwdWifiReady)
            IwdWifiService.setPowered(!IwdWifiService.powered)
    }

    function networkForSsid(ssid) {
        const target = String(ssid || "")
        return wifiNetworks.find(network => String(network.name || "") === target) || null
    }

    function isPskSecurity(security) {
        if (typeof security === "string") {
            const value = security.toLowerCase()
            return value === "psk" || value === "psk3" || value === "sae"
                || value.indexOf("wpa") >= 0
        }
        return security === WifiSecurityType.WpaPsk
            || security === WifiSecurityType.Wpa2Psk
            || security === WifiSecurityType.Sae
    }

    function securityName(network) {
        if (!network)
            return "Unknown"
        if (iwdWifiReady) {
            const value = String(network.security || "unknown").toLowerCase()
            if (value === "open") return "Open"
            if (value === "psk") return "WPA2"
            if (value === "psk3" || value === "sae") return "WPA3"
            if (value === "8021x") return "Enterprise"
            if (value === "owe") return "Enhanced Open"
            return value.toUpperCase()
        }
        if (network.security === WifiSecurityType.Open)
            return "Open"
        return WifiSecurityType.toString(network.security)
    }

    function showPasswordPrompt(ssid, message) {
        pendingSsid = String(ssid || "")
        wifiError = message || "Password required"
        passwordInput.text = ""
        if (panelVisible && selectedTab === 0)
            Qt.callLater(function() { passwordInput.forceActiveFocus() })
    }

    function clearPasswordPrompt() {
        pendingSsid = ""
        passwordInput.text = ""
    }

    function beginWifiAction(ssid) {
        lastActionSsid = String(ssid || "")
        wifiActionGuard.restart()
    }

    function endWifiAction() {
        lastActionSsid = ""
        wifiActionGuard.stop()
    }

    function cancelWifiPassword() {
        clearPasswordPrompt()
        endWifiAction()
        wifiError = ""
    }

    function requestWifiAction(network) {
        if (!network || network.stateChanging)
            return

        wifiError = ""

        if (iwdWifiReady) {
            if (network.connected) {
                IwdWifiService.disconnect()
                return
            }

            beginWifiAction(network.name)
            if (!network.known && isPskSecurity(network.security)) {
                showPasswordPrompt(network.name, "Enter the Wi-Fi password")
                return
            }
            IwdWifiService.connectNetwork(network.name, "")
            return
        }

        if (network.connected) {
            network.disconnect()
            return
        }

        beginWifiAction(network.name)

        if (!network.known && isPskSecurity(network.security)) {
            showPasswordPrompt(network.name, "Enter the Wi-Fi password")
            return
        }

        network.connect()
    }

    function submitWifiPassword() {
        const network = networkForSsid(pendingSsid)
        const password = passwordInput.text
        if (!network) {
            wifiError = "Network is no longer available"
            clearPasswordPrompt()
            return
        }
        if (!password.length) {
            wifiError = "Password cannot be empty"
            return
        }
        if (!isPskSecurity(network.security)) {
            wifiError = "This network requires an external authentication agent"
            return
        }

        beginWifiAction(network.name)
        if (iwdWifiReady)
            IwdWifiService.connectNetwork(network.name, password)
        else
            network.connectWithPsk(password)
        clearPasswordPrompt()
        wifiError = "Connecting to " + network.name + "…"
    }

    function handleWifiFailure(ssid, reason) {
        if (ssid !== lastActionSsid)
            return
        const network = networkForSsid(ssid)
        if (network && isPskSecurity(network.security)
                && (reason === ConnectionFailReason.NoSecrets || reason === ConnectionFailReason.WifiAuthTimeout)) {
            if (panelVisible && selectedTab === 0) {
                showPasswordPrompt(ssid, reason === ConnectionFailReason.WifiAuthTimeout
                    ? "Authentication failed — try the password again"
                    : "Password required")
            } else {
                wifiError = ConnectionFailReason.toString(reason)
                endWifiAction()
            }
            return
        }
        wifiError = ConnectionFailReason.toString(reason)
        endWifiAction()
    }

    function bluetoothMainAction(device) {
        if (!device || !bluetoothOn)
            return
        if (device.blocked) {
            device.blocked = false
            return
        }
        if (device.pairing) {
            device.cancelPair()
            return
        }
        if (!device.paired) {
            device.pair()
            return
        }
        if (device.connected)
            device.disconnect()
        else
            device.connect()
    }

    function bluetoothActionText(device) {
        if (!device)
            return ""
        if (device.blocked)
            return "UNBLOCK"
        if (device.pairing)
            return "CANCEL"
        if (!device.paired)
            return "PAIR"
        return device.connected ? "DISCONNECT" : "CONNECT"
    }

    Connections {
        target: IwdWifiService

        function onActionFinished(success, action, ssid) {
            if (!root.iwdWifiReady && action !== "power-on")
                return

            if (action === "connect") {
                if (success) {
                    root.wifiError = ""
                    root.clearPasswordPrompt()
                    root.endWifiAction()
                } else {
                    const network = root.networkForSsid(ssid)
                    if (network && root.isPskSecurity(network.security)
                            && root.panelVisible && root.selectedTab === 0)
                        root.showPasswordPrompt(ssid, IwdWifiService.errorText || "Authentication failed — try again")
                    else
                        root.wifiError = IwdWifiService.errorText || "Could not connect to Wi-Fi"
                }
                return
            }

            if (!success)
                root.wifiError = IwdWifiService.errorText || "Wi-Fi action failed"
            else if (root.wifiError.length)
                root.wifiError = ""
        }

        function onErrorTextChanged() {
            if (root.iwdWifiReady && IwdWifiService.errorText.length > 0)
                root.wifiError = IwdWifiService.errorText
        }
    }

    Timer {
        id: wifiActionGuard
        interval: 32000
        repeat: false
        onTriggered: root.lastActionSsid = ""
    }

    onPanelVisibleChanged: {
        updateWifiScanner()
        if (!panelVisible) {
            root.clearPasswordPrompt()
            if (bluetoothAdapter && bluetoothAdapter.discovering)
                bluetoothAdapter.discovering = false
        }
    }
    onSelectedTabChanged: updateWifiScanner()
    onWifiOnChanged: updateWifiScanner()
    onWifiDeviceChanged: updateWifiScanner()
    onIwdWifiReadyChanged: updateWifiScanner()

    Column {
        id: header
        anchors {
            left: parent.left
            right: parent.right
            top: parent.top
            margins: root.unit * 0.24
        }
        spacing: root.unit * 0.11

        Text {
            text: "Connectivity"
            color: root.accentColor
            font.pixelSize: UiScale.text(root.unit * 0.28, root.unit)
            font.weight: Font.Bold
        }

        Row {
            width: parent.width
            spacing: root.unit * 0.10

            Repeater {
                model: ["WI-FI", "BLUETOOTH"]
                delegate: Rectangle {
                    required property string modelData
                    required property int index
                    width: (header.width - root.unit * 0.10) / 2
                    height: root.unit * 0.42
                    radius: height / 2
                    color: root.selectedTab === index
                        ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.20)
                        : root.surfaceColor
                    border.width: Math.max(1, root.unit * 0.01)
                    border.color: root.backgroundColor

                    Text {
                        anchors.centerIn: parent
                        text: parent.modelData
                        color: root.selectedTab === index ? root.accentColor : root.mutedColor
                        font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
                        font.weight: Font.Bold
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.selectedTab = index
                    }
                }
            }
        }
    }

    Item {
        anchors {
            left: parent.left
            right: parent.right
            top: header.bottom
            bottom: parent.bottom
            leftMargin: root.unit * 0.24
            rightMargin: root.unit * 0.24
            topMargin: root.unit * 0.15
            bottomMargin: root.unit * 0.22
        }

        Item {
            anchors.fill: parent
            visible: root.selectedTab === 0

            Column {
                id: wifiContent
                anchors.fill: parent
                spacing: root.unit * 0.12

                Rectangle {
                    width: parent.width
                    height: root.unit * 0.78
                    radius: root.unit * 0.16
                    color: root.surfaceColor

                    Column {
                        anchors {
                            left: parent.left
                            verticalCenter: parent.verticalCenter
                            leftMargin: root.unit * 0.16
                        }
                        spacing: root.unit * 0.025

                        Text {
                            text: "Wi-Fi"
                            color: root.foregroundColor
                            font.pixelSize: UiScale.text(root.unit * 0.16, root.unit)
                            font.weight: Font.DemiBold
                        }

                        Text {
                            width: root.unit * 2.55
                            text: root.wifiBackendLabel + " · " + (!root.networkBackendAvailable
                                ? "No controller"
                                : (root.connectedWifiName.length
                                    ? root.connectedWifiName
                                    : (root.wifiOn ? (root.iwdWifiReady && IwdWifiService.scanning ? "Scanning" : "Ready") : "Disabled")))
                            color: root.mutedColor
                            font.pixelSize: UiScale.text(root.unit * 0.11, root.unit)
                            font.weight: Font.Medium
                            elide: Text.ElideRight
                        }
                    }

                    Rectangle {
                        anchors {
                            right: parent.right
                            verticalCenter: parent.verticalCenter
                            rightMargin: root.unit * 0.14
                        }
                        width: root.unit * 0.82
                        height: root.unit * 0.38
                        radius: height / 2
                        color: root.wifiOn
                            ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.24)
                            : Qt.rgba(root.mutedColor.r, root.mutedColor.g, root.mutedColor.b, 0.14)
                        opacity: root.wifiHardwareAvailable ? 1 : 0.4

                        Rectangle {
                            width: root.unit * 0.28
                            height: width
                            radius: width / 2
                            anchors.verticalCenter: parent.verticalCenter
                            x: root.wifiOn
                                ? parent.width - width - root.unit * 0.055
                                : root.unit * 0.055
                            color: root.wifiOn ? root.accentColor : root.mutedColor

                            Behavior on x {
                                enabled: SettingsService.animations
                                NumberAnimation { duration: 145; easing.type: Easing.OutCubic }
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            enabled: root.wifiHardwareAvailable
                            cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                            onClicked: root.toggleWifi()
                        }
                    }
                }

                Text {
                    visible: !root.networkBackendAvailable
                    width: parent.width
                    wrapMode: Text.WordWrap
                    text: "No supported Wi-Fi controller is active. hyprl4zy tries Quickshell/NetworkManager first, then iwd through iwctl — never nmcli."
                    color: root.mutedColor
                    font.pixelSize: UiScale.text(root.unit * 0.11, root.unit)
                }

                Text {
                    visible: root.networkBackendAvailable
                    text: "Available networks"
                    color: root.foregroundColor
                    font.pixelSize: UiScale.text(root.unit * 0.145, root.unit)
                    font.weight: Font.Bold
                }

                ListView {
                    id: wifiList
                    visible: root.networkBackendAvailable
                    width: parent.width
                    height: visible
                        ? Math.min(
                            root.pendingSsid.length ? root.unit * 1.85 : root.unit * 2.72,
                            Math.max(root.unit * 0.72, count * root.unit * 0.75 - root.unit * 0.07)
                        )
                        : 0
                    clip: true
                    spacing: root.unit * 0.07
                    boundsBehavior: Flickable.StopAtBounds
                    model: ScriptModel {
                        values: root.wifiNetworks
                    }

                    Text {
                        visible: wifiList.count === 0
                        anchors.centerIn: parent
                        text: root.wifiOn ? "No networks found yet" : "Wi-Fi is disabled"
                        color: root.mutedColor
                        font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
                    }

                    delegate: Rectangle {
                        id: wifiRow
                        required property var modelData
                        width: wifiList.width
                        height: root.unit * 0.68
                        radius: root.unit * 0.12
                        color: root.surfaceColor
                        border.width: wifiRow.modelData.connected ? Math.max(1, root.unit * 0.012) : 0
                        border.color: root.backgroundColor

                        Connections {
                            target: root.iwdWifiReady ? null : wifiRow.modelData
                            function onConnectionFailed(reason) {
                                root.handleWifiFailure(wifiRow.modelData.name, reason)
                            }
                            function onConnectedChanged() {
                                if (wifiRow.modelData.connected && wifiRow.modelData.name === root.lastActionSsid) {
                                    root.wifiError = ""
                                    root.clearPasswordPrompt()
                                    root.endWifiAction()
                                }
                            }
                        }

                        Text {
                            anchors {
                                left: parent.left
                                leftMargin: root.unit * 0.12
                                top: parent.top
                                topMargin: root.unit * 0.07
                            }
                            width: parent.width - root.unit * 2.15
                            text: wifiRow.modelData.name
                            color: wifiRow.modelData.connected ? root.accentColor : root.foregroundColor
                            font.pixelSize: UiScale.text(root.unit * 0.135, root.unit)
                            font.weight: Font.DemiBold
                            elide: Text.ElideRight
                        }

                        Text {
                            anchors {
                                left: parent.left
                                leftMargin: root.unit * 0.12
                                bottom: parent.bottom
                                bottomMargin: root.unit * 0.07
                            }
                            width: parent.width - root.unit * 2.15
                            text: Math.round(Number(wifiRow.modelData.signalStrength || 0) * 100) + "% · "
                                + root.securityName(wifiRow.modelData)
                                + (wifiRow.modelData.known ? " · saved" : "")
                                + (wifiRow.modelData.stateChanging ? " · working…" : "")
                            color: root.mutedColor
                            font.pixelSize: UiScale.text(root.unit * 0.102, root.unit)
                            elide: Text.ElideRight
                        }

                        Rectangle {
                            anchors {
                                right: parent.right
                                rightMargin: root.unit * 0.10
                                verticalCenter: parent.verticalCenter
                            }
                            width: wifiRow.modelData.connected ? root.unit * 1.16 : root.unit * 0.96
                            height: root.unit * 0.36
                            radius: height / 2
                            color: wifiActionMouse.containsMouse
                                ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.18)
                                : Qt.rgba(root.backgroundColor.r, root.backgroundColor.g, root.backgroundColor.b, 0.55)
                            opacity: wifiRow.modelData.stateChanging ? 0.45 : 1

                            Text {
                                anchors.centerIn: parent
                                text: wifiRow.modelData.connected ? "DISCONNECT" : "CONNECT"
                                color: wifiRow.modelData.connected ? root.mutedColor : root.accentColor
                                font.pixelSize: UiScale.text(root.unit * 0.078, root.unit)
                                font.weight: Font.Bold
                            }

                            MouseArea {
                                id: wifiActionMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                enabled: !wifiRow.modelData.stateChanging
                                cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                                onClicked: root.requestWifiAction(wifiRow.modelData)
                            }
                        }

                        Rectangle {
                            visible: wifiRow.modelData.known && !wifiRow.modelData.connected && !wifiRow.modelData.stateChanging
                            anchors {
                                right: parent.right
                                rightMargin: root.unit * 1.33
                                verticalCenter: parent.verticalCenter
                            }
                            width: root.unit * 0.58
                            height: root.unit * 0.28
                            radius: height / 2
                            color: forgetMouse.containsMouse
                                ? Qt.rgba(root.mutedColor.r, root.mutedColor.g, root.mutedColor.b, 0.16)
                                : "transparent"

                            Text {
                                anchors.centerIn: parent
                                text: "FORGET"
                                color: root.mutedColor
                                font.pixelSize: UiScale.text(root.unit * 0.074, root.unit)
                                font.weight: Font.Bold
                            }

                            MouseArea {
                                id: forgetMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    if (root.iwdWifiReady)
                                        IwdWifiService.forgetNetwork(wifiRow.modelData.name)
                                    else
                                        wifiRow.modelData.forget()
                                }
                            }
                        }
                    }
                }

                Rectangle {
                    visible: root.pendingSsid.length > 0
                    width: parent.width
                    height: visible ? root.unit * 1.25 : 0
                    radius: root.unit * 0.14
                    color: root.surfaceColor
                    border.width: Math.max(1, root.unit * 0.01)
                    border.color: root.backgroundColor

                    Column {
                        anchors.fill: parent
                        anchors.margins: root.unit * 0.12
                        spacing: root.unit * 0.07

                        Text {
                            width: parent.width
                            text: "Password · " + root.pendingSsid
                            color: root.foregroundColor
                            font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
                            font.weight: Font.DemiBold
                            elide: Text.ElideRight
                        }

                        Rectangle {
                            width: parent.width
                            height: root.unit * 0.35
                            radius: height / 2
                            color: Qt.rgba(root.backgroundColor.r, root.backgroundColor.g, root.backgroundColor.b, 0.68)
                            border.width: Math.max(1, root.unit * 0.008)
                            border.color: root.backgroundColor

                            Text {
                                visible: passwordInput.text.length === 0 && !passwordInput.activeFocus
                                anchors {
                                    left: parent.left
                                    leftMargin: root.unit * 0.12
                                    verticalCenter: parent.verticalCenter
                                }
                                text: "Wi-Fi password"
                                color: root.mutedColor
                                font.pixelSize: UiScale.text(root.unit * 0.10, root.unit)
                            }

                            TextInput {
                                id: passwordInput
                                anchors {
                                    fill: parent
                                    leftMargin: root.unit * 0.12
                                    rightMargin: root.unit * 0.12
                                }
                                verticalAlignment: TextInput.AlignVCenter
                                echoMode: TextInput.Password
                                color: root.foregroundColor
                                selectionColor: root.accentColor
                                font.pixelSize: UiScale.text(root.unit * 0.115, root.unit)
                                clip: true
                                onAccepted: root.submitWifiPassword()
                            }
                        }

                        Row {
                            anchors.right: parent.right
                            spacing: root.unit * 0.08

                            Repeater {
                                model: ["CANCEL", "CONNECT"]
                                delegate: Rectangle {
                                    required property string modelData
                                    required property int index
                                    width: root.unit * 0.80
                                    height: root.unit * 0.30
                                    radius: height / 2
                                    color: index === 1
                                        ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.18)
                                        : Qt.rgba(root.mutedColor.r, root.mutedColor.g, root.mutedColor.b, 0.10)

                                    Text {
                                        anchors.centerIn: parent
                                        text: parent.modelData
                                        color: index === 1 ? root.accentColor : root.mutedColor
                                        font.pixelSize: UiScale.text(root.unit * 0.075, root.unit)
                                        font.weight: Font.Bold
                                    }

                                    MouseArea {
                                        anchors.fill: parent
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: index === 1 ? root.submitWifiPassword() : root.cancelWifiPassword()
                                    }
                                }
                            }
                        }
                    }
                }

                Text {
                    visible: root.wifiError.length > 0
                    width: parent.width
                    text: root.wifiError
                    color: root.mutedColor
                    font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
                    wrapMode: Text.WordWrap
                }
            }
        }

        Item {
            anchors.fill: parent
            visible: root.selectedTab === 1

            Column {
                id: bluetoothContent
                anchors.fill: parent
                spacing: root.unit * 0.12

                Rectangle {
                    width: parent.width
                    height: root.unit * 0.78
                    radius: root.unit * 0.16
                    color: root.surfaceColor

                    Column {
                        anchors {
                            left: parent.left
                            verticalCenter: parent.verticalCenter
                            leftMargin: root.unit * 0.16
                        }
                        spacing: root.unit * 0.025

                        Text {
                            text: "Bluetooth"
                            color: root.foregroundColor
                            font.pixelSize: UiScale.text(root.unit * 0.16, root.unit)
                            font.weight: Font.DemiBold
                        }

                        Text {
                            width: root.unit * 2.4
                            text: !root.bluetoothAdapter
                                ? "No adapter"
                                : (root.bluetoothAdapter.discovering ? "Scanning for devices" : (root.bluetoothOn ? "Enabled" : "Disabled"))
                            color: root.mutedColor
                            font.pixelSize: UiScale.text(root.unit * 0.11, root.unit)
                            elide: Text.ElideRight
                        }
                    }

                    Row {
                        anchors {
                            right: parent.right
                            rightMargin: root.unit * 0.12
                            verticalCenter: parent.verticalCenter
                        }
                        spacing: root.unit * 0.08

                        Rectangle {
                            width: root.unit * 0.70
                            height: root.unit * 0.34
                            radius: height / 2
                            color: root.bluetoothAdapter && root.bluetoothAdapter.discovering
                                ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.20)
                                : Qt.rgba(root.backgroundColor.r, root.backgroundColor.g, root.backgroundColor.b, 0.55)
                            opacity: root.bluetoothOn ? 1 : 0.35

                            Text {
                                anchors.centerIn: parent
                                text: root.bluetoothAdapter && root.bluetoothAdapter.discovering ? "STOP" : "SCAN"
                                color: root.accentColor
                                font.pixelSize: UiScale.text(root.unit * 0.08, root.unit)
                                font.weight: Font.Bold
                            }

                            MouseArea {
                                anchors.fill: parent
                                enabled: root.bluetoothAdapter && root.bluetoothOn
                                cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                                onClicked: root.bluetoothAdapter.discovering = !root.bluetoothAdapter.discovering
                            }
                        }

                        Rectangle {
                            width: root.unit * 0.78
                            height: root.unit * 0.34
                            radius: height / 2
                            color: root.bluetoothOn
                                ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.24)
                                : Qt.rgba(root.mutedColor.r, root.mutedColor.g, root.mutedColor.b, 0.14)
                            opacity: root.bluetoothAdapter ? 1 : 0.35

                            Rectangle {
                                width: root.unit * 0.25
                                height: width
                                radius: width / 2
                                anchors.verticalCenter: parent.verticalCenter
                                x: root.bluetoothOn
                                    ? parent.width - width - root.unit * 0.05
                                    : root.unit * 0.05
                                color: root.bluetoothOn ? root.accentColor : root.mutedColor

                                Behavior on x {
                                    enabled: SettingsService.animations
                                    NumberAnimation { duration: 145; easing.type: Easing.OutCubic }
                                }
                            }

                            MouseArea {
                                anchors.fill: parent
                                enabled: root.bluetoothAdapter
                                cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                                onClicked: root.bluetoothAdapter.enabled = !root.bluetoothAdapter.enabled
                            }
                        }
                    }
                }

                Text {
                    text: "Devices"
                    color: root.foregroundColor
                    font.pixelSize: UiScale.text(root.unit * 0.145, root.unit)
                    font.weight: Font.Bold
                }

                ListView {
                    id: bluetoothList
                    width: parent.width
                    height: Math.min(
                        root.unit * 2.88,
                        Math.max(root.unit * 0.78, count * root.unit * 0.85 - root.unit * 0.07)
                    )
                    clip: true
                    spacing: root.unit * 0.07
                    boundsBehavior: Flickable.StopAtBounds
                    model: ScriptModel {
                        values: root.bluetoothDevices
                    }

                    Text {
                        visible: bluetoothList.count === 0
                        anchors.centerIn: parent
                        text: root.bluetoothOn
                            ? (root.bluetoothAdapter && root.bluetoothAdapter.discovering ? "Searching…" : "Press SCAN to find devices")
                            : "Bluetooth is disabled"
                        color: root.mutedColor
                        font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
                    }

                    delegate: Rectangle {
                        id: deviceRow
                        required property var modelData
                        width: bluetoothList.width
                        height: root.unit * 0.78
                        radius: root.unit * 0.12
                        color: root.surfaceColor
                        border.width: deviceRow.modelData.connected ? Math.max(1, root.unit * 0.012) : 0
                        border.color: root.backgroundColor

                        readonly property string iconPath: deviceRow.modelData.icon
                            ? Quickshell.iconPath(deviceRow.modelData.icon, true)
                            : ""

                        Image {
                            visible: deviceRow.iconPath.length > 0
                            anchors {
                                left: parent.left
                                leftMargin: root.unit * 0.11
                                verticalCenter: parent.verticalCenter
                            }
                            width: root.unit * 0.28
                            height: width
                            source: deviceRow.iconPath
                            fillMode: Image.PreserveAspectFit
                            smooth: true
                        }

                        Text {
                            visible: deviceRow.iconPath.length === 0
                            anchors {
                                left: parent.left
                                leftMargin: root.unit * 0.11
                                verticalCenter: parent.verticalCenter
                            }
                            width: root.unit * 0.28
                            text: "BT"
                            color: root.accentColor
                            font.pixelSize: UiScale.text(root.unit * 0.10, root.unit)
                            font.weight: Font.Bold
                            horizontalAlignment: Text.AlignHCenter
                        }

                        Text {
                            anchors {
                                left: parent.left
                                leftMargin: root.unit * 0.49
                                top: parent.top
                                topMargin: root.unit * 0.075
                            }
                            width: parent.width - root.unit * 2.25
                            text: deviceRow.modelData.name || deviceRow.modelData.address
                            color: deviceRow.modelData.connected ? root.accentColor : root.foregroundColor
                            font.pixelSize: UiScale.text(root.unit * 0.13, root.unit)
                            font.weight: Font.DemiBold
                            elide: Text.ElideRight
                        }

                        Text {
                            anchors {
                                left: parent.left
                                leftMargin: root.unit * 0.49
                                bottom: parent.bottom
                                bottomMargin: root.unit * 0.075
                            }
                            width: parent.width - root.unit * 2.25
                            text: (deviceRow.modelData.connected ? "Connected" : (deviceRow.modelData.paired ? "Paired" : "Discovered"))
                                + (deviceRow.modelData.batteryAvailable ? " · " + Math.round(deviceRow.modelData.battery * 100) + "%" : "")
                                + (deviceRow.modelData.trusted ? " · trusted" : "")
                            color: root.mutedColor
                            font.pixelSize: UiScale.text(root.unit * 0.10, root.unit)
                            elide: Text.ElideRight
                        }

                        Rectangle {
                            anchors {
                                right: parent.right
                                rightMargin: root.unit * 0.10
                                verticalCenter: parent.verticalCenter
                            }
                            width: root.bluetoothActionText(deviceRow.modelData) === "DISCONNECT" ? root.unit * 1.16 : root.unit * 0.96
                            height: root.unit * 0.36
                            radius: height / 2
                            color: btActionMouse.containsMouse
                                ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.18)
                                : Qt.rgba(root.backgroundColor.r, root.backgroundColor.g, root.backgroundColor.b, 0.55)
                            opacity: root.bluetoothOn ? 1 : 0.35

                            Text {
                                anchors.centerIn: parent
                                text: root.bluetoothActionText(deviceRow.modelData)
                                color: root.accentColor
                                font.pixelSize: UiScale.text(root.unit * 0.068, root.unit)
                                font.weight: Font.Bold
                            }

                            MouseArea {
                                id: btActionMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                enabled: root.bluetoothOn
                                cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                                onClicked: root.bluetoothMainAction(deviceRow.modelData)
                            }
                        }

                        Rectangle {
                            visible: deviceRow.modelData.paired && !deviceRow.modelData.connected && !deviceRow.modelData.pairing
                            anchors {
                                right: parent.right
                                rightMargin: root.unit * 1.33
                                verticalCenter: parent.verticalCenter
                            }
                            width: root.unit * 0.58
                            height: root.unit * 0.28
                            radius: height / 2
                            color: btForgetMouse.containsMouse
                                ? Qt.rgba(root.mutedColor.r, root.mutedColor.g, root.mutedColor.b, 0.16)
                                : "transparent"

                            Text {
                                anchors.centerIn: parent
                                text: "FORGET"
                                color: root.mutedColor
                                font.pixelSize: UiScale.text(root.unit * 0.067, root.unit)
                                font.weight: Font.Bold
                            }

                            MouseArea {
                                id: btForgetMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: deviceRow.modelData.forget()
                            }
                        }
                    }
                }
            }
        }
    }
}
