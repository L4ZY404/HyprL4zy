import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
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

    property int selectedIndex: 0
    property int pendingIndex: -1
    property bool busy: false
    property bool presented: false
    property bool verticalExpanded: false
    property bool horizontalExpanded: false
    property bool contentVisible: false
    property bool closing: false
    property string message: "Arrow keys · Enter to select · Esc to close"

    readonly property var actions: ["Power off", "Reboot", "Sleep", "Logout", "Lock"]
    readonly property real panelPadding: unit * 0.26
    readonly property real actionHeight: unit * 0.56
    readonly property real rowGap: unit * 0.10
    readonly property real columnGap: unit * 0.11
    readonly property real compactExtent: unit * 0.86
    readonly property real actionColumnWidth: unit * 2.18
    readonly property real preferredWidth: panelPadding * 2 + actionColumnWidth * 2 + columnGap
    readonly property real preferredHeight: panelPadding * 2
        + unit * 0.38
        + actionHeight * 3
        + unit * 0.38
        + unit * 0.14 * 4

    focus: true

    function stopTimers() {
        verticalOpenTimer.stop()
        horizontalOpenTimer.stop()
        contentOpenTimer.stop()
        horizontalCloseTimer.stop()
        verticalCloseTimer.stop()
        dismissTimer.stop()
    }

    function resetState() {
        if (!busy) {
            selectedIndex = 0
            pendingIndex = -1
            message = "Arrow keys · Enter to select · Esc to close"
        }
    }

    function prepareOpen() {
        stopTimers()
        closing = false
        presented = false
        verticalExpanded = false
        horizontalExpanded = false
        contentVisible = false
        resetState()
    }

    function openPanel() {
        stopTimers()
        closing = false

        if (!SettingsService.animations) {
            presented = true
            verticalExpanded = true
            horizontalExpanded = true
            contentVisible = true
            return
        }

        // The compact tile enters from the physical right edge toward the left.
        // Once the square lands, grow vertically first and then expand the
        // finished surface horizontally toward the left.
        presented = true
        verticalOpenTimer.restart()
    }

    function beginClose() {
        if (closing)
            return

        stopTimers()
        closing = true
        contentVisible = false

        if (!SettingsService.animations) {
            horizontalExpanded = false
            verticalExpanded = false
            presented = false
            closing = false
            dismissed()
            return
        }

        // Reverse the geometry without ever squeezing visible content.
        horizontalExpanded = false
        horizontalCloseTimer.restart()
    }

    function snapClosed() {
        stopTimers()
        closing = false
        presented = false
        verticalExpanded = false
        horizontalExpanded = false
        contentVisible = false
    }

    function select(index) {
        if (busy)
            return
        selectedIndex = Math.max(0, Math.min(actions.length - 1, index))
        pendingIndex = -1
        message = "Arrow keys · Enter to select · Esc to close"
    }

    function moveHorizontal(delta) {
        if (selectedIndex === 0 || selectedIndex === 1)
            select(selectedIndex === 0 ? 1 : 0)
        else if (selectedIndex === 2 || selectedIndex === 3)
            select(selectedIndex === 2 ? 3 : 2)
    }

    function moveVertical(delta) {
        if (delta > 0) {
            if (selectedIndex <= 1)
                select(selectedIndex + 2)
            else if (selectedIndex <= 3)
                select(4)
            else
                select(0)
        } else {
            if (selectedIndex === 4)
                select(2)
            else if (selectedIndex >= 2)
                select(selectedIndex - 2)
            else
                select(4)
        }
    }

    function activate(index) {
        if (busy || index < 0 || index >= actions.length)
            return

        selectedIndex = index

        // Lock is intentionally immediate. Session/power transitions require a
        // second activation so an accidental Enter/click cannot end the session.
        if (index !== 4 && pendingIndex !== index) {
            pendingIndex = index
            message = "Press again to confirm " + actions[index].toLowerCase()
            return
        }

        pendingIndex = -1

        if (index === 3) {
            message = "Logging out…"
            Hyprland.dispatch("exit")
            root.closeRequested()
            return
        }

        const home = Quickshell.env("HOME") || ""
        const commands = {
            0: ["systemctl", "poweroff"],
            1: ["systemctl", "reboot"],
            2: ["systemctl", "suspend"],
            4: ["bash", home + "/.config/hypr/scripts/lock.sh"]
        }

        busy = true
        message = actions[index] + "…"
        startup.restart()
        action.exec(commands[index])
    }

    Keys.onUpPressed: moveVertical(-1)
    Keys.onDownPressed: moveVertical(1)
    Keys.onLeftPressed: moveHorizontal(-1)
    Keys.onRightPressed: moveHorizontal(1)
    Keys.onReturnPressed: activate(selectedIndex)
    Keys.onEnterPressed: activate(selectedIndex)
    Keys.onEscapePressed: {
        if (pendingIndex >= 0) {
            pendingIndex = -1
            message = "Cancelled"
        } else {
            root.closeRequested()
        }
    }

    Process {
        id: action
        stdout: StdioCollector { }
        stderr: StdioCollector { id: errors }
        onStarted: startup.stop()
        onExited: (exitCode, exitStatus) => {
            root.busy = false
            if (exitCode === 0 && exitStatus === 0)
                root.closeRequested()
            else
                root.message = errors.text.trim() || "Action failed. Check permissions or installed commands."
        }
    }

    Timer {
        id: startup
        interval: 1500
        repeat: false
        onTriggered: {
            if (!action.running) {
                root.busy = false
                root.message = "Could not start action."
            }
        }
    }

    Item {
        id: revealMask
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        width: root.horizontalExpanded ? root.width : Math.min(root.width, root.compactExtent)
        height: root.verticalExpanded ? root.height : Math.min(root.height, root.compactExtent)
        clip: true

        transform: Translate {
            x: root.presented ? 0 : root.compactExtent * 1.05

            Behavior on x {
                enabled: SettingsService.animations
                NumberAnimation {
                    duration: root.presented ? 190 : 155
                    easing.type: root.presented ? Easing.OutCubic : Easing.InCubic
                }
            }
        }

        Behavior on height {
            enabled: SettingsService.animations
            NumberAnimation {
                duration: root.verticalExpanded ? 235 : 195
                easing.type: Easing.OutCubic
            }
        }

        Behavior on width {
            enabled: SettingsService.animations
            NumberAnimation {
                duration: root.horizontalExpanded ? 270 : 225
                easing.type: Easing.OutCubic
            }
        }

        Rectangle {
            anchors.fill: parent
            radius: Math.min(root.unit * 0.28, Math.min(width, height) * 0.28)
            color: root.backgroundColor
            antialiasing: true
        }

        Text {
            anchors.centerIn: parent
            visible: !root.contentVisible
            text: "⏻"
            color: root.accentColor
            font.pixelSize: UiScale.text(root.unit * 0.34, root.unit)
            font.weight: Font.DemiBold
            opacity: root.horizontalExpanded ? 0 : 1

            Behavior on opacity {
                enabled: SettingsService.animations
                NumberAnimation { duration: 100; easing.type: Easing.OutCubic }
            }
        }

        Item {
            id: fullPanel
            width: root.width
            height: root.height
            x: 0
            y: (revealMask.height - height) / 2
            opacity: root.contentVisible ? 1 : 0

            Behavior on opacity {
                enabled: SettingsService.animations
                NumberAnimation { duration: 145; easing.type: Easing.OutCubic }
            }

            Column {
                anchors.fill: parent
                anchors.margins: root.panelPadding
                spacing: root.unit * 0.14

                Row {
                    width: parent.width
                    height: root.unit * 0.38

                    Text {
                        width: parent.width
                        anchors.verticalCenter: parent.verticalCenter
                        text: "Power / Session"
                        color: root.accentColor
                        font.pixelSize: UiScale.text(root.unit * 0.245, root.unit)
                        font.weight: Font.Bold
                    }
                }

                Row {
                    width: parent.width
                    height: root.actionHeight
                    spacing: root.columnGap

                    PanelButton {
                        width: (parent.width - root.columnGap) / 2
                        height: root.actionHeight
                        unit: root.unit
                        accentColor: root.accentColor
                        foregroundColor: root.foregroundColor
                        surfaceColor: root.surfaceColor
                        text: root.pendingIndex === 0 ? "Confirm power off" : "Power off"
                        selected: root.selectedIndex === 0
                        enabled: !root.busy
                        onClicked: root.activate(0)
                    }

                    PanelButton {
                        width: (parent.width - root.columnGap) / 2
                        height: root.actionHeight
                        unit: root.unit
                        accentColor: root.accentColor
                        foregroundColor: root.foregroundColor
                        surfaceColor: root.surfaceColor
                        text: root.pendingIndex === 1 ? "Confirm reboot" : "Reboot"
                        selected: root.selectedIndex === 1
                        enabled: !root.busy
                        onClicked: root.activate(1)
                    }
                }

                Row {
                    width: parent.width
                    height: root.actionHeight
                    spacing: root.columnGap

                    PanelButton {
                        width: (parent.width - root.columnGap) / 2
                        height: root.actionHeight
                        unit: root.unit
                        accentColor: root.accentColor
                        foregroundColor: root.foregroundColor
                        surfaceColor: root.surfaceColor
                        text: root.pendingIndex === 2 ? "Confirm sleep" : "Sleep"
                        selected: root.selectedIndex === 2
                        enabled: !root.busy
                        onClicked: root.activate(2)
                    }

                    PanelButton {
                        width: (parent.width - root.columnGap) / 2
                        height: root.actionHeight
                        unit: root.unit
                        accentColor: root.accentColor
                        foregroundColor: root.foregroundColor
                        surfaceColor: root.surfaceColor
                        text: root.pendingIndex === 3 ? "Confirm logout" : "Logout"
                        selected: root.selectedIndex === 3
                        enabled: !root.busy
                        onClicked: root.activate(3)
                    }
                }

                PanelButton {
                    width: parent.width
                    height: root.actionHeight
                    unit: root.unit
                    accentColor: root.accentColor
                    foregroundColor: root.foregroundColor
                    surfaceColor: root.surfaceColor
                    text: "Lock"
                    selected: root.selectedIndex === 4
                    enabled: !root.busy
                    onClicked: root.activate(4)
                }

                Text {
                    width: parent.width
                    height: root.unit * 0.38
                    text: root.message
                    color: root.pendingIndex >= 0 ? root.accentColor : root.mutedColor
                    font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
                    font.weight: root.pendingIndex >= 0 ? Font.DemiBold : Font.Normal
                    verticalAlignment: Text.AlignVCenter
                    elide: Text.ElideRight
                    textFormat: Text.PlainText
                }
            }
        }
    }

    Timer {
        id: verticalOpenTimer
        interval: 190
        repeat: false
        onTriggered: {
            root.verticalExpanded = true
            horizontalOpenTimer.restart()
        }
    }

    Timer {
        id: horizontalOpenTimer
        interval: 235
        repeat: false
        onTriggered: {
            root.horizontalExpanded = true
            contentOpenTimer.restart()
        }
    }

    Timer {
        id: contentOpenTimer
        interval: 255
        repeat: false
        onTriggered: root.contentVisible = true
    }

    Timer {
        id: horizontalCloseTimer
        interval: 225
        repeat: false
        onTriggered: {
            root.verticalExpanded = false
            verticalCloseTimer.restart()
        }
    }

    Timer {
        id: verticalCloseTimer
        interval: 195
        repeat: false
        onTriggered: {
            root.presented = false
            dismissTimer.restart()
        }
    }

    Timer {
        id: dismissTimer
        interval: 160
        repeat: false
        onTriggered: {
            root.closing = false
            root.dismissed()
        }
    }
}
