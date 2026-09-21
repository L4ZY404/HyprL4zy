import QtQuick
import Quickshell
import "../components"
import "../services"

Item {
    id: root

    required property real unit
    required property color backgroundColor
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    required property color surfaceColor

    signal closeRequested()
    signal dismissed()

    property alias revealed: morph.revealed
    readonly property real revealProgress: morph.progress
    property string query: ""
    property int selectedIndex: 0
    property string filterMode: "all"
    readonly property int columns: width > unit * 11.4 ? 3 : 2
    readonly property real preferredHeight: unit * 8.18
    readonly property var filteredApplications: {
        const needle = query.trim().toLowerCase()
        const favorites = SettingsService.favoriteApps || []
        const recent = SettingsService.recentApps || []
        let source = [...DesktopEntries.applications.values]

        if (filterMode === "favorites")
            source = source.filter(entry => favorites.indexOf(root.appId(entry)) >= 0)
        else if (filterMode === "recent")
            source = source.filter(entry => recent.indexOf(root.appId(entry)) >= 0)

        const filtered = needle.length === 0 ? source : source.filter(entry => {
            const text = [
                entry.name || "",
                entry.genericName || "",
                entry.comment || "",
                entry.id || "",
                String(entry.keywords || ""),
                String(entry.categories || "")
            ].join(" ").toLowerCase()
            return text.indexOf(needle) >= 0
        })

        filtered.sort((a, b) => {
            const aId = root.appId(a)
            const bId = root.appId(b)
            const aFavorite = favorites.indexOf(aId) >= 0
            const bFavorite = favorites.indexOf(bId) >= 0
            if (filterMode !== "recent" && aFavorite !== bFavorite)
                return aFavorite ? -1 : 1

            const aRecent = recent.indexOf(aId)
            const bRecent = recent.indexOf(bId)
            if (aRecent !== bRecent) {
                if (aRecent < 0) return 1
                if (bRecent < 0) return -1
                return aRecent - bRecent
            }
            return String(a.name || "").localeCompare(String(b.name || ""))
        })
        return filtered.slice(0, 96)
    }

    clip: true

    function appId(entry) {
        return String(entry && (entry.id || entry.name) || "").trim()
    }

    function isFavorite(entry) {
        return SettingsService.isFavoriteApp(appId(entry))
    }

    function toggleFavorite(entry) {
        SettingsService.toggleFavoriteApp(appId(entry))
    }

    function prepareOpen() {
        morph.prepareOpen()
        query = ""
        selectedIndex = 0
        filterMode = "all"
        searchInput.text = ""
    }

    function openPanel() {
        morph.open()
        // Search owns focus from the first frame, even while the Studio is morphing.
        Qt.callLater(function() { searchInput.forceActiveFocus() })
    }

    function beginClose() {
        morph.close()
    }

    function snapClosed() {
        morph.snapClosed()
    }

    function clampSelection() {
        if (filteredApplications.length === 0) {
            selectedIndex = -1
            return
        }
        selectedIndex = Math.max(0, Math.min(filteredApplications.length - 1, selectedIndex))
        appGrid.currentIndex = selectedIndex
        appGrid.positionViewAtIndex(selectedIndex, GridView.Contain)
    }

    function moveSelection(delta) {
        if (filteredApplications.length === 0)
            return
        selectedIndex = Math.max(0, Math.min(filteredApplications.length - 1, selectedIndex + delta))
        appGrid.currentIndex = selectedIndex
        appGrid.positionViewAtIndex(selectedIndex, GridView.Contain)
    }

    function launchSelected() {
        if (selectedIndex < 0 || selectedIndex >= filteredApplications.length)
            return
        const entry = filteredApplications[selectedIndex]
        if (!entry)
            return
        SettingsService.recordLaunchedApp(appId(entry))
        entry.execute()
        closeRequested()
    }

    function handleKey(event) {
        switch (event.key) {
        case Qt.Key_Escape:
            closeRequested()
            event.accepted = true
            break
        case Qt.Key_Left:
            moveSelection(-1)
            event.accepted = true
            break
        case Qt.Key_Right:
            moveSelection(1)
            event.accepted = true
            break
        case Qt.Key_Up:
            moveSelection(-columns)
            event.accepted = true
            break
        case Qt.Key_Down:
            moveSelection(columns)
            event.accepted = true
            break
        case Qt.Key_PageUp:
            moveSelection(-columns * 3)
            event.accepted = true
            break
        case Qt.Key_PageDown:
            moveSelection(columns * 3)
            event.accepted = true
            break
        case Qt.Key_Return:
        case Qt.Key_Enter:
            launchSelected()
            event.accepted = true
            break
        default:
            event.accepted = false
            break
        }
    }

    onQueryChanged: {
        selectedIndex = filteredApplications.length > 0 ? 0 : -1
        Qt.callLater(clampSelection)
    }
    onFilterModeChanged: {
        selectedIndex = filteredApplications.length > 0 ? 0 : -1
        Qt.callLater(clampSelection)
    }

    Keys.onPressed: event => handleKey(event)

    StudioMorphSurface {
        id: morph
        anchors.fill: parent
        unit: root.unit
        backgroundColor: root.backgroundColor
        accentColor: root.accentColor
        compactGlyph: "󰀻"
        radius: root.unit * 0.30
        borderWidth: Math.max(1, root.unit * 0.025)
        onDismissed: root.dismissed()

        Column {
            anchors.fill: parent
            anchors.leftMargin: root.unit * 0.30
        anchors.rightMargin: root.unit * 0.30
        anchors.topMargin: root.unit * 0.28
        anchors.bottomMargin: root.unit * 0.12
        spacing: root.unit * 0.12

        Row {
            width: parent.width
            height: root.unit * 0.62

            Column {
                width: parent.width - shortcutPill.width - closeButton.width - root.unit * 0.18
                anchors.verticalCenter: parent.verticalCenter
                spacing: root.unit * 0.005

                Text {
                    text: "Application Studio"
                    color: root.accentColor
                    font.pixelSize: UiScale.text(root.unit * 0.30, root.unit)
                    font.weight: Font.Bold
                }
                Text {
                    text: "Search, pin and launch without leaving the keyboard."
                    color: root.mutedColor
                    font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
                }
            }

            Rectangle {
                id: shortcutPill
                width: root.unit * 1.42
                height: root.unit * 0.34
                anchors.verticalCenter: parent.verticalCenter
                radius: height / 2
                color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.12)
                Text {
                    anchors.centerIn: parent
                    text: "SUPER + SPACE"
                    color: root.mutedColor
                    font.pixelSize: UiScale.text(root.unit * 0.085, root.unit)
                    font.weight: Font.DemiBold
                }
            }

            Item { width: root.unit * 0.10; height: 1 }

            Rectangle {
                id: closeButton
                width: root.unit * 0.40
                height: width
                anchors.verticalCenter: parent.verticalCenter
                radius: width / 2
                color: closeMouse.containsMouse
                    ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.16)
                    : root.surfaceColor
                Text {
                    anchors.centerIn: parent
                    text: "×"
                    color: root.foregroundColor
                    font.pixelSize: UiScale.text(root.unit * 0.19, root.unit)
                }
                MouseArea {
                    id: closeMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.closeRequested()
                }
            }
        }

        Rectangle {
            width: parent.width
            height: root.unit * 0.62
            radius: root.unit * 0.16
            color: Qt.rgba(root.surfaceColor.r, root.surfaceColor.g, root.surfaceColor.b, 0.96)
            border.width: 0

            Text {
                anchors.left: parent.left
                anchors.leftMargin: root.unit * 0.17
                anchors.verticalCenter: parent.verticalCenter
                text: "⌕"
                color: root.accentColor
                font.pixelSize: UiScale.text(root.unit * 0.22, root.unit)
            }

            TextInput {
                id: searchInput
                anchors.fill: parent
                anchors.leftMargin: root.unit * 0.50
                anchors.rightMargin: root.unit * 0.16
                verticalAlignment: TextInput.AlignVCenter
                color: root.foregroundColor
                selectionColor: root.accentColor
                selectedTextColor: root.backgroundColor
                font.pixelSize: UiScale.text(root.unit * 0.155, root.unit)
                clip: true
                onTextChanged: root.query = text
                Keys.onPressed: event => root.handleKey(event)

                Text {
                    anchors.fill: parent
                    verticalAlignment: Text.AlignVCenter
                    visible: searchInput.text.length === 0
                    text: "Search applications…"
                    color: root.mutedColor
                    font.pixelSize: searchInput.font.pixelSize
                }
            }
        }

        Row {
            width: parent.width
            height: root.unit * 0.43
            spacing: root.unit * 0.08

            PanelButton {
                width: root.unit * 1.16
                unit: root.unit
                accentColor: root.accentColor
                foregroundColor: root.foregroundColor
                surfaceColor: root.surfaceColor
                text: "All apps"
                selected: root.filterMode === "all"
                onClicked: { root.filterMode = "all"; searchInput.forceActiveFocus() }
            }
            PanelButton {
                width: root.unit * 1.34
                unit: root.unit
                accentColor: root.accentColor
                foregroundColor: root.foregroundColor
                surfaceColor: root.surfaceColor
                text: "★ Favorites"
                selected: root.filterMode === "favorites"
                onClicked: { root.filterMode = "favorites"; searchInput.forceActiveFocus() }
            }
            PanelButton {
                width: root.unit * 1.08
                unit: root.unit
                accentColor: root.accentColor
                foregroundColor: root.foregroundColor
                surfaceColor: root.surfaceColor
                text: "Recent"
                selected: root.filterMode === "recent"
                onClicked: { root.filterMode = "recent"; searchInput.forceActiveFocus() }
            }

            Item { width: Math.max(0, parent.width - root.unit * 4.12 - appCount.implicitWidth); height: 1 }

            Text {
                id: appCount
                anchors.verticalCenter: parent.verticalCenter
                text: root.filteredApplications.length + " apps"
                color: root.mutedColor
                font.pixelSize: UiScale.text(root.unit * 0.10, root.unit)
            }
        }

        Rectangle {
            width: parent.width
            height: root.unit * 5.50
            radius: root.unit * 0.18
            color: Qt.rgba(root.surfaceColor.r, root.surfaceColor.g, root.surfaceColor.b, 0.42)
            clip: true

            GridView {
                id: appGrid
                anchors.fill: parent
                anchors.margins: root.unit * 0.08
                clip: true
                cellWidth: width / root.columns
                cellHeight: root.unit * 1.10
                model: ScriptModel { values: root.filteredApplications }
                currentIndex: root.selectedIndex
                boundsBehavior: Flickable.StopAtBounds

                delegate: Item {
                    id: tileCell
                    required property int index
                    required property var modelData
                    width: appGrid.cellWidth
                    height: appGrid.cellHeight

                    Rectangle {
                        id: tile
                        anchors.fill: parent
                        anchors.margins: root.unit * 0.045
                        radius: root.unit * 0.15
                        color: root.selectedIndex === tileCell.index
                            ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.12)
                            : root.surfaceColor
                        border.width: 0

                        Rectangle {
                            anchors.left: parent.left
                            anchors.top: parent.top
                            anchors.bottom: parent.bottom
                            anchors.topMargin: root.unit * 0.13
                            anchors.bottomMargin: root.unit * 0.13
                            width: Math.max(2, root.unit * 0.028)
                            radius: width / 2
                            visible: root.selectedIndex === tileCell.index
                            color: root.accentColor
                        }

                        Row {
                            anchors.fill: parent
                            anchors.leftMargin: root.unit * 0.16
                            anchors.rightMargin: root.unit * 0.12
                            anchors.topMargin: root.unit * 0.11
                            anchors.bottomMargin: root.unit * 0.11
                            spacing: root.unit * 0.13

                            Rectangle {
                                width: root.unit * 0.62
                                height: width
                                anchors.verticalCenter: parent.verticalCenter
                                radius: root.unit * 0.13
                                color: Qt.rgba(root.backgroundColor.r, root.backgroundColor.g, root.backgroundColor.b, 0.42)

                                Image {
                                    id: appIcon
                                    anchors.centerIn: parent
                                    width: parent.width * 0.78
                                    height: width
                                    source: tileCell.modelData.icon ? Quickshell.iconPath(tileCell.modelData.icon, true) : ""
                                    fillMode: Image.PreserveAspectFit
                                    asynchronous: true
                                    visible: status === Image.Ready
                                }
                                Text {
                                    anchors.centerIn: parent
                                    visible: appIcon.status !== Image.Ready
                                    text: "•"
                                    color: root.accentColor
                                    font.pixelSize: UiScale.text(root.unit * 0.28, root.unit)
                                }
                            }

                            Column {
                                width: parent.width - root.unit * 1.12
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: root.unit * 0.018

                                Text {
                                    width: parent.width
                                    text: tileCell.modelData.name || tileCell.modelData.id
                                    color: root.foregroundColor
                                    font.pixelSize: UiScale.text(root.unit * 0.145, root.unit)
                                    font.weight: root.selectedIndex === tileCell.index ? Font.DemiBold : Font.Medium
                                    elide: Text.ElideRight
                                }
                                Text {
                                    width: parent.width
                                    text: tileCell.modelData.comment || tileCell.modelData.genericName || "Application"
                                    color: root.mutedColor
                                    font.pixelSize: UiScale.text(root.unit * 0.095, root.unit)
                                    maximumLineCount: 1
                                    elide: Text.ElideRight
                                }
                            }

                            Text {
                                width: root.unit * 0.20
                                anchors.verticalCenter: parent.verticalCenter
                                text: root.isFavorite(tileCell.modelData) ? "★" : "☆"
                                color: root.isFavorite(tileCell.modelData) ? root.accentColor : root.mutedColor
                                font.pixelSize: UiScale.text(root.unit * 0.15, root.unit)
                                horizontalAlignment: Text.AlignHCenter
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            hoverEnabled: true
                            acceptedButtons: Qt.LeftButton | Qt.RightButton
                            cursorShape: Qt.PointingHandCursor
                            onEntered: root.selectedIndex = tileCell.index
                            onClicked: mouse => {
                                root.selectedIndex = tileCell.index
                                if (mouse.button === Qt.RightButton)
                                    root.toggleFavorite(tileCell.modelData)
                                else
                                    root.launchSelected()
                            }
                        }
                    }
                }

                Text {
                    anchors.centerIn: parent
                    visible: root.filteredApplications.length === 0
                    text: root.filterMode === "favorites" && !root.query.length
                        ? "Pin applications with right click to see them here"
                        : root.filterMode === "recent" && !root.query.length
                            ? "Recently launched applications will appear here"
                            : "No matching applications"
                    color: root.mutedColor
                    font.pixelSize: UiScale.text(root.unit * 0.145, root.unit)
                }
            }
        }
    }
    }
}
