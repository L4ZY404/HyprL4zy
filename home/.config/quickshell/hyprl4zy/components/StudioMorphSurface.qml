import QtQuick
import "../services"

Item {
    id: root

    required property real unit
    required property color backgroundColor
    required property color accentColor
    property real radius: unit * 0.30
    property real borderWidth: Math.max(1, unit * 0.025)
    property real compactExtent: unit * 1.18
    property string compactGlyph: ""
    property bool revealed: false
    property bool presented: false
    property bool horizontalExpanded: false
    property bool verticalExpanded: false
    property bool contentVisible: false
    property bool closing: false
    readonly property real progress: contentVisible ? 1.0
        : (verticalExpanded ? 0.82 : (horizontalExpanded ? 0.56 : (presented ? 0.24 : 0.0)))

    default property alias content: contentHost.data

    signal dismissed()

    function stopTimers() {
        horizontalTimer.stop()
        verticalTimer.stop()
        contentTimer.stop()
        verticalCloseTimer.stop()
        horizontalCloseTimer.stop()
        dismissTimer.stop()
    }

    function prepareOpen() {
        stopTimers()
        closing = false
        revealed = false
        presented = false
        horizontalExpanded = false
        verticalExpanded = false
        contentVisible = false
    }

    function open() {
        stopTimers()
        closing = false
        revealed = true

        if (!SettingsService.animations) {
            presented = true
            horizontalExpanded = true
            verticalExpanded = true
            contentVisible = true
            return
        }

        presented = true
        horizontalTimer.restart()
    }

    function close() {
        if (closing)
            return

        stopTimers()
        closing = true
        revealed = false
        contentVisible = false

        if (!SettingsService.animations) {
            verticalExpanded = false
            horizontalExpanded = false
            presented = false
            closing = false
            dismissed()
            return
        }

        verticalExpanded = false
        verticalCloseTimer.restart()
    }

    function snapClosed() {
        stopTimers()
        closing = false
        revealed = false
        presented = false
        horizontalExpanded = false
        verticalExpanded = false
        contentVisible = false
    }

    Item {
        id: mask
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        width: root.horizontalExpanded ? root.width : Math.min(root.width, root.compactExtent)
        height: root.verticalExpanded ? root.height : Math.min(root.height, root.compactExtent)
        clip: true

        transform: Translate {
            y: root.presented ? 0 : Math.max(root.compactExtent, mask.height) * 1.08

            Behavior on y {
                enabled: SettingsService.animations
                NumberAnimation {
                    duration: root.presented ? 240 : 180
                    easing.type: root.presented ? Easing.OutCubic : Easing.InCubic
                }
            }
        }

        Behavior on width {
            enabled: SettingsService.animations
            NumberAnimation {
                duration: root.horizontalExpanded ? 265 : 220
                easing.type: Easing.OutCubic
            }
        }

        Behavior on height {
            enabled: SettingsService.animations
            NumberAnimation {
                duration: root.verticalExpanded ? 285 : 235
                easing.type: Easing.OutCubic
            }
        }

        BottomSheetSurface {
            anchors.fill: parent
            backgroundColor: root.backgroundColor
            accentColor: root.accentColor
            borderColor: root.backgroundColor
            radius: root.radius
            borderWidth: root.borderWidth
        }

        Text {
            anchors.centerIn: parent
            text: root.compactGlyph
            visible: root.compactGlyph.length > 0
            color: root.accentColor
            font.pixelSize: UiScale.text(root.unit * 0.34, root.unit)
            font.weight: Font.DemiBold
            opacity: root.horizontalExpanded ? 0 : 1
            z: 4

            Behavior on opacity {
                enabled: SettingsService.animations
                NumberAnimation { duration: 100; easing.type: Easing.OutCubic }
            }
        }

        Item {
            id: contentHost
            width: root.width
            height: root.height
            x: (mask.width - width) / 2
            y: mask.height - height
            opacity: root.contentVisible ? 1 : 0

            Behavior on opacity {
                enabled: SettingsService.animations
                NumberAnimation { duration: 135; easing.type: Easing.OutCubic }
            }
        }
    }

    // Opening: rise -> horizontal strip -> vertical reveal -> content.
    Timer {
        id: horizontalTimer
        interval: 245
        repeat: false
        onTriggered: {
            root.horizontalExpanded = true
            verticalTimer.restart()
        }
    }

    Timer {
        id: verticalTimer
        interval: 270
        repeat: false
        onTriggered: {
            root.verticalExpanded = true
            contentTimer.restart()
        }
    }

    Timer {
        id: contentTimer
        interval: 250
        repeat: false
        onTriggered: root.contentVisible = true
    }

    // Closing reverses the geometry so the content never gets squeezed.
    Timer {
        id: verticalCloseTimer
        interval: 230
        repeat: false
        onTriggered: {
            root.horizontalExpanded = false
            horizontalCloseTimer.restart()
        }
    }

    Timer {
        id: horizontalCloseTimer
        interval: 215
        repeat: false
        onTriggered: {
            root.presented = false
            dismissTimer.restart()
        }
    }

    Timer {
        id: dismissTimer
        interval: 190
        repeat: false
        onTriggered: {
            root.closing = false
            root.dismissed()
        }
    }
}
