import QtQuick
import "../services"

Rectangle {
    id: root

    required property real unit
    required property color backgroundColor
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    required property color surfaceColor
    required property var player
    property bool panelVisible: false
    property int selectedTab: 0

    readonly property real preferredHeight: unit * 5.30

    radius: unit * 0.28
    color: backgroundColor
    border.width: Math.max(1, unit * 0.025)
    border.color: backgroundColor
    antialiasing: true

    Column {
        id: header
        anchors {
            left: parent.left
            right: parent.right
            top: parent.top
            margins: root.unit * 0.26
        }
        spacing: root.unit * 0.11

        Text {
            text: "Audio / Media"
            color: root.accentColor
            font.pixelSize: UiScale.text(root.unit * 0.28, root.unit)
            font.weight: Font.Bold
        }

        Row {
            width: parent.width
            spacing: root.unit * 0.10

            Repeater {
                model: ["MEDIA", "MIXER"]
                delegate: Rectangle {
                    required property string modelData
                    required property int index
                    width: (header.width - root.unit * 0.10) / 2
                    height: root.unit * 0.42
                    radius: height / 2
                    color: root.selectedTab === index
                        ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.20)
                        : root.surfaceColor
                    border.width: 0

                    Text {
                        anchors.centerIn: parent
                        text: parent.modelData
                        color: root.selectedTab === index ? root.accentColor : root.mutedColor
                        font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
                        font.weight: Font.Bold
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.selectedTab = index
                    }
                }
            }
        }
    }

    Item {
        anchors {
            left: parent.left
            right: parent.right
            top: header.bottom
            bottom: parent.bottom
            leftMargin: root.unit * 0.26
            rightMargin: root.unit * 0.26
            topMargin: root.unit * 0.16
            bottomMargin: root.unit * 0.24
        }

        MediaControlsPane {
            anchors.fill: parent
            visible: root.selectedTab === 0
            unit: root.unit
            foregroundColor: root.foregroundColor
            mutedColor: root.mutedColor
            accentColor: root.accentColor
            surfaceColor: root.surfaceColor
            player: root.player
            panelVisible: root.panelVisible && visible
        }

        AudioMixerPane {
            anchors.fill: parent
            visible: root.selectedTab === 1
            unit: root.unit
            backgroundColor: root.backgroundColor
            foregroundColor: root.foregroundColor
            mutedColor: root.mutedColor
            accentColor: root.accentColor
            surfaceColor: root.surfaceColor
        }
    }
}
