import QtQuick
import "../services"

Item {
    id: root

    required property real unit
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    required property color surfaceColor
    property string title: "Audio"
    property string subtitle: ""
    property real value: 0
    property bool muted: false
    property bool controlEnabled: true

    signal volumeRequested(real value)
    signal muteRequested()

    implicitHeight: unit * 0.78

    Text {
        id: titleText
        anchors.left: parent.left
        anchors.top: parent.top
        width: parent.width - muteButton.width - root.unit * 0.55
        text: root.title
        color: root.foregroundColor
        font.pixelSize: UiScale.text(root.unit * 0.145, root.unit)
        font.weight: Font.DemiBold
        elide: Text.ElideRight
    }

    Text {
        anchors.left: parent.left
        anchors.top: titleText.bottom
        anchors.topMargin: root.unit * 0.015
        width: titleText.width
        text: root.subtitle
        color: root.mutedColor
        font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
        font.weight: Font.Medium
        elide: Text.ElideRight
    }

    Text {
        anchors.right: muteButton.left
        anchors.rightMargin: root.unit * 0.09
        anchors.verticalCenter: muteButton.verticalCenter
        text: Math.round(Math.max(0, Math.min(1, root.value)) * 100) + "%"
        color: root.muted ? root.mutedColor : root.accentColor
        font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
        font.weight: Font.Bold
    }

    Rectangle {
        id: muteButton
        anchors.right: parent.right
        anchors.top: parent.top
        width: root.unit * 0.66
        height: root.unit * 0.34
        radius: height / 2
        color: muteMouse.containsMouse
            ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.18)
            : root.surfaceColor
        border.width: 0
        opacity: root.controlEnabled ? 1 : 0.35

        Text {
            anchors.centerIn: parent
            text: root.muted ? "MUTED" : "MUTE"
            color: root.muted ? root.mutedColor : root.accentColor
            font.pixelSize: UiScale.text(root.unit * 0.09, root.unit)
            font.weight: Font.Bold
        }

        MouseArea {
            id: muteMouse
            anchors.fill: parent
            hoverEnabled: true
            enabled: root.controlEnabled
            cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
            onClicked: root.muteRequested()
        }
    }

    Rectangle {
        id: track
        anchors {
            left: parent.left
            right: parent.right
            bottom: parent.bottom
            bottomMargin: root.unit * 0.07
        }
        height: root.unit * 0.09
        radius: height / 2
        color: root.surfaceColor
        opacity: root.controlEnabled ? 1 : 0.35

        Rectangle {
            width: parent.width * Math.max(0, Math.min(1, root.value))
            height: parent.height
            radius: height / 2
            color: root.muted ? root.mutedColor : root.accentColor
        }

        Rectangle {
            x: Math.max(0, Math.min(parent.width - width, parent.width * Math.max(0, Math.min(1, root.value)) - width / 2))
            anchors.verticalCenter: parent.verticalCenter
            width: root.unit * 0.15
            height: width
            radius: width / 2
            color: root.foregroundColor
            opacity: root.controlEnabled ? 0.92 : 0.35
        }

        MouseArea {
            anchors.centerIn: parent
            width: parent.width
            height: root.unit * 0.34
            enabled: root.controlEnabled
            cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor

            function applyPosition(x) {
                root.volumeRequested(Math.max(0, Math.min(1, x / width)))
            }

            onClicked: mouse => applyPosition(mouse.x)
            onPositionChanged: mouse => { if (pressed) applyPosition(mouse.x) }
        }
    }
}
