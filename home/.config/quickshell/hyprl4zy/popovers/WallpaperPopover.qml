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
    property int selectedIndex: -1
    readonly property var selectedEntry: selectedIndex >= 0 && selectedIndex < WallpaperService.entries.length
        ? WallpaperService.entries[selectedIndex]
        : null
    readonly property string selectedWallpaper: selectedEntry ? String(selectedEntry.path || "") : ""
    readonly property real preferredHeight: unit * 7.62

    clip: true

    function wrappedIndex(index) {
        const total = WallpaperService.entries.length
        if (!total)
            return -1
        return ((index % total) + total) % total
    }

    function circularOffset(index) {
        const total = WallpaperService.entries.length
        if (total <= 1 || selectedIndex < 0)
            return 0
        let diff = index - selectedIndex
        const half = total / 2
        while (diff > half) diff -= total
        while (diff < -half) diff += total
        return diff
    }

    function cardWidth(distance) {
        if (distance === 0) return unit * 5.48
        if (distance === 1) return unit * 3.02
        if (distance === 2) return unit * 2.12
        return unit * 1.56
    }

    function cardHeight(distance) {
        if (distance === 0) return unit * 3.72
        if (distance === 1) return unit * 2.52
        if (distance === 2) return unit * 1.90
        return unit * 1.52
    }

    function cardOpacity(distance) {
        if (distance === 0) return 1.0
        if (distance === 1) return 0.74
        if (distance === 2) return 0.40
        if (distance === 3) return 0.14
        return 0.0
    }

    function cardX(offset, width, stageWidth) {
        const distance = Math.abs(offset)
        const center = stageWidth / 2
        if (distance === 0)
            return center - width / 2

        const direction = offset < 0 ? -1 : 1
        const gap = unit * 0.14
        let cursor = center + direction * (cardWidth(0) / 2 + gap)
        for (let step = 1; step < distance; ++step)
            cursor += direction * (cardWidth(step) + gap)
        return direction > 0 ? cursor : cursor - width
    }

    function selectCurrent() {
        const current = SettingsService.currentWallpaper
        let next = WallpaperService.entries.length ? 0 : -1
        if (current.length) {
            for (let i = 0; i < WallpaperService.entries.length; ++i) {
                if (WallpaperService.entries[i].path === current) {
                    next = i
                    break
                }
            }
        }
        selectedIndex = next
    }

    function prepareOpen() {
        morph.prepareOpen()
        directoryInput.text = WallpaperService.directory
        WallpaperService.refreshBackend()
        WallpaperService.refresh()
    }

    function openPanel() {
        morph.open()
        Qt.callLater(selectCurrent)
    }

    function beginClose() {
        morph.close()
    }

    function snapClosed() {
        morph.snapClosed()
    }

    function moveSelection(delta) {
        if (!WallpaperService.entries.length)
            return
        const base = selectedIndex >= 0 ? selectedIndex : 0
        selectedIndex = wrappedIndex(base + delta)
    }

    function applySelected() {
        if (selectedWallpaper.length)
            WallpaperService.apply(selectedWallpaper)
    }

    Keys.onEscapePressed: closeRequested()
    Keys.onLeftPressed: moveSelection(-1)
    Keys.onRightPressed: moveSelection(1)
    Keys.onReturnPressed: applySelected()
    Keys.onEnterPressed: applySelected()

    Connections {
        target: WallpaperService
        function onEntriesChanged() { root.selectCurrent() }
    }

    StudioMorphSurface {
        id: morph
        anchors.fill: parent
        unit: root.unit
        backgroundColor: root.backgroundColor
        accentColor: root.accentColor
        compactGlyph: ""
        radius: root.unit * 0.30
        borderWidth: Math.max(1, root.unit * 0.025)
        onDismissed: root.dismissed()

        Column {
            anchors.fill: parent
            anchors.margins: root.unit * 0.27
        spacing: root.unit * 0.11

        Row {
            width: parent.width
            height: root.unit * 0.54

            Column {
                width: parent.width - backendLabel.implicitWidth
                anchors.verticalCenter: parent.verticalCenter
                spacing: root.unit * 0.01

                Text {
                    text: "Wallpaper Studio"
                    color: root.accentColor
                    font.pixelSize: UiScale.text(root.unit * 0.29, root.unit)
                    font.weight: Font.Bold
                }
                Text {
                    text: "Images, WebP and live video wallpapers"
                    color: root.mutedColor
                    font.pixelSize: UiScale.text(root.unit * 0.11, root.unit)
                }
            }

            Row {
                id: backendLabel
                anchors.verticalCenter: parent.verticalCenter
                spacing: root.unit * 0.08

                Rectangle {
                    width: root.unit * 1.08
                    height: root.unit * 0.32
                    radius: height / 2
                    color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.12)
                    Text {
                        anchors.centerIn: parent
                        text: "SUPER + W"
                        color: root.mutedColor
                        font.pixelSize: UiScale.text(root.unit * 0.085, root.unit)
                        font.weight: Font.DemiBold
                    }
                }

                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: WallpaperService.backend.toUpperCase()
                        + (WallpaperService.mpvpaperAvailable ? " · VIDEO" : "")
                        + (WallpaperService.pywalAvailable ? " · PYWAL" : "")
                    color: WallpaperService.available ? root.mutedColor : root.accentColor
                    font.pixelSize: UiScale.text(root.unit * 0.095, root.unit)
                    font.weight: Font.DemiBold
                }
            }
        }

        Row {
            width: parent.width
            height: root.unit * 0.50
            spacing: root.unit * 0.08

            Rectangle {
                width: parent.width - root.unit * 3.60
                height: parent.height
                radius: root.unit * 0.14
                color: root.surfaceColor
                border.width: 0

                TextInput {
                    id: directoryInput
                    anchors.fill: parent
                    anchors.leftMargin: root.unit * 0.16
                    anchors.rightMargin: root.unit * 0.16
                    verticalAlignment: TextInput.AlignVCenter
                    color: root.foregroundColor
                    selectionColor: root.accentColor
                    selectedTextColor: root.backgroundColor
                    font.pixelSize: UiScale.text(root.unit * 0.13, root.unit)
                    clip: true
                    onAccepted: {
                        text = WallpaperService.setDirectory(text)
                        WallpaperService.refresh()
                    }
                }
            }

            PanelButton {
                width: root.unit * 0.82
                unit: root.unit
                accentColor: root.accentColor
                foregroundColor: root.foregroundColor
                surfaceColor: root.surfaceColor
                text: "Folder"
                onClicked: WallpaperService.openFolder()
            }
            PanelButton {
                width: root.unit * 0.82
                unit: root.unit
                accentColor: root.accentColor
                foregroundColor: root.foregroundColor
                surfaceColor: root.surfaceColor
                text: "Random"
                enabled: WallpaperService.entries.length > 0 && !WallpaperService.applying
                onClicked: WallpaperService.applyRandom()
            }
            PanelButton {
                width: root.unit * 0.82
                unit: root.unit
                accentColor: root.accentColor
                foregroundColor: root.foregroundColor
                surfaceColor: root.surfaceColor
                text: WallpaperService.scanning ? "…" : "Refresh"
                enabled: !WallpaperService.scanning && !WallpaperService.applying
                onClicked: {
                    directoryInput.text = WallpaperService.setDirectory(directoryInput.text)
                    WallpaperService.refresh()
                }
            }
            PanelButton {
                width: root.unit * 0.82
                unit: root.unit
                accentColor: root.accentColor
                foregroundColor: root.foregroundColor
                surfaceColor: root.surfaceColor
                text: WallpaperService.applying ? "…" : "Apply"
                enabled: root.selectedWallpaper.length > 0 && !WallpaperService.applying
                selected: root.selectedWallpaper === SettingsService.currentWallpaper
                onClicked: root.applySelected()
            }
        }

        Rectangle {
            id: stageShell
            width: parent.width
            height: root.unit * 4.50
            radius: root.unit * 0.19
            color: Qt.rgba(root.surfaceColor.r, root.surfaceColor.g, root.surfaceColor.b, 0.52)
            clip: true

            Item {
                id: carouselStage
                anchors.fill: parent
                anchors.margins: root.unit * 0.08
                clip: true

                Repeater {
                    model: ScriptModel { values: WallpaperService.entries }

                    delegate: Item {
                        id: cardSlot
                        required property int index
                        required property var modelData

                        readonly property int cardOffset: root.circularOffset(index)
                        readonly property int cardDistance: Math.abs(cardOffset)
                        readonly property real targetWidth: root.cardWidth(cardDistance)
                        readonly property real targetHeight: root.cardHeight(cardDistance)

                        x: root.cardX(cardOffset, targetWidth, carouselStage.width)
                        y: (carouselStage.height - targetHeight) / 2
                        width: targetWidth
                        height: targetHeight
                        opacity: root.cardOpacity(cardDistance)
                        visible: cardDistance <= 3
                        z: 20 - cardDistance

                        Behavior on x {
                            NumberAnimation { duration: SettingsService.animations ? 390 : 0; easing.type: Easing.OutQuart }
                        }
                        Behavior on y {
                            NumberAnimation { duration: SettingsService.animations ? 390 : 0; easing.type: Easing.OutQuart }
                        }
                        Behavior on width {
                            NumberAnimation { duration: SettingsService.animations ? 360 : 0; easing.type: Easing.OutQuart }
                        }
                        Behavior on height {
                            NumberAnimation { duration: SettingsService.animations ? 360 : 0; easing.type: Easing.OutQuart }
                        }
                        Behavior on opacity {
                            NumberAnimation { duration: SettingsService.animations ? 280 : 0; easing.type: Easing.OutCubic }
                        }

                        Rectangle {
                            id: card
                            anchors.fill: parent
                            radius: root.unit * 0.18
                            color: root.surfaceColor
                            border.width: cardSlot.cardDistance === 0
                                ? Math.max(1, root.unit * 0.026)
                                : 0
                            border.color: root.accentColor
                            clip: true

                            Image {
                                id: preview
                                anchors.fill: parent
                                anchors.bottomMargin: root.unit * 0.44
                                source: cardSlot.visible && cardSlot.modelData.preview
                                    ? "file://" + cardSlot.modelData.preview
                                    : ""
                                fillMode: Image.PreserveAspectCrop
                                asynchronous: true
                                cache: true
                            }

                            Rectangle {
                                anchors.fill: preview
                                visible: !cardSlot.modelData.preview || preview.status === Image.Error
                                color: root.surfaceColor
                                Text {
                                    anchors.centerIn: parent
                                    text: cardSlot.modelData.kind === "video" ? "▶" : "◫"
                                    color: root.accentColor
                                    font.pixelSize: UiScale.text(root.unit * (cardSlot.cardDistance === 0 ? 0.50 : 0.32), root.unit)
                                }
                            }

                            Rectangle {
                                visible: cardSlot.modelData.kind === "video" && cardSlot.cardDistance <= 1
                                anchors.top: parent.top
                                anchors.left: parent.left
                                anchors.margins: root.unit * 0.09
                                width: root.unit * 0.62
                                height: root.unit * 0.24
                                radius: height / 2
                                color: Qt.rgba(root.backgroundColor.r, root.backgroundColor.g, root.backgroundColor.b, 0.86)
                                Text {
                                    anchors.centerIn: parent
                                    text: "VIDEO"
                                    color: root.accentColor
                                    font.pixelSize: UiScale.text(root.unit * 0.085, root.unit)
                                    font.weight: Font.Bold
                                }
                            }

                            Rectangle {
                                anchors.left: parent.left
                                anchors.right: parent.right
                                anchors.bottom: parent.bottom
                                height: root.unit * 0.44
                                color: Qt.rgba(root.backgroundColor.r, root.backgroundColor.g, root.backgroundColor.b, 0.92)

                                Text {
                                    anchors.fill: parent
                                    anchors.leftMargin: root.unit * 0.11
                                    anchors.rightMargin: root.unit * 0.11
                                    verticalAlignment: Text.AlignVCenter
                                    text: WallpaperService.fileName(cardSlot.modelData.path)
                                    color: root.foregroundColor
                                    font.pixelSize: UiScale.text(root.unit * (cardSlot.cardDistance === 0 ? 0.105 : 0.085), root.unit)
                                    font.weight: cardSlot.cardDistance === 0 ? Font.DemiBold : Font.Normal
                                    elide: Text.ElideMiddle
                                }
                            }

                            Rectangle {
                                visible: SettingsService.currentWallpaper === cardSlot.modelData.path
                                width: root.unit * 0.30
                                height: width
                                radius: width / 2
                                anchors.top: parent.top
                                anchors.right: parent.right
                                anchors.margins: root.unit * 0.09
                                color: root.accentColor
                                Text {
                                    anchors.centerIn: parent
                                    text: "✓"
                                    color: root.backgroundColor
                                    font.pixelSize: UiScale.text(root.unit * 0.15, root.unit)
                                    font.bold: true
                                }
                            }

                            MouseArea {
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    if (root.selectedIndex === cardSlot.index)
                                        root.applySelected()
                                    else
                                        root.selectedIndex = cardSlot.index
                                }
                            }
                        }
                    }
                }

                Rectangle {
                    id: previousButton
                    anchors.left: parent.left
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.leftMargin: root.unit * 0.06
                    width: root.unit * 0.46
                    height: width
                    radius: width / 2
                    color: previousMouse.containsMouse
                        ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.20)
                        : Qt.rgba(root.backgroundColor.r, root.backgroundColor.g, root.backgroundColor.b, 0.74)
                    visible: WallpaperService.entries.length > 1
                    z: 70
                    Text {
                        anchors.centerIn: parent
                        text: "‹"
                        color: root.foregroundColor
                        font.pixelSize: UiScale.text(root.unit * 0.28, root.unit)
                    }
                    MouseArea {
                        id: previousMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.moveSelection(-1)
                    }
                }

                Rectangle {
                    id: nextButton
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.rightMargin: root.unit * 0.06
                    width: root.unit * 0.46
                    height: width
                    radius: width / 2
                    color: nextMouse.containsMouse
                        ? Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.20)
                        : Qt.rgba(root.backgroundColor.r, root.backgroundColor.g, root.backgroundColor.b, 0.74)
                    visible: WallpaperService.entries.length > 1
                    z: 70
                    Text {
                        anchors.centerIn: parent
                        text: "›"
                        color: root.foregroundColor
                        font.pixelSize: UiScale.text(root.unit * 0.28, root.unit)
                    }
                    MouseArea {
                        id: nextMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.moveSelection(1)
                    }
                }

                MouseArea {
                    anchors.fill: parent
                    z: 60
                    acceptedButtons: Qt.NoButton
                    propagateComposedEvents: true
                    onWheel: wheel => {
                        if (wheel.angleDelta.y > 0 || wheel.angleDelta.x < 0)
                            root.moveSelection(-1)
                        else if (wheel.angleDelta.y < 0 || wheel.angleDelta.x > 0)
                            root.moveSelection(1)
                        wheel.accepted = true
                    }
                }

                Text {
                    anchors.centerIn: parent
                    visible: !WallpaperService.scanning && WallpaperService.entries.length === 0
                    text: WallpaperService.errorText.length
                        ? WallpaperService.errorText
                        : "No supported wallpapers found"
                    width: parent.width * 0.78
                    horizontalAlignment: Text.AlignHCenter
                    wrapMode: Text.WordWrap
                    color: root.mutedColor
                    font.pixelSize: UiScale.text(root.unit * 0.15, root.unit)
                }
            }
        }

        Column {
            width: parent.width
            height: root.unit * 0.52
            spacing: root.unit * 0.01

            Text {
                width: parent.width
                text: root.selectedEntry ? WallpaperService.fileName(root.selectedEntry.path) : "No wallpapers found"
                color: root.foregroundColor
                font.pixelSize: UiScale.text(root.unit * 0.18, root.unit)
                font.weight: Font.DemiBold
                horizontalAlignment: Text.AlignHCenter
                elide: Text.ElideMiddle
            }
            Text {
                width: parent.width
                text: root.selectedEntry
                    ? WallpaperService.kindLabel(root.selectedEntry.kind)
                        + (root.selectedWallpaper === SettingsService.currentWallpaper ? " · Current" : " · Enter or click center to apply")
                    : "Choose a wallpaper directory above"
                color: root.mutedColor
                font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
                horizontalAlignment: Text.AlignHCenter
            }
        }

        Row {
            width: parent.width
            height: root.unit * 0.24

            Text {
                width: parent.width * 0.72
                anchors.verticalCenter: parent.verticalCenter
                text: WallpaperService.errorText.length > 0
                    ? WallpaperService.errorText
                    : WallpaperService.statusText
                color: WallpaperService.errorText.length > 0 ? root.accentColor : root.mutedColor
                font.pixelSize: UiScale.text(root.unit * 0.095, root.unit)
                elide: Text.ElideRight
            }
            Text {
                width: parent.width * 0.28
                anchors.verticalCenter: parent.verticalCenter
                text: WallpaperService.entries.length
                    ? (root.selectedIndex + 1) + " / " + WallpaperService.entries.length
                    : "0 / 0"
                color: root.mutedColor
                font.pixelSize: UiScale.text(root.unit * 0.095, root.unit)
                horizontalAlignment: Text.AlignRight
            }
        }
    }
    }
}
