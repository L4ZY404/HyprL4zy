import QtQuick
import "../services"
import "../components"

Rectangle {
    id: root

    required property real unit
    required property color backgroundColor
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    required property color surfaceColor

    readonly property real preferredHeight: contentColumn.implicitHeight + unit * 0.50

    radius: unit * 0.28
    color: backgroundColor
    border.width: Math.max(1, unit * 0.025)
    border.color: backgroundColor
    antialiasing: true

    Column {
        id: contentColumn
        anchors.fill: parent
        anchors.margins: root.unit * 0.25
        spacing: root.unit * 0.14

        Text {
            text: "Battery"
            color: root.accentColor
            font.pixelSize: UiScale.text(root.unit * 0.28, root.unit)
            font.weight: Font.Bold
        }

        Text {
            text: PowerService.batteryAvailable
                ? Math.round(PowerService.batteryPercent) + "% · " + PowerService.batteryState
                : "No laptop battery detected"
            color: root.foregroundColor
            font.pixelSize: UiScale.text(root.unit * 0.16, root.unit)
            font.weight: Font.DemiBold
        }

        Rectangle {
            visible: PowerService.batteryAvailable
            width: parent.width
            height: visible ? root.unit * 0.12 : 0
            radius: height / 2
            color: root.surfaceColor

            Rectangle {
                width: parent.width * Math.max(0, Math.min(100, PowerService.batteryPercent)) / 100
                height: parent.height
                radius: height / 2
                color: root.accentColor
            }
        }

        Column {
            visible: PowerService.batteryAvailable
            width: parent.width
            spacing: root.unit * 0.08

            Text {
                width: parent.width
                text: (PowerService.charging ? "Time to full" : "Time remaining") + "  " + PowerService.formatDuration(PowerService.timeRemaining)
                color: root.mutedColor
                font.pixelSize: UiScale.text(root.unit * 0.125, root.unit)
            }
            Text {
                visible: PowerService.batteryRate > 0.05
                width: parent.width
                text: "Power rate  " + PowerService.batteryRate.toFixed(1) + " W"
                color: root.mutedColor
                font.pixelSize: UiScale.text(root.unit * 0.125, root.unit)
            }
            Text {
                visible: PowerService.batteryCapacity > 0.05
                width: parent.width
                text: "Energy  " + PowerService.batteryEnergy.toFixed(1) + " / " + PowerService.batteryCapacity.toFixed(1) + " Wh"
                color: root.mutedColor
                font.pixelSize: UiScale.text(root.unit * 0.125, root.unit)
            }
            Text {
                visible: PowerService.batteryHealth >= 0
                width: parent.width
                text: "Health  " + Math.round(PowerService.batteryHealth) + "%"
                color: root.mutedColor
                font.pixelSize: UiScale.text(root.unit * 0.125, root.unit)
            }
            Text {
                visible: PowerService.batteryModel.length > 0
                width: parent.width
                text: "Model  " + PowerService.batteryModel
                elide: Text.ElideRight
                color: root.mutedColor
                font.pixelSize: UiScale.text(root.unit * 0.125, root.unit)
            }
        }

        Text {
            visible: PowerService.batteryAvailable
            text: "Power profile"
            color: root.foregroundColor
            font.pixelSize: UiScale.text(root.unit * 0.15, root.unit)
            font.weight: Font.DemiBold
        }

        Row {
            visible: PowerService.batteryAvailable
            width: parent.width
            height: visible ? root.unit * 0.48 : 0
            spacing: root.unit * 0.08

            PanelButton {
                width: (parent.width - root.unit * 0.16) / 3
                unit: root.unit
                accentColor: root.accentColor
                foregroundColor: root.foregroundColor
                surfaceColor: root.surfaceColor
                text: "SAVER"
                selected: PowerService.profileSelected("power-saver")
                onClicked: PowerService.setProfile("power-saver")
            }
            PanelButton {
                width: (parent.width - root.unit * 0.16) / 3
                unit: root.unit
                accentColor: root.accentColor
                foregroundColor: root.foregroundColor
                surfaceColor: root.surfaceColor
                text: "BALANCED"
                selected: PowerService.profileSelected("balanced")
                onClicked: PowerService.setProfile("balanced")
            }
            PanelButton {
                width: (parent.width - root.unit * 0.16) / 3
                unit: root.unit
                accentColor: root.accentColor
                foregroundColor: root.foregroundColor
                surfaceColor: root.surfaceColor
                text: "PERF"
                enabled: PowerService.hasPerformanceProfile
                selected: PowerService.profileSelected("performance")
                onClicked: PowerService.setProfile("performance")
            }
        }

        Text {
            visible: !PowerService.batteryAvailable
            width: parent.width
            text: "This module stays hidden on desktops and appears automatically when UPower or a system battery is available."
            wrapMode: Text.WordWrap
            color: root.mutedColor
            font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
        }
    }
}
