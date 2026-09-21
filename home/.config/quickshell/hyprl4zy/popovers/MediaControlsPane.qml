import QtQuick
import "../services"

Item {
    id: root

    required property real unit
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    required property color surfaceColor
    required property var player
    property bool panelVisible: false

    readonly property bool available: player !== null
    readonly property real progress: {
        if (!available || !player.positionSupported || !player.lengthSupported || player.length <= 0)
            return 0
        return Math.max(0, Math.min(1, player.position / player.length))
    }

    function formatTime(seconds) {
        const value = Math.max(0, Math.round(Number(seconds) || 0))
        const mins = Math.floor(value / 60)
        const secs = value % 60
        return mins + ":" + (secs < 10 ? "0" : "") + secs
    }

    Timer {
        interval: 1000
        repeat: true
        running: root.panelVisible && root.available && root.player.isPlaying
        onTriggered: root.player.positionChanged()
    }

    Column {
        anchors.fill: parent
        spacing: root.unit * 0.13

        Text {
            width: parent.width
            text: CavaService.status
            color: CavaService.error.length ? root.foregroundColor : root.mutedColor
            font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
            elide: Text.ElideRight
            MouseArea {
                anchors.fill: parent
                enabled: CavaService.error.length > 0
                cursorShape: Qt.PointingHandCursor
                onClicked: CavaService.restart()
            }
        }

        Row {
            width: parent.width
            height: root.unit * 1.12
            spacing: root.unit * 0.16

            Rectangle {
                width: root.unit * 1.12
                height: width
                radius: root.unit * 0.16
                color: root.surfaceColor
                clip: true

                Image {
                    id: albumArtImage
                    anchors.fill: parent
                    source: root.available ? String(root.player.trackArtUrl || "") : ""
                    fillMode: Image.PreserveAspectCrop
                    smooth: true
                    mipmap: true
                    visible: source.toString().length > 0 && status !== Image.Error
                }

                Text {
                    anchors.centerIn: parent
                    visible: albumArtImage.source.toString().length === 0 || albumArtImage.status === Image.Error
                    text: "♪"
                    color: root.mutedColor
                    font.pixelSize: UiScale.text(root.unit * 0.36, root.unit)
                    font.weight: Font.Bold
                }
            }

            Column {
                width: parent.width - root.unit * 1.28
                anchors.verticalCenter: parent.verticalCenter
                spacing: root.unit * 0.05

                Text {
                    width: parent.width
                    text: root.available ? (root.player.trackTitle || root.player.identity || "Unknown Title") : "No active player"
                    color: root.foregroundColor
                    font.pixelSize: UiScale.text(root.unit * 0.19, root.unit)
                    font.weight: Font.DemiBold
                    elide: Text.ElideRight
                    maximumLineCount: 2
                }

                Text {
                    width: parent.width
                    text: root.available ? (root.player.trackArtist || root.player.trackAlbum || root.player.identity || "") : ""
                    color: root.mutedColor
                    font.pixelSize: UiScale.text(root.unit * 0.13, root.unit)
                    font.weight: Font.Medium
                    elide: Text.ElideRight
                }

                Text {
                    width: parent.width
                    text: root.available ? (root.player.trackAlbum || "") : ""
                    visible: text.length > 0
                    color: root.mutedColor
                    opacity: 0.76
                    font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
                    elide: Text.ElideRight
                }
            }
        }

        Item {
            width: parent.width
            height: root.unit * 0.56

            Rectangle {
                id: progressTrack
                anchors {
                    left: parent.left
                    right: parent.right
                    verticalCenter: parent.verticalCenter
                }
                height: root.unit * 0.085
                radius: height / 2
                color: root.surfaceColor

                Rectangle {
                    width: parent.width * root.progress
                    height: parent.height
                    radius: height / 2
                    color: root.accentColor
                }

                MouseArea {
                    anchors.centerIn: parent
                    width: parent.width
                    height: root.unit * 0.30
                    cursorShape: root.available && root.player.canSeek ? Qt.PointingHandCursor : Qt.ArrowCursor
                    onClicked: mouse => {
                        if (!root.available || !root.player.canSeek || !root.player.positionSupported || !root.player.lengthSupported)
                            return
                        root.player.position = Math.max(0, Math.min(root.player.length, root.player.length * mouse.x / width))
                    }
                }
            }

            Text {
                anchors.left: parent.left
                anchors.bottom: parent.bottom
                text: root.available ? root.formatTime(root.player.position) : "0:00"
                color: root.mutedColor
                font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
            }

            Text {
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                text: root.available ? root.formatTime(root.player.length) : "0:00"
                color: root.mutedColor
                font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
            }
        }

        Row {
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: root.unit * 0.12

            Repeater {
                model: ["PREV", root.available && root.player.isPlaying ? "PAUSE" : "PLAY", "NEXT"]

                delegate: Rectangle {
                    required property var modelData
                    required property int index
                    width: index === 1 ? root.unit * 1.12 : root.unit * 0.88
                    height: root.unit * 0.45
                    radius: height / 2
                    color: controlMouse.containsMouse
                        ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.20)
                        : root.surfaceColor
                    border.width: 0

                    Text {
                        anchors.centerIn: parent
                        text: parent.modelData
                        color: index === 1 ? root.accentColor : root.foregroundColor
                        font.pixelSize: UiScale.text(root.unit * 0.11, root.unit)
                        font.weight: Font.Bold
                    }

                    MouseArea {
                        id: controlMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: root.available ? Qt.PointingHandCursor : Qt.ArrowCursor
                        onClicked: {
                            if (!root.available)
                                return
                            if (index === 0 && root.player.canGoPrevious)
                                root.player.previous()
                            else if (index === 1 && root.player.canTogglePlaying)
                                root.player.togglePlaying()
                            else if (index === 2 && root.player.canGoNext)
                                root.player.next()
                        }
                    }
                }
            }
        }

        Item {
            visible: root.available && root.player.volumeSupported
            width: parent.width
            height: visible ? root.unit * 0.54 : 0

            Text {
                anchors.left: parent.left
                anchors.top: parent.top
                text: "Player volume"
                color: root.foregroundColor
                font.pixelSize: UiScale.text(root.unit * 0.13, root.unit)
                font.weight: Font.DemiBold
            }

            Text {
                anchors.right: parent.right
                anchors.top: parent.top
                text: root.available ? Math.round(root.player.volume * 100) + "%" : "--"
                color: root.accentColor
                font.pixelSize: UiScale.text(root.unit * 0.13, root.unit)
                font.weight: Font.Bold
            }

            Rectangle {
                anchors {
                    left: parent.left
                    right: parent.right
                    bottom: parent.bottom
                }
                height: root.unit * 0.085
                radius: height / 2
                color: root.surfaceColor

                Rectangle {
                    width: parent.width * (root.available ? Math.max(0, Math.min(1, root.player.volume)) : 0)
                    height: parent.height
                    radius: height / 2
                    color: root.accentColor
                }

                MouseArea {
                    anchors.centerIn: parent
                    width: parent.width
                    height: root.unit * 0.30
                    cursorShape: Qt.PointingHandCursor
                    function setVolume(x) {
                        if (root.available && root.player.canControl && root.player.volumeSupported)
                            root.player.volume = Math.max(0, Math.min(1, x / width))
                    }
                    onPositionChanged: mouse => { if (pressed) setVolume(mouse.x) }
                    onClicked: mouse => setVolume(mouse.x)
                }
            }
        }

        Text {
            width: parent.width
            text: AudioService.outputAvailable
                ? "System output: " + Math.round(AudioService.outputVolume * 100) + "%" + (AudioService.outputMuted ? " · muted" : "")
                : "System mixer unavailable"
            color: root.mutedColor
            font.pixelSize: UiScale.text(root.unit * 0.11, root.unit)
            elide: Text.ElideRight
        }
    }
}
