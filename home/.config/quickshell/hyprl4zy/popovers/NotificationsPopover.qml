import QtQuick
import "../components"
import "../services"

Rectangle {
    id: root

    required property real unit
    required property color backgroundColor
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    required property color surfaceColor

    signal closeRequested()
    property bool confirmClear: false

    readonly property var recentHistory: {
        const revision = NotificationService.revision
        return NotificationService.historyEntries.slice(0, 3)
    }
    readonly property real preferredHeight: Math.min(unit * 7.1, content.implicitHeight + unit * 0.52)

    radius: unit * 0.28
    color: backgroundColor
    border.width: Math.max(1, unit * 0.025)
    border.color: backgroundColor

    Column {
        id: content
        anchors.fill: parent
        anchors.margins: root.unit * 0.26
        spacing: root.unit * 0.14

        Row {
            width: parent.width
            height: root.unit * 0.38

            Text {
                id: title
                text: "Notifications"
                color: root.accentColor
                font.pixelSize: UiScale.text(root.unit * 0.27, root.unit)
                font.bold: true
                anchors.verticalCenter: parent.verticalCenter
            }

            Item { width: Math.max(0, parent.width - title.implicitWidth - status.implicitWidth); height: 1 }

            Text {
                id: status
                text: NotificationService.paused ? "DND" : "QS LIVE"
                color: root.mutedColor
                font.pixelSize: UiScale.text(root.unit * 0.11, root.unit)
                font.bold: true
                anchors.verticalCenter: parent.verticalCenter
            }
        }

        Text {
            width: parent.width
            text: NotificationService.statusText
            color: root.mutedColor
            font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
            wrapMode: Text.WordWrap
        }

        Row {
            width: parent.width
            spacing: root.unit * 0.10

            Rectangle {
                width: (parent.width - root.unit * 0.10) / 2
                height: root.unit * 0.72
                radius: root.unit * 0.14
                color: root.surfaceColor
                Column {
                    anchors.centerIn: parent
                    spacing: root.unit * 0.025
                    Text { anchors.horizontalCenter: parent.horizontalCenter; text: NotificationService.waitingCount; color: root.foregroundColor; font.pixelSize: UiScale.text(root.unit * 0.20, root.unit); font.bold: true }
                    Text { anchors.horizontalCenter: parent.horizontalCenter; text: "VISIBLE"; color: root.mutedColor; font.pixelSize: UiScale.text(root.unit * 0.095, root.unit) }
                }
            }

            Rectangle {
                width: (parent.width - root.unit * 0.10) / 2
                height: root.unit * 0.72
                radius: root.unit * 0.14
                color: root.surfaceColor
                Column {
                    anchors.centerIn: parent
                    spacing: root.unit * 0.025
                    Text { anchors.horizontalCenter: parent.horizontalCenter; text: NotificationService.historyCount; color: root.foregroundColor; font.pixelSize: UiScale.text(root.unit * 0.20, root.unit); font.bold: true }
                    Text { anchors.horizontalCenter: parent.horizontalCenter; text: "HISTORY"; color: root.mutedColor; font.pixelSize: UiScale.text(root.unit * 0.095, root.unit) }
                }
            }
        }

        PanelButton {
            width: parent.width
            unit: root.unit
            accentColor: root.accentColor
            foregroundColor: root.foregroundColor
            surfaceColor: root.surfaceColor
            text: NotificationService.paused ? "Disable Do Not Disturb" : "Enable Do Not Disturb"
            selected: NotificationService.paused
            onClicked: NotificationService.togglePaused()
        }

        Row {
            width: parent.width
            spacing: root.unit * 0.10

            PanelButton {
                width: (parent.width - root.unit * 0.10) / 2
                unit: root.unit
                accentColor: root.accentColor
                foregroundColor: root.foregroundColor
                surfaceColor: root.surfaceColor
                text: "Close visible"
                enabled: NotificationService.waitingCount > 0
                onClicked: NotificationService.closeVisible()
            }

            PanelButton {
                width: (parent.width - root.unit * 0.10) / 2
                unit: root.unit
                accentColor: root.accentColor
                foregroundColor: root.foregroundColor
                surfaceColor: root.surfaceColor
                text: root.confirmClear ? "Confirm clear" : "Clear history"
                selected: root.confirmClear
                enabled: NotificationService.historyCount > 0
                onClicked: {
                    if (root.confirmClear) {
                        root.confirmClear = false
                        NotificationService.clearHistory()
                    } else {
                        root.confirmClear = true
                        clearReset.restart()
                    }
                }
            }
        }

        Text {
            visible: root.recentHistory.length === 0
            width: parent.width
            text: "No notification history yet."
            color: root.mutedColor
            font.pixelSize: UiScale.text(root.unit * 0.115, root.unit)
        }

        Repeater {
            model: root.recentHistory

            delegate: Rectangle {
                required property var modelData
                width: content.width
                height: historyColumn.implicitHeight + root.unit * 0.22
                radius: root.unit * 0.14
                color: root.surfaceColor

                Column {
                    id: historyColumn
                    anchors {
                        left: parent.left
                        right: parent.right
                        verticalCenter: parent.verticalCenter
                        leftMargin: root.unit * 0.13
                        rightMargin: root.unit * 0.13
                    }
                    spacing: root.unit * 0.025

                    Text {
                        width: parent.width
                        text: modelData.appName + "  ·  " + modelData.summary
                        color: root.foregroundColor
                        font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
                        font.weight: Font.DemiBold
                        elide: Text.ElideRight
                        textFormat: Text.PlainText
                    }
                    Text {
                        visible: text.length > 0
                        width: parent.width
                        text: modelData.body
                        color: root.mutedColor
                        font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
                        maximumLineCount: 2
                        elide: Text.ElideRight
                        wrapMode: Text.Wrap
                        textFormat: Text.PlainText
                    }
                }
            }
        }

        Text {
            width: parent.width
            text: "Quickshell now owns org.freedesktop.Notifications; colors follow the live Pywal theme directly."
            color: root.mutedColor
            font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
            wrapMode: Text.WordWrap
        }

        PanelButton {
            width: parent.width
            unit: root.unit
            accentColor: root.accentColor
            foregroundColor: root.foregroundColor
            surfaceColor: root.surfaceColor
            text: "Close"
            onClicked: root.closeRequested()
        }
    }

    Timer {
        id: clearReset
        interval: 3000
        onTriggered: root.confirmClear = false
    }
}
