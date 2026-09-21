import QtQuick
import Quickshell.Services.SystemTray

Item {
    id: root

    required property real unit
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    property color surfaceColor: Qt.rgba(1, 1, 1, 0.05)

    readonly property int itemCount: SystemTray.items.values.length
    readonly property int columns: 2
    readonly property int rowCount: Math.ceil(itemCount / columns)
    readonly property real iconSize: unit * 0.27
    readonly property real cellHeight: unit * 0.43
    readonly property real columnGap: unit * 0.035
    readonly property real rowGap: unit * 0.035
    readonly property real verticalPadding: unit * 0.13
    readonly property real horizontalPadding: unit * 0.055

    readonly property real naturalHeight: itemCount > 0
        ? verticalPadding * 2
            + rowCount * cellHeight
            + Math.max(0, rowCount - 1) * rowGap
        : 0

    implicitHeight: Math.min(naturalHeight, unit * 2.2)

    Flickable {
        id: viewport
        anchors.fill: parent
        anchors.topMargin: root.verticalPadding
        anchors.bottomMargin: root.verticalPadding
        anchors.leftMargin: root.horizontalPadding
        anchors.rightMargin: root.horizontalPadding
        contentWidth: width
        contentHeight: trayGrid.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.VerticalFlick
        interactive: contentHeight > height

        Grid {
            id: trayGrid
            width: viewport.width
            columns: root.columns
            columnSpacing: root.columnGap
            rowSpacing: root.rowGap

            Repeater {
                model: SystemTray.items

                delegate: Item {
                    id: trayButton
                    required property var modelData

                    width: (trayGrid.width - root.columnGap) / 2
                    height: root.cellHeight

                    Rectangle {
                        anchors.centerIn: parent
                        width: root.unit * 0.41
                        height: width
                        radius: width * 0.30
                        color: root.surfaceColor
                        border.width: 0
                    }

                    Image {
                        anchors.centerIn: parent
                        width: root.iconSize
                        height: width
                        source: trayButton.modelData.icon
                        fillMode: Image.PreserveAspectFit
                        smooth: true
                        mipmap: true
                    }

                    MouseArea {
                        anchors.fill: parent
                        hoverEnabled: false
                        cursorShape: Qt.PointingHandCursor
                        acceptedButtons: Qt.LeftButton | Qt.MiddleButton

                        onClicked: mouse => {
                            if (mouse.button === Qt.MiddleButton)
                                trayButton.modelData.secondaryActivate()
                            else
                                trayButton.modelData.activate()
                        }
                    }
                }
            }
        }
    }
}
