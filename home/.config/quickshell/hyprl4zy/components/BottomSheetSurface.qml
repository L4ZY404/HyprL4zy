import QtQuick

Item {
    id: root

    required property color backgroundColor
    required property color accentColor
    property real radius: 18
    property real borderWidth: 1
    // Studio outline and screen membrane are the same shell material.
    // Keep this configurable, but default it to the live Pywal @background.
    property color borderColor: backgroundColor
    // Keep the Studio side border away from the membrane contact zone.
    // The collar can rise slightly above the corner radius, so the merge zone
    // must be deeper than the old radius-only cover.
    property real mergeDepth: Math.max(radius + borderWidth, radius * 1.72)

    clip: true

    Rectangle {
        id: outer
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

    // Bottom-anchored Studio surfaces intentionally have no bottom border and
    // square lower corners so they read as a sheet extending from the screen edge.
    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: root.mergeDepth
        color: root.backgroundColor
    }

    // Do not redraw the lower side borders over the bottom merge zone. The
    // rounded top/sides keep the Studio identity while the deeper lower section
    // becomes the same @background material as the screen membrane. This keeps
    // the join clean even at the membrane's maximum open depth.
}
