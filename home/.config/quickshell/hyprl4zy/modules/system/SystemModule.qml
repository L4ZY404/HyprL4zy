import QtQuick
import "../../services"
import "../../components"

Item {
    id: root

    required property real unit
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    property color surfaceColor: Qt.rgba(1, 1, 1, 0.08)

    readonly property real cpuPercent: SystemService.cpuPercent
    readonly property real memoryPercent: SystemService.memoryPercent
    readonly property real temperatureC: SystemService.temperatureC
    readonly property bool temperatureAvailable: SystemService.temperatureAvailable

    readonly property real ringSize: unit * 0.92
    readonly property real gap: unit * 0.055
    readonly property int ringCount: 2 + (temperatureAvailable ? 1 : 0)

    implicitHeight: ringCount * ringSize
        + Math.max(0, ringCount - 1) * gap
        + unit * 0.08

    Column {
        anchors.centerIn: parent
        spacing: root.gap

        MetricRing {
            visible: root.temperatureAvailable
            width: visible ? root.ringSize : 0
            height: visible ? width : 0
            unit: root.unit
            value: root.temperatureC
            label: "TMP"
            suffix: "°"
            foregroundColor: root.foregroundColor
            mutedColor: root.mutedColor
            accentColor: root.accentColor
            surfaceColor: root.surfaceColor
        }

        MetricRing {
            width: root.ringSize
            height: width
            unit: root.unit
            value: root.cpuPercent
            label: "CPU"
            foregroundColor: root.foregroundColor
            mutedColor: root.mutedColor
            accentColor: root.accentColor
            surfaceColor: root.surfaceColor
        }

        MetricRing {
            width: root.ringSize
            height: width
            unit: root.unit
            value: root.memoryPercent
            label: "RAM"
            foregroundColor: root.foregroundColor
            mutedColor: root.mutedColor
            accentColor: root.accentColor
            surfaceColor: root.surfaceColor
        }
    }
}
