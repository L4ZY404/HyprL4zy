pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Hyprland

QtObject {
    id: root

    property bool barVisible: true

    signal panelRequested(string name, string screenName)

    function targetScreenName() {
        const screens = Quickshell.screens
        const monitor = Hyprland.focusedMonitor
        if (monitor && monitor.name && screens.some(screen => screen.name === monitor.name))
            return monitor.name

        return screens.length ? screens[0].name : ""
    }

    function request(name) {
        root.barVisible = true
        root.panelRequested(name, root.targetScreenName())
    }

    function dispatchAction(action) {
        switch (action) {
        case "toggleBar":
            ContextState.closeCurrent()
            root.barVisible = !root.barVisible
            return
        case "close":
            ContextState.closeCurrent()
            return
        case "help":
        case "power":
        case "settings":
        case "audio":
        case "connectivity":
        case "system":
        case "battery":
        case "launcher":
        case "wallpaper":
        case "notifications":
            root.request(action)
            return
        default:
            console.warn("hyprl4zy ignored unknown shell action:", action)
        }
    }
}
