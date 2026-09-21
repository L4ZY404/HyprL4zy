import QtQuick
import Quickshell
import Quickshell.Io
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
    required property int updateCount
    required property bool checking
    required property var updateLines
    property string errorText: ""
    property bool confirmUpgrade: false
    property string launchStatus: ""

    signal refreshRequested()

    readonly property real packageListHeight: Math.min(
        unit * 1.85,
        Math.max(unit * 0.82, updateLines.length * unit * 0.48 + unit * 0.18)
    )
    readonly property real preferredHeight: Math.min(unit * 4.05, unit * 2.18 + packageListHeight)
    readonly property string updateScript: Quickshell.shellPath("scripts/update-control.sh")

    radius: unit * 0.28
    color: backgroundColor
    border.width: Math.max(1, unit * 0.025)
    border.color: backgroundColor
    antialiasing: true

    Column {
        anchors.fill: parent
        anchors.margins: root.unit * 0.20
        spacing: root.unit * 0.085

        Row {
            width: parent.width
            height: root.unit * 0.40

            Column {
                id: heading
                width: parent.width - refreshButton.width
                anchors.verticalCenter: parent.verticalCenter
                spacing: root.unit * 0.01

                Text {
                    text: "Updates"
                    color: root.accentColor
                    font.pixelSize: UiScale.text(root.unit * 0.235, root.unit)
                    font.weight: Font.Bold
                }

                Text {
                    text: root.checking
                        ? "Checking repositories and AUR…"
                        : (root.errorText.length
                            ? "Update check needs attention"
                            : root.updateCount + " pending · " + (UpdatesService.officialBackend === "checkupdates" ? "fresh repositories" : "local cache") + " · " + (UpdatesService.lastChecked || "—"))
                    color: root.mutedColor
                    font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
                }
            }

            Rectangle {
                id: refreshButton
                width: root.unit * 1.02
                height: root.unit * 0.38
                anchors.verticalCenter: parent.verticalCenter
                radius: height / 2
                color: refreshMouse.containsMouse
                    ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.18)
                    : root.surfaceColor

                Row {
                    anchors.centerIn: parent
                    spacing: root.unit * 0.055

                    Text {
                        text: root.checking ? "…" : "↻"
                        color: root.foregroundColor
                        font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
                        font.weight: Font.Bold
                    }

                    Text {
                        visible: !root.checking
                        text: "Refresh"
                        color: root.foregroundColor
                        font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
                        font.weight: Font.DemiBold
                    }
                }

                MouseArea {
                    id: refreshMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    enabled: !root.checking
                    onClicked: root.refreshRequested()
                }
            }
        }

        Row {
            width: parent.width
            height: root.unit * 0.38
            spacing: root.unit * 0.08

            Repeater {
                model: [
                    { label: "TOTAL", value: root.updateCount },
                    { label: "REPO", value: UpdatesService.officialCount },
                    { label: "AUR", value: UpdatesService.aurCount }
                ]

                delegate: Rectangle {
                    required property var modelData
                    width: (parent.width - root.unit * 0.16) / 3
                    height: parent.height
                    radius: root.unit * 0.12
                    color: root.surfaceColor

                    Row {
                        anchors.centerIn: parent
                        spacing: root.unit * 0.05
                        Text {
                            text: modelData.label
                            color: root.mutedColor
                            font.pixelSize: UiScale.text(root.unit * 0.09, root.unit)
                            font.weight: Font.DemiBold
                        }
                        Text {
                            text: modelData.value
                            color: root.foregroundColor
                            font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
                            font.weight: Font.Bold
                        }
                    }
                }
            }
        }

        Text {
            width: parent.width
            visible: root.errorText.length > 0 || UpdatesService.warningText.length > 0
            text: root.errorText.length > 0 ? root.errorText : UpdatesService.warningText
            color: root.errorText.length > 0 ? root.accentColor : root.mutedColor
            font.pixelSize: UiScale.text(root.unit * 0.10, root.unit)
            wrapMode: Text.WordWrap
            maximumLineCount: 2
            elide: Text.ElideRight
        }

        Rectangle {
            width: parent.width
            height: root.packageListHeight
            radius: root.unit * 0.16
            color: root.surfaceColor
            clip: true

            Text {
                visible: root.updateCount === 0 && !root.checking && !root.errorText.length
                anchors.centerIn: parent
                width: parent.width * 0.86
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                text: UpdatesService.officialBackend === "checkupdates"
                    ? "No pending repository or AUR packages"
                    : "No pending packages in the current pacman cache"
                color: root.mutedColor
                font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
                font.weight: Font.Medium
            }

            ListView {
                visible: root.updateCount > 0
                anchors.fill: parent
                anchors.margins: root.unit * 0.08
                model: root.updateLines
                spacing: root.unit * 0.055
                clip: true
                boundsBehavior: Flickable.StopAtBounds

                delegate: Item {
                    id: packageRow
                    required property var modelData
                    width: ListView.view.width
                    height: root.unit * 0.46
                    readonly property var sourceFields: String(modelData).split("\t")
                    readonly property string sourceName: sourceFields.length > 1 ? sourceFields[0] : "Repo"
                    readonly property string packageLine: sourceFields.length > 1 ? sourceFields.slice(1).join("\t") : String(modelData)
                    readonly property var fields: packageLine.split(" ").filter(value => value.length > 0)

                    Rectangle {
                        width: root.unit * 0.56
                        height: root.unit * 0.20
                        anchors.left: parent.left
                        anchors.verticalCenter: parent.verticalCenter
                        radius: height / 2
                        color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, packageRow.sourceName === "AUR" ? 0.20 : 0.10)
                        Text {
                            anchors.centerIn: parent
                            text: packageRow.sourceName
                            color: root.accentColor
                            font.pixelSize: UiScale.text(root.unit * 0.085, root.unit)
                            font.weight: Font.Bold
                        }
                    }

                    Column {
                        anchors.left: parent.left
                        anchors.leftMargin: root.unit * 0.64
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: root.unit * 0.01

                        Text {
                            width: parent.width
                            text: packageRow.fields.length ? packageRow.fields[0] : packageRow.packageLine
                            color: root.foregroundColor
                            font.pixelSize: UiScale.text(root.unit * 0.125, root.unit)
                            font.weight: Font.DemiBold
                            elide: Text.ElideRight
                        }
                        Text {
                            width: parent.width
                            text: packageRow.fields.slice(1).join(" ")
                            color: root.mutedColor
                            font.pixelSize: UiScale.text(root.unit * 0.09, root.unit)
                            elide: Text.ElideMiddle
                        }
                    }
                }
            }
        }

        PanelButton {
            width: parent.width
            unit: root.unit
            accentColor: root.accentColor
            foregroundColor: root.foregroundColor
            surfaceColor: root.surfaceColor
            text: root.confirmUpgrade
                ? "Confirm system upgrade"
                : (upgradeProcess.running ? "Upgrade terminal running" : "Upgrade system")
            selected: root.confirmUpgrade
            enabled: !upgradeProcess.running
            onClicked: {
                if (root.confirmUpgrade) {
                    root.confirmUpgrade = false
                    root.launchStatus = "Opening terminal…"
                    upgradeProcess.running = true
                } else {
                    root.confirmUpgrade = true
                    confirmReset.restart()
                }
            }
        }

        Text {
            width: parent.width
            text: root.launchStatus.length > 0
                ? root.launchStatus
                : ((UpdatesService.officialBackend === "checkupdates" ? "Fresh repo check" : "Cached repo check")
                    + " · " + (UpdatesService.aurHelper !== "none"
                        ? "upgrade via " + UpdatesService.aurHelper
                        : "upgrade via pacman"))
            color: root.mutedColor
            font.pixelSize: UiScale.text(root.unit * 0.10, root.unit)
            wrapMode: Text.WordWrap
            maximumLineCount: 2
        }
    }

    Timer {
        id: confirmReset
        interval: 3500
        onTriggered: root.confirmUpgrade = false
    }

    Process {
        id: upgradeProcess
        command: ["bash", root.updateScript]
        onExited: (exitCode, exitStatus) => {
            if (exitStatus !== 0 || exitCode !== 0)
                root.launchStatus = "Upgrade terminal could not be opened"
            else
                root.launchStatus = "Upgrade terminal closed"
            UpdatesService.refresh()
        }
    }
}
