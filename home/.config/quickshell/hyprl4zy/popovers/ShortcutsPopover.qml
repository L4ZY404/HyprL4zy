import QtQuick
import "../services"

Rectangle {
    id: root
    required property real unit
    required property color backgroundColor
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    required property color surfaceColor
    readonly property real preferredHeight: content.implicitHeight + unit * 0.52
    color: backgroundColor
    radius: unit * 0.28
    border.color: backgroundColor
    border.width: Math.max(1, unit * 0.025)
    Column {
        id: content
        anchors.fill: parent
        anchors.margins: root.unit * 0.26
        spacing: root.unit * 0.16
        Text { text: "Shortcuts"; color: root.accentColor; font.pixelSize: UiScale.text(root.unit * 0.28, root.unit); font.bold: true }
        Repeater {
            model: [
                {key: "Super + P", action: "Power / Session"},
                {key: "Super + B", action: "Show / Hide bar"},
                {key: "Super + Shift + B", action: "Theme / Shell"},
                {key: "Super + Space", action: "Application launcher"},
                {key: "Super + W", action: "Wallpaper Studio"},
                {key: "Super + N", action: "Notifications / DND"},
                {key: "Super + H", action: "Shortcuts"},
                {key: "Super + R", action: "Restart Quickshell"},
                {key: "Super + Shift + R", action: "Reload Hyprland"},
                {key: "Escape", action: "Close context panel"}
            ]
            delegate: Item {
                required property var modelData
                width: parent.width; height: root.unit * 0.4
                Text { anchors.left: parent.left; anchors.verticalCenter: parent.verticalCenter; text: modelData.key; color: root.accentColor; font.pixelSize: UiScale.text(root.unit * 0.14, root.unit)}
                Text { anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter; text: modelData.action; color: root.foregroundColor; font.pixelSize: UiScale.text(root.unit * 0.14, root.unit)}
            }
        }
        Text {
            width: parent.width
            text: "Shell shortcuts are loaded through the Hyprland configuration."
            color: root.mutedColor; font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
            wrapMode: Text.WordWrap
        }
    }
}
