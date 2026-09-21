import QtQuick
import Quickshell
import "../components"
import "../services"

Flickable {
    id: root

    required property real unit
    required property color backgroundColor
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    required property color surfaceColor

    clip: true
    boundsBehavior: Flickable.StopAtBounds
    contentWidth: width
    contentHeight: mixerColumn.implicitHeight
    interactive: contentHeight > height

    Column {
        id: mixerColumn
        width: root.width
        spacing: root.unit * 0.15

        Text {
            width: parent.width
            text: AudioService.ready
                ? (AudioService.outputAvailable ? "PipeWire mixer ready" : "PipeWire ready — no default output")
                : "Waiting for PipeWire…"
            color: AudioService.outputAvailable ? root.mutedColor : root.foregroundColor
            font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
            elide: Text.ElideRight
        }

        Rectangle {
            width: parent.width
            height: outputSection.implicitHeight + root.unit * 0.28
            radius: root.unit * 0.17
            color: root.surfaceColor

            Column {
                id: outputSection
                anchors {
                    left: parent.left
                    right: parent.right
                    top: parent.top
                    margins: root.unit * 0.14
                }
                spacing: root.unit * 0.10

                Text {
                    text: "Output"
                    color: root.accentColor
                    font.pixelSize: UiScale.text(root.unit * 0.155, root.unit)
                    font.weight: Font.Bold
                }

                AudioLevelControl {
                    width: parent.width
                    unit: root.unit
                    foregroundColor: root.foregroundColor
                    mutedColor: root.mutedColor
                    accentColor: root.accentColor
                    surfaceColor: Qt.rgba(root.backgroundColor.r, root.backgroundColor.g, root.backgroundColor.b, 0.62)
                    title: AudioService.nodeName(AudioService.defaultSink)
                    subtitle: "System output volume"
                    value: AudioService.outputVolume
                    muted: AudioService.outputMuted
                    controlEnabled: AudioService.outputAvailable
                    onVolumeRequested: value => AudioService.setOutputVolume(value)
                    onMuteRequested: AudioService.toggleOutputMute()
                }

                Text {
                    visible: AudioService.outputDevices.length > 1
                    text: "Available outputs"
                    color: root.mutedColor
                    font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
                    font.weight: Font.Medium
                }

                Repeater {
                    model: ScriptModel {
                        values: AudioService.outputDevices
                    }

                    delegate: Rectangle {
                        id: outputRow
                        required property var modelData
                        width: outputSection.width
                        height: AudioService.outputDevices.length > 1 ? root.unit * 0.46 : 0
                        visible: AudioService.outputDevices.length > 1
                        radius: root.unit * 0.10
                        color: outputMouse.containsMouse
                            ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.12)
                            : "transparent"

                        Rectangle {
                            anchors.left: parent.left
                            anchors.verticalCenter: parent.verticalCenter
                            width: root.unit * 0.10
                            height: width
                            radius: width / 2
                            color: AudioService.defaultSink === outputRow.modelData ? root.accentColor : root.mutedColor
                            opacity: AudioService.defaultSink === outputRow.modelData ? 1 : 0.35
                        }

                        Text {
                            anchors {
                                left: parent.left
                                leftMargin: root.unit * 0.18
                                right: parent.right
                                verticalCenter: parent.verticalCenter
                            }
                            text: AudioService.nodeName(outputRow.modelData)
                            color: AudioService.defaultSink === outputRow.modelData ? root.accentColor : root.foregroundColor
                            font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
                            font.weight: Font.Medium
                            elide: Text.ElideRight
                        }

                        MouseArea {
                            id: outputMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: AudioService.setDefaultOutput(outputRow.modelData)
                        }
                    }
                }
            }
        }

        Rectangle {
            width: parent.width
            height: inputSection.implicitHeight + root.unit * 0.28
            radius: root.unit * 0.17
            color: root.surfaceColor

            Column {
                id: inputSection
                anchors {
                    left: parent.left
                    right: parent.right
                    top: parent.top
                    margins: root.unit * 0.14
                }
                spacing: root.unit * 0.10

                Text {
                    text: "Microphone"
                    color: root.accentColor
                    font.pixelSize: UiScale.text(root.unit * 0.155, root.unit)
                    font.weight: Font.Bold
                }

                AudioLevelControl {
                    width: parent.width
                    unit: root.unit
                    foregroundColor: root.foregroundColor
                    mutedColor: root.mutedColor
                    accentColor: root.accentColor
                    surfaceColor: Qt.rgba(root.backgroundColor.r, root.backgroundColor.g, root.backgroundColor.b, 0.62)
                    title: AudioService.nodeName(AudioService.defaultSource)
                    subtitle: "System input volume"
                    value: AudioService.inputVolume
                    muted: AudioService.inputMuted
                    controlEnabled: AudioService.inputAvailable
                    onVolumeRequested: value => AudioService.setInputVolume(value)
                    onMuteRequested: AudioService.toggleInputMute()
                }

                Text {
                    visible: AudioService.inputDevices.length > 1
                    text: "Available inputs"
                    color: root.mutedColor
                    font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
                    font.weight: Font.Medium
                }

                Repeater {
                    model: ScriptModel {
                        values: AudioService.inputDevices
                    }

                    delegate: Rectangle {
                        id: inputRow
                        required property var modelData
                        width: inputSection.width
                        height: AudioService.inputDevices.length > 1 ? root.unit * 0.46 : 0
                        visible: AudioService.inputDevices.length > 1
                        radius: root.unit * 0.10
                        color: inputMouse.containsMouse
                            ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.12)
                            : "transparent"

                        Rectangle {
                            anchors.left: parent.left
                            anchors.verticalCenter: parent.verticalCenter
                            width: root.unit * 0.10
                            height: width
                            radius: width / 2
                            color: AudioService.defaultSource === inputRow.modelData ? root.accentColor : root.mutedColor
                            opacity: AudioService.defaultSource === inputRow.modelData ? 1 : 0.35
                        }

                        Text {
                            anchors {
                                left: parent.left
                                leftMargin: root.unit * 0.18
                                right: parent.right
                                verticalCenter: parent.verticalCenter
                            }
                            text: AudioService.nodeName(inputRow.modelData)
                            color: AudioService.defaultSource === inputRow.modelData ? root.accentColor : root.foregroundColor
                            font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
                            font.weight: Font.Medium
                            elide: Text.ElideRight
                        }

                        MouseArea {
                            id: inputMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: AudioService.setDefaultInput(inputRow.modelData)
                        }
                    }
                }
            }
        }

        Text {
            text: "Applications"
            color: root.accentColor
            font.pixelSize: UiScale.text(root.unit * 0.155, root.unit)
            font.weight: Font.Bold
        }

        Text {
            visible: AudioService.playbackStreams.length === 0
            width: parent.width
            text: "No active playback streams"
            color: root.mutedColor
            font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
        }

        Repeater {
            model: ScriptModel {
                values: AudioService.playbackStreams
            }

            delegate: Rectangle {
                id: streamRow
                required property var modelData
                width: mixerColumn.width
                height: root.unit * 1.02
                radius: root.unit * 0.15
                color: root.surfaceColor

                AudioLevelControl {
                    anchors {
                        fill: parent
                        margins: root.unit * 0.12
                    }
                    unit: root.unit
                    foregroundColor: root.foregroundColor
                    mutedColor: root.mutedColor
                    accentColor: root.accentColor
                    surfaceColor: Qt.rgba(root.backgroundColor.r, root.backgroundColor.g, root.backgroundColor.b, 0.62)
                    title: AudioService.streamName(streamRow.modelData)
                    subtitle: AudioService.streamSubtitle(streamRow.modelData)
                    value: streamRow.modelData && streamRow.modelData.ready && streamRow.modelData.audio
                        ? streamRow.modelData.audio.volume
                        : 0
                    muted: streamRow.modelData && streamRow.modelData.ready && streamRow.modelData.audio
                        ? streamRow.modelData.audio.muted
                        : false
                    controlEnabled: streamRow.modelData && streamRow.modelData.ready && streamRow.modelData.audio
                    onVolumeRequested: value => AudioService.setNodeVolume(streamRow.modelData, value)
                    onMuteRequested: AudioService.toggleNodeMute(streamRow.modelData)
                }
            }
        }

        Item { width: 1; height: root.unit * 0.04 }
    }
}
