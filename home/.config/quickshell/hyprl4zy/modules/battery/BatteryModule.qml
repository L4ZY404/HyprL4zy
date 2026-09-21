import QtQuick
import "../../services"
import "../../components"

Item {
    id: root

    required property real unit
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    property color surfaceColor: Qt.rgba(1, 1, 1, 0.05)

    readonly property bool available: PowerService.batteryAvailable
    readonly property bool charging: PowerService.charging
    readonly property real percent: PowerService.batteryPercent

    readonly property real ringSize: unit * 0.62
    implicitHeight: ringSize + unit * 0.08

    MetricRing {
        anchors.centerIn: parent
        width: root.ringSize
        height: width
        unit: root.unit
        value: root.percent
        label: root.charging ? "CHG" : "BAT"
        suffix: "%"
        foregroundColor: root.foregroundColor
        mutedColor: root.mutedColor
        accentColor: root.accentColor
        surfaceColor: root.surfaceColor
    }
}
