import QtQuick
import Quickshell
import Quickshell.Wayland
import "../core"
import "../services"

PanelWindow {
    id: root

    required property var modelData

    screen: modelData
    visible: true
    color: "transparent"
    focusable: false
    aboveWindows: true
    exclusionMode: ExclusionMode.Ignore

    anchors.top: true
    margins.top: 0

    implicitWidth: Math.round(unit * 7.25)
    implicitHeight: Math.max(1, toastColumn.implicitHeight)

    WlrLayershell.namespace: "notifications"

    readonly property real unit: UiScale.forScreen(modelData)
    readonly property var entries: {
        const revision = NotificationService.revision
        return NotificationService.activeForScreen(modelData.name)
    }

    Theme { id: theme }

    // Keep the layer surface mapped so exit animations can finish after the
    // service removes an entry. With no toasts it collapses to a 1 px inert strip.
    // Keep three persistent visual slots instead of recreating a Repeater for
    // every state update. A coalesced OSD can therefore update in place without
    // replaying its entrance animation or producing a volume/brightness burst.
    Column {
        id: toastColumn
        width: parent.width
        spacing: root.unit * 0.12

        NotificationToast {
            unit: root.unit
            entry: root.entries.length > 0 ? root.entries[0] : null
            attachedToTop: true
            backgroundColor: theme.backgroundCss
            foregroundColor: theme.foreground
            mutedColor: theme.muted
            accentColor: theme.accent
            surfaceColor: theme.surfaceSoft
        }

        NotificationToast {
            unit: root.unit
            entry: root.entries.length > 1 ? root.entries[1] : null
            attachedToTop: false
            backgroundColor: theme.backgroundCss
            foregroundColor: theme.foreground
            mutedColor: theme.muted
            accentColor: theme.accent
            surfaceColor: theme.surfaceSoft
        }

        NotificationToast {
            unit: root.unit
            entry: root.entries.length > 2 ? root.entries[2] : null
            attachedToTop: false
            backgroundColor: theme.backgroundCss
            foregroundColor: theme.foreground
            mutedColor: theme.muted
            accentColor: theme.accent
            surfaceColor: theme.surfaceSoft
        }
    }
}
