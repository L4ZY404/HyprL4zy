import QtQuick

Item {
    id: root

    required property color backgroundColor
    required property color accentColor
    property real radius: 18
    property real borderWidth: 1
    property color borderColor: backgroundColor
    property bool attachedToTop: false
    property real mergeDepth: Math.max(radius + borderWidth, radius * 1.55)

    clip: true

    Rectangle {
        anchors.fill: parent
        radius: root.radius
        color: root.borderColor
        antialiasing: true
    }

    Rectangle {
        anchors.fill: parent
        anchors.margins: root.borderWidth
        radius: Math.max(0, root.radius - root.borderWidth)
        color: root.backgroundColor
        antialiasing: true
    }

    // The first toast is physically attached to the monitor edge. Flatten its
    // upper corners and remove the top outline so it reads like the Studio
    // surfaces, only mirrored vertically.
    Rectangle {
        visible: root.attachedToTop
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        height: root.mergeDepth
        color: root.backgroundColor
    }
}
