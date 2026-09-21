import QtQuick
import Quickshell
import Quickshell.Services.SystemTray
import "../../services"

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
    readonly property real iconSize: UiScale.icon(unit * 0.27)
    readonly property real cellHeight: unit * 0.43
    readonly property real columnGap: unit * 0.035
    readonly property real rowGap: unit * 0.035
    readonly property real horizontalPadding: unit * 0.055
    readonly property real gridHeight: itemCount > 0
        ? rowCount * cellHeight + Math.max(0, rowCount - 1) * rowGap
        : 0

    // EdgeIsland owns the outer vertical padding. Keep the tray's implicit
    // height equal to its actual rows so Bar.qml can size the island without
    // double-counting or clipping that padding.
    implicitHeight: Math.min(gridHeight, unit * 2.2)

    Flickable {
        id: viewport
        anchors.fill: parent
        anchors.leftMargin: root.horizontalPadding
        anchors.rightMargin: root.horizontalPadding
        contentWidth: width
        contentHeight: Math.max(height, root.gridHeight)
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.VerticalFlick
        interactive: root.gridHeight > height + 0.5

        Item {
            id: trayGrid
            width: viewport.width
            height: root.gridHeight
            y: root.gridHeight <= viewport.height
                ? Math.max(0, (viewport.height - root.gridHeight) / 2)
                : 0

            readonly property real cellWidth: Math.max(1, (width - root.columnGap) / root.columns)

            Repeater {
                model: SystemTray.items

                delegate: Item {
                    id: trayButton
                    required property int index
                    required property var modelData

                    readonly property int rowIndex: Math.floor(index / root.columns)
                    readonly property int columnIndex: index % root.columns
                    readonly property bool singleItemRow: root.itemCount % root.columns === 1
                        && rowIndex === root.rowCount - 1

                    width: trayGrid.cellWidth
                    height: root.cellHeight
                    x: singleItemRow
                        ? (trayGrid.width - width) / 2
                        : columnIndex * (width + root.columnGap)
                    y: rowIndex * (root.cellHeight + root.rowGap)

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

                    QsMenuAnchor {
                        id: trayMenu
                        menu: trayButton.modelData.menu
                        anchor.item: trayButton
                        anchor.adjustment: PopupAdjustment.Flip | PopupAdjustment.Slide
                    }

                    MouseArea {
                        id: pointerArea
                        anchors.fill: parent
                        hoverEnabled: false
                        preventStealing: true
                        cursorShape: Qt.PointingHandCursor
                        acceptedButtons: Qt.LeftButton | Qt.MiddleButton | Qt.RightButton

                        function openMenu() {
                            if (trayButton.modelData.menu)
                                trayMenu.open()
                        }

                        onPressed: mouse => {
                            // Open on press so the right-button context event cannot be
                            // swallowed later by Qt/Wayland context-menu synthesis.
                            if (mouse.button === Qt.RightButton) {
                                openMenu()
                                mouse.accepted = true
                            }
                        }

                        onClicked: mouse => {
                            if (mouse.button === Qt.RightButton) {
                                mouse.accepted = true
                                return
                            }

                            if (mouse.button === Qt.MiddleButton) {
                                trayButton.modelData.secondaryActivate()
                                mouse.accepted = true
                                return
                            }

                            if (trayButton.modelData.onlyMenu && trayButton.modelData.menu)
                                openMenu()
                            else
                                trayButton.modelData.activate()

                            mouse.accepted = true
                        }
                    }
                }
            }
        }
    }
}
