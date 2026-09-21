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

    readonly property int updateCount: UpdatesService.updateCount
    readonly property bool checking: UpdatesService.checking
    readonly property var updateLines: UpdatesService.updateLines
    readonly property string errorText: UpdatesService.errorText
    signal activated()

    implicitHeight: unit * 0.98
    function refresh() { UpdatesService.refresh() }

    Column {
        anchors.centerIn: parent
        spacing: root.unit * 0.045

        Rectangle {
            anchors.horizontalCenter: parent.horizontalCenter
            width: root.unit * 0.42
            height: width
            radius: width / 2
            color: root.updateCount > 0
                ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.13)
                : Qt.rgba(root.mutedColor.r, root.mutedColor.g, root.mutedColor.b, 0.06)

            StatusGlyph {
                anchors.centerIn: parent
                width: UiScale.icon(root.unit * 0.25)
                height: width
                kind: "updates"
                color: root.checking
                    ? root.mutedColor
                    : (root.errorText.length > 0
                        ? root.accentColor
                        : (root.updateCount > 0 ? root.accentColor : root.mutedColor))
            }
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: root.checking ? "…" : (root.errorText.length ? "!" : (root.updateCount > 99 ? "99+" : root.updateCount))
            color: root.errorText.length > 0
                ? root.accentColor
                : (root.updateCount > 0 ? root.foregroundColor : root.mutedColor)
            font.pixelSize: UiScale.text(root.unit * 0.20, root.unit)
            font.weight: Font.Bold
        }
    }

    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        cursorShape: Qt.PointingHandCursor
        onClicked: mouse => {
            if (mouse.button === Qt.RightButton)
                root.refresh()
            else
                root.activated()
        }
    }
}
