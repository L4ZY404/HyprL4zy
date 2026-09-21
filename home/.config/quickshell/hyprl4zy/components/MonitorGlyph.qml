import QtQuick

Item {
    id: root

    property color color: "#6791a9"
    property real strokeWidth: Math.max(1, Math.round(width * 0.075))

    // Keep the display and stand as separate aligned primitives so the icon
    // stays readable at the very small sizes used inside workspace pills.
    Rectangle {
        id: display
        anchors {
            left: parent.left
            right: parent.right
            top: parent.top
        }
        height: parent.height * 0.66
        radius: Math.max(1, Math.round(width * 0.09))
        color: "transparent"
        border.width: root.strokeWidth
        border.color: root.color
        antialiasing: false
    }

    Rectangle {
        anchors {
            horizontalCenter: parent.horizontalCenter
            top: display.bottom
            topMargin: -root.strokeWidth * 0.25
        }
        width: root.strokeWidth
        height: parent.height * 0.17
        radius: width / 2
        color: root.color
        antialiasing: false
    }

    Rectangle {
        anchors {
            horizontalCenter: parent.horizontalCenter
            bottom: parent.bottom
        }
        width: parent.width * 0.50
        height: root.strokeWidth
        radius: height / 2
        color: root.color
        antialiasing: false
    }
}
