import QtQuick
import Quickshell.Services.Mpris
import "../../components"
import "../../services"

Item {
    id: root

    required property real unit
    required property color backgroundColor
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    property color surfaceColor: Qt.rgba(1, 1, 1, 0.05)

    readonly property var player: {
        const players = Mpris.players.values
        if (!players || players.length === 0)
            return null
        return players.find(candidate => candidate.isPlaying) || players[0]
    }
    readonly property bool available: player !== null
    readonly property bool playing: player !== null && player.isPlaying
    signal activated()

    readonly property var levels: CavaService.levels
    implicitHeight: unit * 0.86

    Item {
        anchors.centerIn: parent
        width: root.unit * 0.70
        height: root.unit * 0.54

        CavaBars {
            anchors.centerIn: parent
            unit: root.unit * 1.08
            accentColor: root.accentColor
            mutedColor: root.mutedColor
            active: CavaService.audible
            levels: root.levels
        }
    }

    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.MiddleButton | Qt.RightButton
        cursorShape: Qt.PointingHandCursor

        onClicked: mouse => {
            if (mouse.button === Qt.LeftButton) {
                root.activated()
                return
            }
            if (!root.available) return

            if (mouse.button === Qt.MiddleButton && root.player.canGoPrevious)
                root.player.previous()
            else if (mouse.button === Qt.RightButton && root.player.canGoNext)
                root.player.next()
        }

        onWheel: wheel => {
            const delta = wheel.angleDelta.y > 0 ? 0.05 : -0.05
            if (AudioService.outputAvailable) {
                AudioService.adjustOutputVolume(delta)
                return
            }
            if (root.available && root.player.canControl && root.player.volumeSupported)
                root.player.volume = Math.max(0, Math.min(1, root.player.volume + delta))
        }
    }

}
