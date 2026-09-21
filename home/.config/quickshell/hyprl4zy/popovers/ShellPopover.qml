import QtQuick
import "../services"
import "../components"

Rectangle {
    id: root
    required property real unit
    required property color backgroundColor
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    required property color surfaceColor
    property bool paletteAvailable: false
    property var walColors: ({})
    signal launcherRequested()
    signal wallpaperRequested()
    signal notificationsRequested()
    signal powerRequested()
    signal closeRequested()

    readonly property real naturalHeight: content.implicitHeight + unit * 0.52
    readonly property real preferredHeight: Math.min(naturalHeight, unit * 4.55)

    radius: unit * 0.28
    color: backgroundColor
    border.width: Math.max(1, unit * 0.025)
    border.color: backgroundColor
    clip: true

    function wrappedSlot(value) {
        return ((value % 16) + 16) % 16
    }

    function paletteColor(slot) {
        const key = "color" + wrappedSlot(slot)
        const value = walColors ? walColors[key] : ""
        return typeof value === "string" && value.length > 0 ? value : accentColor
    }

    function selectSlot(slot) {
        // @background is owned by the wallpaper and is never an accent option.
        // The selector only addresses the sixteen Pywal @colorN slots.
        SettingsService.accentSlot = wrappedSlot(slot)
    }

    Flickable {
        id: scroller
        anchors.fill: parent
        anchors.margins: root.unit * 0.26
        anchors.rightMargin: root.unit * 0.31
        clip: true
        contentWidth: width
        contentHeight: content.implicitHeight
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.VerticalFlick
        interactive: contentHeight > height + 1

        Column {
            id: content
            width: scroller.width
            spacing: root.unit * 0.15

            Text { text: "hyprl4zy"; color: root.accentColor; font.pixelSize: UiScale.text(root.unit * 0.3, root.unit); font.bold: true }
            Text { text: "Theme / Shell"; color: root.mutedColor; font.pixelSize: UiScale.text(root.unit * 0.15, root.unit)}

            Text {
                width: parent.width
                text: root.paletteAvailable
                    ? "Wallpaper owns background · accent @color" + SettingsService.accentSlot
                    : "Pywal palette unavailable · fallback colors active"
                color: root.mutedColor
                font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
                wrapMode: Text.WordWrap
            }

            Rectangle {
                width: parent.width
                height: root.unit * 0.72
                radius: root.unit * 0.16
                color: root.surfaceColor

                Row {
                    anchors.fill: parent
                    anchors.margins: root.unit * 0.10
                    spacing: root.unit * 0.045

                    PanelButton {
                        width: root.unit * 0.42
                        unit: root.unit
                        accentColor: root.accentColor
                        foregroundColor: root.foregroundColor
                        surfaceColor: root.surfaceColor
                        text: "‹"
                        enabled: SettingsService.ready && root.paletteAvailable
                        onClicked: root.selectSlot(SettingsService.accentSlot - 1)
                    }

                    Repeater {
                        model: 5
                        delegate: Rectangle {
                            required property int index
                            readonly property int slot: root.wrappedSlot(SettingsService.accentSlot + index - 2)
                            width: root.unit * 0.36
                            height: width
                            anchors.verticalCenter: parent.verticalCenter
                            radius: width / 2
                            color: root.paletteColor(slot)
                            border.width: slot === SettingsService.accentSlot ? Math.max(2, root.unit * 0.025) : 0
                            border.color: root.backgroundColor
                            opacity: root.paletteAvailable ? (slot === SettingsService.accentSlot ? 1 : 0.62) : 0.28

                            MouseArea {
                                anchors.fill: parent
                                enabled: SettingsService.ready && root.paletteAvailable
                                cursorShape: Qt.PointingHandCursor
                                onClicked: root.selectSlot(parent.slot)
                            }
                        }
                    }

                    // Flexible spacer uses the real width consumed by both arrows,
                    // five swatches, the slot pill and Row spacing. The previous
                    // constant under-counted that width and pushed @color outside.
                    Item { width: Math.max(0, parent.width - root.unit * 3.94); height: 1 }

                    Rectangle {
                        width: root.unit * 0.94
                        height: root.unit * 0.42
                        anchors.verticalCenter: parent.verticalCenter
                        radius: height / 2
                        color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.15)
                        Text {
                            anchors.centerIn: parent
                            text: "@color" + SettingsService.accentSlot
                            color: root.foregroundColor
                            font.pixelSize: UiScale.text(root.unit * 0.095, root.unit)
                            font.weight: Font.DemiBold
                        }
                    }

                    PanelButton {
                        width: root.unit * 0.42
                        unit: root.unit
                        accentColor: root.accentColor
                        foregroundColor: root.foregroundColor
                        surfaceColor: root.surfaceColor
                        text: "›"
                        enabled: SettingsService.ready && root.paletteAvailable
                        onClicked: root.selectSlot(SettingsService.accentSlot + 1)
                    }
                }
            }

            PanelButton {
                width: parent.width; unit: root.unit; accentColor: root.accentColor
                foregroundColor: root.foregroundColor; surfaceColor: root.surfaceColor
                text: "Application Studio"
                onClicked: root.launcherRequested()
            }
            PanelButton {
                width: parent.width; unit: root.unit; accentColor: root.accentColor
                foregroundColor: root.foregroundColor; surfaceColor: root.surfaceColor
                text: "Wallpaper Studio"
                onClicked: root.wallpaperRequested()
            }
            PanelButton {
                width: parent.width; unit: root.unit; accentColor: root.accentColor
                foregroundColor: root.foregroundColor; surfaceColor: root.surfaceColor
                text: "Notifications / Do Not Disturb"
                onClicked: root.notificationsRequested()
            }
            PanelButton {
                width: parent.width; unit: root.unit; accentColor: root.accentColor
                foregroundColor: root.foregroundColor; surfaceColor: root.surfaceColor
                text: "Entrance animation: " + (SettingsService.animations ? "On" : "Off")
                enabled: SettingsService.ready
                onClicked: SettingsService.animations = !SettingsService.animations
            }
            PanelButton {
                width: parent.width; unit: root.unit; accentColor: root.accentColor
                foregroundColor: root.foregroundColor; surfaceColor: root.surfaceColor
                text: "Clock format: " + (SettingsService.clock24 ? "24 hours" : "12 hours")
                enabled: SettingsService.ready
                onClicked: SettingsService.clock24 = !SettingsService.clock24
            }
            PanelButton {
                width: parent.width; unit: root.unit; accentColor: root.accentColor
                foregroundColor: root.foregroundColor; surfaceColor: root.surfaceColor
                text: "Power / Session"
                onClicked: root.powerRequested()
            }
            Text {
                text: SettingsService.saveStatus
                width: parent.width; wrapMode: Text.WordWrap
                color: root.mutedColor; font.pixelSize: UiScale.text(root.unit * 0.115, root.unit)
            }
            PanelButton {
                width: parent.width; unit: root.unit; accentColor: root.accentColor
                foregroundColor: root.foregroundColor; surfaceColor: root.surfaceColor
                text: "Close"; onClicked: root.closeRequested()
            }
        }
    }

    Rectangle {
        id: scrollTrack
        visible: scroller.contentHeight > scroller.height + 1
        anchors {
            right: parent.right
            rightMargin: root.unit * 0.12
            top: parent.top
            topMargin: root.unit * 0.28
            bottom: parent.bottom
            bottomMargin: root.unit * 0.28
        }
        width: Math.max(2, root.unit * 0.025)
        radius: width / 2
        color: Qt.rgba(root.mutedColor.r, root.mutedColor.g, root.mutedColor.b, 0.12)

        Rectangle {
            width: parent.width
            radius: width / 2
            color: root.accentColor
            opacity: 0.65
            height: Math.max(root.unit * 0.34, parent.height * Math.min(1, scroller.height / Math.max(1, scroller.contentHeight)))
            y: {
                const maxContentY = Math.max(1, scroller.contentHeight - scroller.height)
                const maxThumbY = Math.max(0, parent.height - height)
                return maxThumbY * Math.max(0, Math.min(1, scroller.contentY / maxContentY))
            }
        }
    }
}
