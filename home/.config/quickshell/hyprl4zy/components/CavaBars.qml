import QtQuick

Item {
    id: root

    required property real unit
    required property color accentColor
    required property color mutedColor
    property bool active: true
    property int barCount: 12
    property var levels: []

    readonly property real barWidth: unit * 0.039
    readonly property real gap: unit * 0.016
    readonly property real minBarHeight: unit * 0.035
    readonly property real maxBarHeight: unit * 0.46

    implicitWidth: barCount * barWidth + Math.max(0, barCount - 1) * gap
    implicitHeight: maxBarHeight

    function levelAt(index) {
        if (!levels || index >= levels.length)
            return 0
        return Math.max(0, Math.min(1, levels[index]))
    }

    Row {
        anchors.centerIn: parent
        spacing: root.gap

        Repeater {
            model: root.barCount

            delegate: Rectangle {
                required property int index
                width: root.barWidth
                height: root.minBarHeight + (root.maxBarHeight - root.minBarHeight) * root.levelAt(index)
                anchors.verticalCenter: parent.verticalCenter
                radius: width / 2
                color: root.active ? root.accentColor : root.mutedColor
                opacity: root.active ? 0.95 : 0.55
                antialiasing: true
            }
        }
    }
}
