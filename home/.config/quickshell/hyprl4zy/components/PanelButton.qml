import QtQuick
import "../services"

Rectangle {
    id: root
    required property real unit
    required property color accentColor
    required property color foregroundColor
    required property color surfaceColor
    property string text: ""
    property bool selected: false
    signal clicked()
    implicitHeight: unit * 0.48
    radius: height / 2
    color: selected ? Qt.rgba(accentColor.r, accentColor.g, accentColor.b, 0.20) : surfaceColor
    opacity: enabled ? 1 : 0.4
    Text {
        anchors.centerIn: parent
        text: root.text
        color: root.selected ? root.accentColor : root.foregroundColor
        font.pixelSize: UiScale.text(root.unit * 0.14, root.unit)
        font.weight: Font.DemiBold
    }
    MouseArea {
        anchors.fill: parent
        cursorShape: Qt.PointingHandCursor
        onClicked: root.clicked()
    }
}
