import QtQuick
import "../../components"

Item {
    id: root

    required property real unit
    required property color accentColor

    signal activated()
    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.activated() }

    ArchMark {
        anchors.centerIn: parent
        width: root.unit * 0.37
        height: width
        color: root.accentColor
    }
}
