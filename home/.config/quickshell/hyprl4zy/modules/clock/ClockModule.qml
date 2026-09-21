import QtQuick
import Quickshell
import "../../services"

Item {
    id: root

    required property real unit
    required property color accentColor
    required property color mutedColor

    SystemClock {
        id: clock
        precision: SystemClock.Minutes
    }

    Column {
        anchors.centerIn: parent
        spacing: root.unit * 0.018

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: Qt.formatDateTime(clock.date, SettingsService.clock24 ? "HH:mm" : "h:mm")
            color: root.accentColor
            font.pixelSize: UiScale.text(root.unit * 0.285, root.unit)
            font.weight: Font.DemiBold
        }

        Rectangle {
            anchors.horizontalCenter: parent.horizontalCenter
            width: root.unit * 0.30
            height: Math.max(1.4, root.unit * 0.016)
            radius: height / 2
            color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.5)
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: Qt.formatDateTime(clock.date, SettingsService.clock24 ? "ddd d" : "AP · ddd d")
            color: root.mutedColor
            font.pixelSize: UiScale.text(root.unit * 0.135, root.unit)
            font.weight: Font.Medium
        }
    }
}
