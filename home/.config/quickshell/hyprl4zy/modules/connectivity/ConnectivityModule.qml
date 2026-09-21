import QtQuick
import Quickshell.Bluetooth
import Quickshell.Networking
import "../../services"
import "../../components"

Item {
    id: root

    required property real unit
    required property color backgroundColor
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    property color surfaceColor: Qt.rgba(1, 1, 1, 0.05)
    property color accentSurfaceColor: Qt.rgba(accentColor.r, accentColor.g, accentColor.b, 0.15)

    readonly property bool nativeNetworkBackendAvailable: Networking.backend !== NetworkBackendType.None
    readonly property var wifiDevice: nativeNetworkBackendAvailable
        ? Networking.devices.values.find(device => device.type === DeviceType.Wifi) || null
        : null
    readonly property bool nativeWifiReady: wifiDevice !== null
    readonly property bool iwdWifiReady: !nativeWifiReady && IwdWifiService.available
    readonly property bool wifiAvailable: nativeWifiReady ? Networking.wifiHardwareEnabled : iwdWifiReady
    readonly property bool wifiOn: nativeWifiReady ? Networking.wifiEnabled : (iwdWifiReady ? IwdWifiService.powered : false)

    readonly property var bluetoothAdapter: Bluetooth.defaultAdapter
    readonly property bool bluetoothOn: bluetoothAdapter ? bluetoothAdapter.enabled : false
    readonly property int bluetoothConnectedCount: Bluetooth.devices.values.filter(device => device.connected).length

    readonly property real rowHeight: unit * 0.47
    readonly property real glyphSize: UiScale.icon(unit * 0.36)
    readonly property real gap: unit * 0.035

    implicitHeight: rowHeight * 2 + gap

    Column {
        anchors.fill: parent
        spacing: root.gap

        Item {
            width: parent.width
            height: root.rowHeight

            ConnectionGlyph {
                anchors.centerIn: parent
                width: root.glyphSize
                height: width
                kind: "wifi"
                color: root.wifiOn ? root.accentColor : root.mutedColor
                disabled: !root.wifiAvailable || !root.wifiOn
            }

            MouseArea {
                anchors.fill: parent
                cursorShape: root.wifiAvailable ? Qt.PointingHandCursor : Qt.ArrowCursor
                onClicked: {
                    if (!root.wifiAvailable)
                        return
                    if (root.nativeWifiReady)
                        Networking.wifiEnabled = !Networking.wifiEnabled
                    else if (root.iwdWifiReady)
                        IwdWifiService.setPowered(!IwdWifiService.powered)
                }
            }
        }

        Item {
            width: parent.width
            height: root.rowHeight

            ConnectionGlyph {
                anchors.centerIn: parent
                width: root.glyphSize * 0.88
                height: width
                kind: "bluetooth"
                color: root.bluetoothOn ? root.accentColor : root.mutedColor
                disabled: !root.bluetoothOn
            }

            Rectangle {
                visible: root.bluetoothConnectedCount > 0
                width: root.unit * 0.055
                height: width
                radius: width / 2
                color: root.accentColor
                anchors {
                    horizontalCenter: parent.horizontalCenter
                    bottom: parent.bottom
                    bottomMargin: root.unit * 0.006
                }
            }

            MouseArea {
                anchors.fill: parent
                cursorShape: root.bluetoothAdapter ? Qt.PointingHandCursor : Qt.ArrowCursor
                onClicked: if (root.bluetoothAdapter) root.bluetoothAdapter.enabled = !root.bluetoothAdapter.enabled
            }
        }
    }
}
