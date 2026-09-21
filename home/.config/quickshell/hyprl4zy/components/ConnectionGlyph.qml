import QtQuick
import QtQuick.Shapes

Item {
    id: root

    property string kind: "wifi"
    property color color: "#6791a9"
    property bool disabled: false

    readonly property real sourceSize: 24
    readonly property real scaleFactor: Math.min(width, height) / sourceSize

    Shape {
        visible: root.kind === "wifi"
        anchors.centerIn: parent
        width: root.sourceSize
        height: root.sourceSize
        scale: root.scaleFactor
        transformOrigin: Item.Center

        ShapePath {
            fillColor: root.color
            strokeColor: "transparent"

            PathSvg {
                path: "M 1 9 L 3 11 C 8 6 16 6 21 11 L 23 9 C 16.84 2.84 7.16 2.84 1 9 Z M 5 13 L 7 15 C 9.76 12.24 14.24 12.24 17 15 L 19 13 C 15.13 9.13 8.87 9.13 5 13 Z M 9 17 L 12 20 L 15 17 C 13.34 15.34 10.66 15.34 9 17 Z"
            }
        }
    }

    Shape {
        visible: root.kind === "bluetooth"
        anchors.centerIn: parent
        width: root.sourceSize
        height: root.sourceSize
        scale: root.scaleFactor
        transformOrigin: Item.Center

        ShapePath {
            fillColor: root.color
            strokeColor: "transparent"

            PathSvg {
                path: "M 12 2 L 17.71 7.71 L 13.41 12 L 17.71 16.29 L 12 22 L 12 14.83 L 7.83 19 L 6.41 17.59 L 11 13 L 6.41 8.41 L 7.83 7 L 12 11.17 Z M 14 6.83 L 14 9.17 L 15.17 8 Z M 14 14.83 L 14 17.17 L 15.17 16 Z"
            }
        }
    }

    Rectangle {
        visible: root.disabled
        anchors.centerIn: parent
        width: root.width * 0.88
        height: Math.max(2, root.width * 0.075)
        radius: height / 2
        rotation: 45
        color: root.color
        antialiasing: true
    }
}
