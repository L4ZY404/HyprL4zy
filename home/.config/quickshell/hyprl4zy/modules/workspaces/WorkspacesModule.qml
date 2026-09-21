import QtQuick
import Quickshell
import Quickshell.Hyprland
import "../../components"
import "../../services"

Item {
    id: root

    required property var targetScreen
    required property real unit
    required property color backgroundColor
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    property color surfaceColor: Qt.rgba(1, 1, 1, 0.045)
    property color outlineColor: mutedColor

    readonly property real sidePadding: unit * 0.045
    readonly property real topPadding: unit * 0.12
    readonly property real tileGap: unit * 0.09
    readonly property real tileVerticalPadding: unit * 0.14
    readonly property real contentGap: unit * 0.075
    readonly property real appSize: UiScale.icon(unit * 0.38)
    readonly property real appSlotHeight: unit * 0.42
    readonly property real monitorSize: UiScale.icon(unit * 0.25)
    readonly property real monitorSlotHeight: unit * 0.28
    readonly property real minimumTileHeight: unit * 0.76
    readonly property int maxDisplayedApps: 4
    readonly property var localMonitor: Hyprland.monitorFor(targetScreen)

    readonly property int topologyRevision: WorkspaceState.revision
    readonly property int workspaceCount: workspaceModel.values.length
    property real maxHeight: unit * 6
    readonly property real naturalHeight: topPadding * 2 + workspaceModel.values.reduce(
        (total, workspace) => total + tileHeightFor(workspace), 0)
        + Math.max(0, workspaceCount - 1) * tileGap
    implicitHeight: Math.min(naturalHeight, maxHeight)

    function appIdFor(toplevel) {
        if (!toplevel)
            return ""
        if (toplevel.wayland && toplevel.wayland.appId)
            return String(toplevel.wayland.appId)
        return ""
    }

    function uniqueToplevels(workspace) {
        if (!workspace || !workspace.toplevels || !workspace.toplevels.values)
            return []

        const result = []
        const seen = Object.create(null)
        const values = workspace.toplevels.values
        for (let i = 0; i < values.length; ++i) {
            const top = values[i]
            const appId = root.appIdFor(top)
            const key = appId.length > 0 ? appId.toLowerCase() : "__unknown_" + i
            if (seen[key])
                continue
            seen[key] = true
            result.push(top)
        }
        return result
    }

    function iconFor(toplevel) {
        const appId = appIdFor(toplevel)
        const desktopEntry = appId ? DesktopEntries.heuristicLookup(appId) : null
        const candidates = [desktopEntry ? desktopEntry.icon : "", appId,
            appId.toLowerCase(), "application-x-executable"]
        for (let i = 0; i < candidates.length; ++i) {
            if (!candidates[i])
                continue
            const path = Quickshell.iconPath(candidates[i], true)
            if (path)
                return path
        }
        return Qt.resolvedUrl("../../components/ApplicationFallback.svg")
    }

    function visibleMonitors(workspace) {
        if (!workspace)
            return []

        const result = []
        const monitors = Hyprland.monitors.values || []
        for (let i = 0; i < monitors.length; ++i) {
            const monitor = monitors[i]
            if (!monitor || !monitor.activeWorkspace)
                continue
            if (monitor.activeWorkspace.id === workspace.id)
                result.push(monitor)
        }
        return result
    }

    function workspaceShouldShow(workspace) {
        if (!workspace || workspace.id <= 0)
            return false
        return root.uniqueToplevels(workspace).length > 0
            || root.visibleMonitors(workspace).length > 0
    }

    function tileHeightFor(workspace) {
        const appCount = Math.min(root.maxDisplayedApps, root.uniqueToplevels(workspace).length)
        const monitorCount = root.visibleMonitors(workspace).length
        const itemCount = appCount + monitorCount
        if (itemCount <= 0)
            return root.minimumTileHeight

        const appsHeight = appCount * root.appSlotHeight
        const monitorsHeight = monitorCount * root.monitorSlotHeight
        const gaps = Math.max(0, itemCount - 1) * root.contentGap
        return Math.max(root.minimumTileHeight,
            root.tileVerticalPadding * 2 + appsHeight + monitorsHeight + gaps)
    }

    ScriptModel {
        id: workspaceModel
        values: {
            const revision = root.topologyRevision
            return [...Hyprland.workspaces.values]
                .filter(workspace => root.workspaceShouldShow(workspace))
                .sort((a, b) => a.id - b.id)
        }
    }

    Flickable {
        id: scroll
        anchors.fill: parent
        clip: true
        contentWidth: width
        contentHeight: workspaceColumn.height + root.topPadding * 2
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.VerticalFlick

        Column {
            id: workspaceColumn
            x: root.sidePadding
            y: root.topPadding
            width: Math.max(0, scroll.width - root.sidePadding * 2)
            spacing: root.tileGap
            move: Transition {
                NumberAnimation {
                    properties: "y"
                    duration: 160
                    easing.type: Easing.OutCubic
                }
            }

            Repeater {
                model: workspaceModel

                delegate: Item {
                    id: workspaceButton
                    required property var modelData

                    width: workspaceColumn.width
                    height: root.tileHeightFor(modelData)

                    readonly property var uniqueApps: root.uniqueToplevels(modelData)
                    readonly property var monitors: root.visibleMonitors(modelData)
                    readonly property int appCount: uniqueApps.length
                    readonly property int displayedAppCount: Math.min(root.maxDisplayedApps, appCount)
                    readonly property int monitorCount: monitors.length
                    readonly property bool visibleOnMonitor: monitorCount > 0
                    readonly property bool focused: modelData.focused

                    function revealIfFocused() {
                        if (!focused)
                            return
                        const top = workspaceColumn.y + y
                        const bottom = top + height
                        if (top < scroll.contentY)
                            scroll.contentY = Math.max(0, top - root.topPadding * 0.4)
                        else if (bottom > scroll.contentY + scroll.height)
                            scroll.contentY = Math.max(0, bottom - scroll.height + root.topPadding * 0.4)
                    }

                    onFocusedChanged: if (focused) Qt.callLater(revealIfFocused)
                    Component.onCompleted: if (focused) Qt.callLater(revealIfFocused)

                    Item {
                        id: visualTile
                        x: -root.unit * 0.03
                        width: parent.width
                        height: parent.height

                        Rectangle {
                            anchors.fill: parent
                            radius: root.unit * 0.18
                            color: workspaceButton.focused
                                ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.23)
                                : root.surfaceColor
                            border.width: 0
                            antialiasing: true
                        }

                        Text {
                            anchors {
                                left: parent.left
                                leftMargin: root.unit * 0.075
                                top: parent.top
                                topMargin: root.unit * 0.05
                            }
                            text: workspaceButton.modelData.id
                            color: workspaceButton.focused ? root.foregroundColor : root.mutedColor
                            font.pixelSize: UiScale.text(root.unit * 0.13, root.unit)
                            font.weight: Font.Bold
                        }

                        Column {
                            id: contentColumn
                            anchors.centerIn: parent
                            width: parent.width
                            spacing: root.contentGap

                            Repeater {
                                model: workspaceButton.uniqueApps.slice(0, root.maxDisplayedApps)

                                delegate: Item {
                                    id: appSlot
                                    required property var modelData
                                    required property int index

                                    width: contentColumn.width
                                    height: root.appSlotHeight

                                    Image {
                                        anchors.centerIn: parent
                                        width: root.appSize
                                        height: root.appSize
                                        source: root.iconFor(appSlot.modelData)
                                        onStatusChanged: {
                                            if (status === Image.Error)
                                                source = Qt.resolvedUrl("../../components/ApplicationFallback.svg")
                                        }
                                        fillMode: Image.PreserveAspectFit
                                        smooth: true
                                        mipmap: true
                                        opacity: workspaceButton.focused ? 1.0 : 0.94
                                    }
                                }
                            }

                            Repeater {
                                model: workspaceButton.monitors

                                delegate: Item {
                                    id: monitorSlot
                                    required property var modelData
                                    required property int index

                                    width: contentColumn.width
                                    height: root.monitorSlotHeight

                                    Item {
                                        width: root.monitorSize
                                        height: root.monitorSize * 0.78
                                        anchors.centerIn: parent

                                        MonitorGlyph {
                                            anchors.fill: parent
                                            color: root.accentColor
                                        }

                                        Rectangle {
                                            visible: monitorSlot.modelData && monitorSlot.modelData.focused
                                            width: root.unit * 0.042
                                            height: width
                                            radius: width / 2
                                            color: root.accentColor
                                            anchors {
                                                right: parent.right
                                                rightMargin: -root.unit * 0.016
                                                top: parent.top
                                                topMargin: -root.unit * 0.01
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        Text {
                            visible: workspaceButton.appCount > root.maxDisplayedApps
                            anchors {
                                right: parent.right
                                rightMargin: root.unit * 0.045
                                top: parent.top
                                topMargin: root.unit * 0.022
                            }
                            text: "+" + (workspaceButton.appCount - root.maxDisplayedApps)
                            color: workspaceButton.focused ? root.foregroundColor : root.mutedColor
                            font.pixelSize: UiScale.text(root.unit * 0.085, root.unit)
                            font.weight: Font.Bold
                        }

                        Rectangle {
                            visible: workspaceButton.modelData.urgent
                            width: root.unit * 0.06
                            height: width
                            radius: width / 2
                            anchors {
                                right: parent.right
                                rightMargin: root.unit * 0.03
                                top: parent.top
                                topMargin: root.unit * 0.03
                            }
                            color: root.accentColor
                        }
                    }

                    MouseArea {
                        anchors.fill: parent
                        hoverEnabled: false
                        cursorShape: Qt.PointingHandCursor
                        onClicked: workspaceButton.modelData.activate()
                    }
                }
            }
        }
    }
}
