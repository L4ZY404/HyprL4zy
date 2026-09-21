pragma Singleton
import QtQuick
import Quickshell.Hyprland

Item {
    property int revision: 0
    // Native properties update immediately; this is only a shared fallback.
    Timer {
        interval: 5000
        repeat: true
        running: true
        triggeredOnStart: true
        onTriggered: {
            Hyprland.refreshMonitors()
            Hyprland.refreshWorkspaces()
            Hyprland.refreshToplevels()
            parent.revision += 1
        }
    }
}
