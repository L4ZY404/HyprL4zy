import QtQuick
import Quickshell
import "../components"
import "../core"
import "../modules/arch"
import "../modules/battery"
import "../modules/clock"
import "../modules/connectivity"
import "../modules/media"
import "../modules/system"
import "../modules/tray"
import "../modules/updates"
import "../modules/weather"
import "../modules/workspaces"
import "../popovers"
import "../services"

PanelWindow {
    id: root

    required property var modelData

    screen: modelData
    visible: ShellControl.barVisible
    color: "transparent"
    // Keep the layer-shell surface configuration stable during context morphs.
    // Input is constrained by the dynamic mask below instead of resizing/reconfiguring the window.
    focusable: true

    anchors {
        left: true
        top: true
        bottom: true
    }

    // Share one responsive scale with this monitor's notifications.
    readonly property real unit: UiScale.forScreen(modelData)
    readonly property real radius: unit * 0.23
    // Keep the bar island outline on a stable physical pixel grid.
    readonly property real stroke: Math.max(1, Math.round(unit * 0.022))
    readonly property real outerGap: unit * 0.145
    readonly property real sectionGap: outerGap * 0.72
    // The compact bar always owns exactly this physical width. Context panels
    // expand the same layer-shell window, while the exclusive zone stays compact.
    readonly property real barWidth: Math.round(unit)
    readonly property real contextJoinOverlap: radius * 1.35
    readonly property real contextExtensionSpan: contextJoinOverlap + contextPanelWidth
    readonly property real maxContextPanelWidth: unit * 5.15

    property string activeContextName: ""
    property var activeContextIsland: null
    property string queuedContextName: ""
    property var queuedContextIsland: null
    property real contextPanelWidth: unit * 4.6
    property real contextTargetHeight: unit * 2.4
    property real contextRevealWidth: 0
    property bool contextMounted: false
    property bool contextContentVisible: false
    property int mediaContextTab: 0
    property bool activeContextFromBottom: false
    // Context anchors are captured while the island is still compact.
    // Top islands keep a stable top edge; bottom islands keep a stable bottom edge.
    // Using explicit anchors avoids relying on mapToItem() as a live QML binding,
    // which does not re-evaluate when a bottom-anchored Column shifts upward.
    property real contextAnchorTopY: 0
    property real contextAnchorBottomY: 0

    // Keep one fixed-size Wayland surface for the entire lifetime of the bar.
    // Resizing the layer surface during a morph caused the compositor to briefly
    // recompose the whole bar as a large rectangular frame.
    implicitWidth: root.barWidth + root.maxContextPanelWidth
    exclusiveZone: root.barWidth

    // The permanently allocated transparent area must never steal clicks from
    // normal applications. Only the compact bar plus the currently revealed
    // context slice participate in the input region.
    mask: Region {
        width: Math.round(root.barWidth)
        height: Math.round(root.height)

        Region {
            x: Math.round(root.barWidth - root.contextJoinOverlap)
            y: Math.round(contextSurface.y)
            width: root.contextMounted ? Math.max(0, Math.ceil(root.contextRevealWidth)) : 0
            height: root.contextMounted ? Math.max(0, Math.ceil(contextSurface.height)) : 0
        }
    }

    onUnitChanged: {
        if (activeContextName.length > 0) resetContextForScreenChange()
    }
    onHeightChanged: {
        if (activeContextName.length > 0) resetContextForScreenChange()
    }
    Component.onDestruction: {
        if (ContextState.currentPopup === contextSurface
                || ContextState.currentPopup === launcherPopup
                || ContextState.currentPopup === wallpaperPopup
                || ContextState.currentPopup === notificationsPopup
                || ContextState.currentPopup === powerPopup
                || ContextState.currentPopup === helpPopup)
            ContextState.currentPopup = null
    }

    Theme { id: theme }


    function contextComesFromBottom(name) {
        return name === "connectivity"
            || name === "system"
            || name === "battery"
            || name === "weather"
            || name === "calendar"
    }


    function syncTopContextAnchor() {
        if (!activeContextIsland || activeContextFromBottom || activeContextName.length === 0)
            return
        const point = activeContextIsland.mapToItem(null, 0, 0)
        contextAnchorTopY = Number(point.y)
        contextAnchorBottomY = contextAnchorTopY + Number(activeContextIsland.height)
    }

    function contextPanelWidthFor(name) {
        if (name === "shell") return unit * 4.90
        if (name === "media") return unit * 5.15
        if (name === "updates") return unit * 4.10
        if (name === "connectivity") return unit * 4.72
        if (name === "system") return unit * 4.82
        if (name === "battery") return unit * 4.45
        if (name === "weather") return unit * 4.88
        if (name === "calendar") return unit * 4.55
        return unit * 4.60
    }

    function contextFallbackHeight(name) {
        if (name === "media") return unit * 5.30
        if (name === "updates") return unit * 3.95
        if (name === "connectivity") return unit * 5.18
        if (name === "system") return unit * 4.72
        if (name === "battery") return unit * 3.0
        if (name === "weather") return unit * 4.42
        if (name === "calendar") return unit * 4.05
        if (name === "shell") return unit * 5.2
        return unit * 4.5
    }

    function contextPanelComponent(name) {
        if (name === "shell") return shellContextComponent
        if (name === "media") return mediaContextComponent
        if (name === "updates") return updatesContextComponent
        if (name === "connectivity") return connectivityContextComponent
        if (name === "system") return systemContextComponent
        if (name === "battery") return batteryContextComponent
        if (name === "weather") return weatherContextComponent
        if (name === "calendar") return calendarContextComponent
        return null
    }

    function resetContextForScreenChange() {
        contextVerticalTimer.stop()
        contextContentTimer.stop()
        contextHorizontalCloseTimer.stop()
        contextVerticalCloseTimer.stop()
        queuedContextName = ""
        queuedContextIsland = null
        finishContextReset()
    }

    function finishContextReset() {
        const previousIsland = activeContextIsland
        if (previousIsland) {
            previousIsland.contextExpanded = false
            previousIsland.contextTargetHeight = 0
        }
        contextMounted = false
        contextRevealWidth = 0
        contextContentVisible = false
        activeContextName = ""
        activeContextIsland = null
        activeContextFromBottom = false
        contextAnchorTopY = 0
        contextAnchorBottomY = 0
        if (ContextState.currentPopup === contextSurface)
            ContextState.currentPopup = null

        if (queuedContextName.length > 0 && queuedContextIsland) {
            const nextName = queuedContextName
            const nextIsland = queuedContextIsland
            queuedContextName = ""
            queuedContextIsland = null
            Qt.callLater(function() { root.openContextMorph(nextName, nextIsland) })
        }
    }

    function desiredContextHeight() {
        let target = contextFallbackHeight(activeContextName)
        const panel = contextPanelLoader.item
        if (panel) {
            if (panel.preferredHeight !== undefined && isFinite(Number(panel.preferredHeight)) && Number(panel.preferredHeight) > 0)
                target = Number(panel.preferredHeight)
            else if (panel.implicitHeight !== undefined && isFinite(Number(panel.implicitHeight)) && Number(panel.implicitHeight) > 0)
                target = Number(panel.implicitHeight)
        }
        return target
    }

    function availableContextHeight() {
        if (!activeContextIsland)
            return root.height - root.outerGap * 2

        // These anchors were captured before the island grows. For bottom
        // contexts the bottom edge remains physically stable while the Column
        // reflows upward, so it is the correct source of truth.
        return activeContextFromBottom
            ? Math.max(unit * 1.2, contextAnchorBottomY - root.outerGap)
            : Math.max(unit * 1.2, root.height - contextAnchorTopY - root.outerGap)
    }

    function syncContextHeight() {
        if (!activeContextIsland || activeContextName.length === 0)
            return
        const target = Math.max(unit * 1.2, Math.min(availableContextHeight(), desiredContextHeight()))
        contextTargetHeight = target
        activeContextIsland.contextTargetHeight = target
    }

    function measureAndExpandContext() {
        if (!activeContextIsland || activeContextName.length === 0)
            return

        syncContextHeight()
        activeContextIsland.contextExpanded = true

        if (SettingsService.animations)
            contextVerticalTimer.restart()
        else
            revealContextSurface()
    }

    function revealContextSurface() {
        if (!activeContextIsland || activeContextName.length === 0)
            return
        contextRevealWidth = 0
        contextMounted = true
        contextContentVisible = false
        Qt.callLater(function() {
            if (!root.contextMounted)
                return
            contextRevealWidth = root.contextExtensionSpan
            contextContentTimer.restart()
            contextFocus.forceActiveFocus()
        })
    }

    function openContextMorph(name, island) {
        if (!name || !island)
            return

        if (activeContextName === name && activeContextIsland === island) {
            closeContextMorph()
            return
        }

        if (activeContextName.length > 0) {
            queuedContextName = name
            queuedContextIsland = island
            closeContextMorph()
            return
        }

        if (ContextState.currentPopup && ContextState.currentPopup !== contextSurface) {
            const previous = ContextState.currentPopup
            ContextState.currentPopup = null
            ContextState.requestClose(previous)
        }

        activeContextName = name
        activeContextIsland = island
        activeContextFromBottom = contextComesFromBottom(name)

        // Capture geometry BEFORE contextExpanded changes the bottom Column.
        // Top contexts are anchored by their top edge. Bottom contexts are
        // anchored by their compact bottom edge, which does not move as the
        // island expands upward.
        const compactPoint = island.mapToItem(null, 0, 0)
        contextAnchorTopY = Number(compactPoint.y)
        contextAnchorBottomY = contextAnchorTopY + Number(island.height)

        contextPanelWidth = contextPanelWidthFor(name)
        contextRevealWidth = 0
        contextContentVisible = false
        ContextState.currentPopup = contextSurface
        Qt.callLater(measureAndExpandContext)
    }

    function closeContextMorph() {
        contextVerticalTimer.stop()
        contextContentTimer.stop()

        if (activeContextName.length === 0) {
            if (ContextState.currentPopup === contextSurface)
                ContextState.currentPopup = null
            return
        }

        // Keep contextual content alive while the horizontal surface closes.
        // Hiding it first leaves an empty @background rectangle visible for the
        // final frames of the width animation. The layer-shell surface itself
        // clips the panel as it contracts, so the content disappears naturally
        // with the right edge instead of fading into a blank block.
        if (root.contextMounted) {
            contextRevealWidth = 0
            if (SettingsService.animations)
                contextHorizontalCloseTimer.restart()
            else {
                contextContentVisible = false
                finishContextReset()
            }
        } else {
            if (activeContextIsland)
                activeContextIsland.contextExpanded = false
            if (SettingsService.animations)
                contextVerticalCloseTimer.restart()
            else
                finishContextReset()
        }
    }

    function toggleStandalone(surface) {
        if (!surface)
            return

        if (activeContextName.length > 0)
            closeContextMorph()

        if (surface.visible) {
            if (ContextState.currentPopup === surface)
                ContextState.currentPopup = null
            ContextState.requestClose(surface)
            return
        }

        if (ContextState.currentPopup && ContextState.currentPopup !== surface
                && ContextState.currentPopup !== contextSurface) {
            const previous = ContextState.currentPopup
            ContextState.currentPopup = null
            ContextState.requestClose(previous)
        }

        ContextState.currentPopup = surface
        surface.visible = true
    }

    Timer {
        id: contextVerticalTimer
        interval: 220
        repeat: false
        onTriggered: root.revealContextSurface()
    }

    Timer {
        id: contextContentTimer
        interval: 85
        repeat: false
        onTriggered: root.contextContentVisible = true
    }

    Timer {
        id: contextHorizontalCloseTimer
        interval: 245
        repeat: false
        onTriggered: {
            // The width animation is now fully collapsed. Only at this point do
            // we drop the panel content and unmap the extension; doing it earlier
            // exposes a blank rectangle at the right side of the widget.
            root.contextContentVisible = false
            root.contextMounted = false
            if (root.activeContextIsland)
                root.activeContextIsland.contextExpanded = false
            contextVerticalCloseTimer.restart()
        }
    }

    Timer {
        id: contextVerticalCloseTimer
        interval: 190
        repeat: false
        onTriggered: root.finishContextReset()
    }

    EdgeIsland {
        id: archIsland
        width: root.barWidth
        compactHeight: root.unit * 0.82
        height: contextExpanded ? contextTargetHeight : compactHeight
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.topMargin: root.outerGap
        backgroundColor: theme.backgroundCss
        accentColor: theme.accent
        cornerRadius: root.radius
        strokeWidth: root.stroke
        revealDelay: 0
        z: 10

        ArchModule {
            onActivated: root.openContextMorph("shell", archIsland)
            anchors.fill: parent
            unit: root.unit
            accentColor: theme.accent
        }
    }

    // Fixed-bar top section: workspaces -> tray -> cava/music -> updates.
    Column {
        id: topSection
        anchors {
            top: archIsland.bottom
            topMargin: root.sectionGap
            left: parent.left
        }
        width: root.barWidth
        spacing: root.sectionGap
        z: 10

        EdgeIsland {
            id: workspaceIsland
            width: root.barWidth

            // Workspaces are the elastic block of the bar. Keep every normal
            // inter-island gap intact and shrink/scroll this island first when a
            // contextual surface needs vertical room. This prevents the fixed
            // widgets from visually touching each other on crowded desktops.
            readonly property real naturalIslandHeight: Math.max(
                root.unit * 0.24,
                workspacesModule.naturalHeight + workspaceIsland.verticalInset * 2
            )
            readonly property real availableIslandHeight: Math.max(
                root.unit * 0.24,
                bottomSection.y - topSection.y
                    - root.sectionGap
                    - mediaIsland.height
                    - updatesIsland.height
                    - (trayIsland.visible ? trayIsland.height : 0)
                    - root.sectionGap * (trayIsland.visible ? 3 : 2)
            )
            height: Math.min(naturalIslandHeight, availableIslandHeight)
            backgroundColor: theme.backgroundCss
            accentColor: theme.accent
            cornerRadius: root.radius
            strokeWidth: root.stroke
            revealDelay: 40

            Behavior on height {
                enabled: SettingsService.animations
                NumberAnimation { duration: 175; easing.type: Easing.OutCubic }
            }

            WorkspacesModule {
                id: workspacesModule
                maxHeight: Math.max(
                    root.unit * 0.10,
                    workspaceIsland.height - workspaceIsland.verticalInset * 2
                )
                anchors.fill: parent
                targetScreen: root.screen
                unit: root.unit
                backgroundColor: theme.backgroundCss
                foregroundColor: theme.foreground
                mutedColor: theme.muted
                accentColor: theme.accent
                surfaceColor: theme.surfaceSoft
                outlineColor: theme.outlineSoft
            }
        }

        EdgeIsland {
            id: trayIsland
            visible: trayModule.itemCount > 0
            width: root.barWidth
            // TrayModule reports row content only; EdgeIsland adds its own
            // symmetric top/bottom inset around that content.
            height: visible
                ? Math.max(root.unit * 0.68, trayModule.implicitHeight + trayIsland.verticalInset * 2)
                : 0
            backgroundColor: theme.backgroundCss
            accentColor: theme.accent
            cornerRadius: root.radius
            strokeWidth: root.stroke
            revealDelay: 80

            TrayModule {
                id: trayModule
                anchors.fill: parent
                unit: root.unit
                foregroundColor: theme.foreground
                mutedColor: theme.muted
                accentColor: theme.accent
                surfaceColor: theme.surfaceSoft
            }
        }

        EdgeIsland {
            id: mediaIsland
            property bool compactRequested: mediaModule.available
            visible: compactRequested || contextExpanded || height > 0.5
            width: root.barWidth
            compactHeight: Math.max(root.unit * 0.88, mediaModule.implicitHeight)
            height: (compactRequested || contextExpanded)
                ? (contextExpanded ? contextTargetHeight : compactHeight)
                : 0
            backgroundColor: theme.backgroundCss
            accentColor: theme.accent
            cornerRadius: root.radius
            strokeWidth: root.stroke
            revealDelay: 120
            onYChanged: if (root.activeContextName === "media") root.syncTopContextAnchor()

            Item {
                id: mediaCompactHost
                anchors.centerIn: parent
                width: parent.width
                height: mediaIsland.compactHeight
                opacity: mediaIsland.compactRequested || mediaIsland.contextExpanded ? 1 : 0

                Behavior on opacity {
                    enabled: SettingsService.animations
                    NumberAnimation { duration: 125; easing.type: Easing.OutCubic }
                }

                MediaModule {
                    id: mediaModule
                    anchors.fill: parent
                    unit: root.unit
                    backgroundColor: theme.backgroundCss
                    foregroundColor: theme.foreground
                    mutedColor: theme.muted
                    accentColor: theme.accent
                    surfaceColor: theme.surfaceSoft
                    onActivated: {
                        root.mediaContextTab = 0
                        root.openContextMorph("media", mediaIsland)
                    }
                }
            }

        }

        EdgeIsland {
            id: updatesIsland
            property bool compactRequested: updatesModule.checking
                || updatesModule.updateCount > 0
                || updatesModule.errorText.length > 0
            visible: compactRequested || contextExpanded || height > 0.5
            width: root.barWidth
            compactHeight: Math.max(root.unit * 0.80, updatesModule.implicitHeight + root.unit * 0.06)
            height: (compactRequested || contextExpanded)
                ? (contextExpanded ? contextTargetHeight : compactHeight)
                : 0
            backgroundColor: theme.backgroundCss
            accentColor: theme.accent
            cornerRadius: root.radius
            strokeWidth: root.stroke
            revealDelay: 160
            onYChanged: if (root.activeContextName === "updates") root.syncTopContextAnchor()

            Item {
                id: updatesCompactHost
                anchors.centerIn: parent
                width: parent.width
                height: updatesIsland.compactHeight
                opacity: updatesIsland.compactRequested || updatesIsland.contextExpanded ? 1 : 0

                Behavior on opacity {
                    enabled: SettingsService.animations
                    NumberAnimation { duration: 125; easing.type: Easing.OutCubic }
                }

                UpdatesModule {
                    id: updatesModule
                    anchors.fill: parent
                    unit: root.unit
                    foregroundColor: theme.foreground
                    mutedColor: theme.muted
                    accentColor: theme.accent
                    surfaceColor: theme.surfaceSoft
                    onActivated: root.openContextMorph("updates", updatesIsland)
                }
            }
        }
    }

    // Fixed-bar bottom section: connectivity -> system -> battery -> weather -> clock.
    Column {
        id: bottomSection
        anchors {
            left: parent.left
            bottom: parent.bottom
            bottomMargin: root.outerGap
        }
        width: root.barWidth
        spacing: root.sectionGap
        z: 10

        EdgeIsland {
            id: connectivityIsland
            width: root.barWidth
            compactHeight: Math.max(root.unit * 1.08, connectivityModule.implicitHeight + root.unit * 0.06)
            height: contextExpanded ? contextTargetHeight : compactHeight
            backgroundColor: theme.backgroundCss
            accentColor: theme.accent
            cornerRadius: root.radius
            strokeWidth: root.stroke
            revealDelay: 220

            Item {
                id: connectivityCompactHost
                anchors.centerIn: parent
                width: parent.width
                height: connectivityIsland.compactHeight

                ConnectivityModule {
                    id: connectivityModule
                    anchors.fill: parent
                    unit: root.unit
                    backgroundColor: theme.backgroundCss
                    foregroundColor: theme.foreground
                    mutedColor: theme.muted
                    accentColor: theme.accent
                    surfaceColor: theme.surfaceSoft
                    accentSurfaceColor: theme.accentSoft
                }
            }


            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: root.openContextMorph("connectivity", connectivityIsland)
            }
        }

        EdgeIsland {
            id: systemIsland
            width: root.barWidth
            compactHeight: Math.max(root.unit * 2.02, systemModule.implicitHeight)
            height: contextExpanded ? contextTargetHeight : compactHeight
            backgroundColor: theme.backgroundCss
            accentColor: theme.accent
            cornerRadius: root.radius
            strokeWidth: root.stroke
            revealDelay: 260

            Item {
                id: systemCompactHost
                anchors.centerIn: parent
                width: parent.width
                height: systemIsland.compactHeight

                SystemModule {
                    id: systemModule
                    anchors.fill: parent
                    unit: root.unit
                    foregroundColor: theme.foreground
                    mutedColor: theme.muted
                    accentColor: theme.accent
                    surfaceColor: theme.surfaceStrong
                }
            }

            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: root.openContextMorph("system", systemIsland)
            }
        }

        EdgeIsland {
            id: batteryIsland
            visible: batteryModule.available
            width: root.barWidth
            compactHeight: Math.max(root.unit * 0.88, batteryModule.implicitHeight)
            height: visible ? (contextExpanded ? contextTargetHeight : compactHeight) : 0
            backgroundColor: theme.backgroundCss
            accentColor: theme.accent
            cornerRadius: root.radius
            strokeWidth: root.stroke
            revealDelay: 300

            Item {
                id: batteryCompactHost
                anchors.centerIn: parent
                width: parent.width
                height: batteryIsland.compactHeight

                BatteryModule {
                    id: batteryModule
                    anchors.fill: parent
                    unit: root.unit
                    foregroundColor: theme.foreground
                    mutedColor: theme.muted
                    accentColor: theme.accent
                    surfaceColor: theme.surfaceStrong
                }
            }

            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: root.openContextMorph("battery", batteryIsland)
            }
        }

        EdgeIsland {
            id: weatherIsland
            width: root.barWidth
            compactHeight: Math.max(root.unit * 1.04, weatherModule.implicitHeight)
            height: contextExpanded ? contextTargetHeight : compactHeight
            backgroundColor: theme.backgroundCss
            accentColor: theme.accent
            cornerRadius: root.radius
            strokeWidth: root.stroke
            revealDelay: 340

            Item {
                id: weatherCompactHost
                anchors.centerIn: parent
                width: parent.width
                height: weatherIsland.compactHeight

                WeatherModule {
                    id: weatherModule
                    anchors.fill: parent
                    unit: root.unit
                    foregroundColor: theme.foreground
                    mutedColor: theme.muted
                    accentColor: theme.accent
                    surfaceColor: theme.surfaceSoft
                    onActivated: root.openContextMorph("weather", weatherIsland)
                }
            }
        }

        EdgeIsland {
            id: clockIsland
            width: root.barWidth
            compactHeight: root.unit * 1.02
            height: contextExpanded ? contextTargetHeight : compactHeight
            backgroundColor: theme.backgroundCss
            accentColor: theme.accent
            cornerRadius: root.radius
            strokeWidth: root.stroke
            revealDelay: 380

            Item {
                id: clockCompactHost
                anchors.centerIn: parent
                width: parent.width
                height: clockIsland.compactHeight

                ClockModule {
                    anchors.fill: parent
                    unit: root.unit
                    accentColor: theme.accent
                    mutedColor: theme.muted
                }
            }

            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: root.openContextMorph("calendar", clockIsland)
            }
        }
    }

    // Context morph lives inside the SAME layer-shell window as the bar.
    // The extension is painted behind the real compact island, so there is no
    // inter-window stacking race, duplicate widget, or covered MouseArea.
    Item {
        id: contextSurface
        x: root.barWidth - root.contextJoinOverlap
        y: root.activeContextIsland
            ? Math.round(root.activeContextFromBottom
                ? root.contextAnchorBottomY - root.contextTargetHeight
                : root.contextAnchorTopY)
            : 0
        width: root.contextExtensionSpan
        height: Math.max(1, Math.round(root.contextTargetHeight))
        visible: root.contextMounted
        z: 1

        function requestClose() {
            root.closeContextMorph()
        }

        Item {
            id: contextRevealClip
            x: 0
            y: 0
            width: Math.max(0, root.contextRevealWidth)
            height: parent.height
            clip: true

            Behavior on width {
                enabled: SettingsService.animations
                NumberAnimation { duration: 240; easing.type: Easing.OutCubic }
            }

            // Opaque @background bridge starts behind the compact island shoulder.
            // Because the actual island is z=10, its content and click target are
            // always above this bridge even while the panel is opening/closing.
            Rectangle {
                x: 0
                y: 0
                width: Math.max(0, parent.width - root.radius)
                height: parent.height
                color: theme.backgroundCss
                border.width: 0
            }

            Rectangle {
                anchors.right: parent.right
                anchors.top: parent.top
                anchors.bottom: parent.bottom
                width: Math.min(parent.width, root.radius * 2)
                radius: root.radius
                color: theme.backgroundCss
                border.width: 0
                antialiasing: true
            }

            Flickable {
                id: contextViewport
                x: root.contextJoinOverlap
                width: root.contextPanelWidth
                height: root.contextTargetHeight
                contentWidth: width
                contentHeight: Math.max(height, root.desiredContextHeight())
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                flickableDirection: Flickable.VerticalFlick
                interactive: contentHeight > height + 1
                opacity: root.contextContentVisible ? 1 : 0
                visible: parent.width > root.contextJoinOverlap + 2
                z: 3

                Behavior on opacity {
                    enabled: SettingsService.animations
                    NumberAnimation { duration: 155; easing.type: Easing.OutCubic }
                }

                Loader {
                    id: contextPanelLoader
                    width: contextViewport.width
                    height: contextViewport.contentHeight
                    active: root.activeContextName.length > 0
                    sourceComponent: root.contextPanelComponent(root.activeContextName)
                    onSourceComponentChanged: contextViewport.contentY = 0
                }
            }
        }

        FocusScope {
            id: contextFocus
            anchors.fill: parent
            focus: true
            Keys.onEscapePressed: root.closeContextMorph()
        }

        Connections {
            target: contextPanelLoader.item
            ignoreUnknownSignals: true
            function onPreferredHeightChanged() { Qt.callLater(root.syncContextHeight) }
            function onImplicitHeightChanged() { Qt.callLater(root.syncContextHeight) }
        }
    }

    Component {
        id: systemContextComponent
        SystemPopover {
            unit: root.unit
            backgroundColor: theme.backgroundCss
            foregroundColor: theme.foreground
            mutedColor: theme.muted
            accentColor: theme.accent
            surfaceColor: theme.surfaceStrong
            cpuPercent: systemModule.cpuPercent
            memoryPercent: systemModule.memoryPercent
            temperatureC: systemModule.temperatureC
            temperatureAvailable: systemModule.temperatureAvailable
        }
    }

    Component {
        id: batteryContextComponent
        BatteryPopover {
            unit: root.unit
            backgroundColor: theme.backgroundCss
            foregroundColor: theme.foreground
            mutedColor: theme.muted
            accentColor: theme.accent
            surfaceColor: theme.surfaceStrong
        }
    }

    Component {
        id: updatesContextComponent
        UpdatesPopover {
            unit: root.unit
            backgroundColor: theme.backgroundCss
            foregroundColor: theme.foreground
            mutedColor: theme.muted
            accentColor: theme.accent
            surfaceColor: theme.surfaceSoft
            updateCount: updatesModule.updateCount
            checking: updatesModule.checking
            updateLines: updatesModule.updateLines
            errorText: updatesModule.errorText
            onRefreshRequested: updatesModule.refresh()
        }
    }

    Component {
        id: connectivityContextComponent
        ConnectivityPopover {
            unit: root.unit
            backgroundColor: theme.backgroundCss
            foregroundColor: theme.foreground
            mutedColor: theme.muted
            accentColor: theme.accent
            surfaceColor: theme.surfaceSoft
            panelVisible: contextSurface.visible && root.activeContextName === "connectivity"
        }
    }

    Component {
        id: calendarContextComponent
        CalendarPopover {
            unit: root.unit
            backgroundColor: theme.backgroundCss
            foregroundColor: theme.foreground
            mutedColor: theme.muted
            accentColor: theme.accent
            surfaceColor: theme.surfaceSoft
        }
    }

    Component {
        id: mediaContextComponent
        MediaPopover {
            unit: root.unit
            backgroundColor: theme.backgroundCss
            foregroundColor: theme.foreground
            mutedColor: theme.muted
            accentColor: theme.accent
            surfaceColor: theme.surfaceSoft
            player: mediaModule.player
            selectedTab: root.mediaContextTab
            panelVisible: contextSurface.visible && root.activeContextName === "media"
        }
    }

    Component {
        id: weatherContextComponent
        WeatherPopover {
            unit: root.unit
            backgroundColor: theme.backgroundCss
            foregroundColor: theme.foreground
            mutedColor: theme.muted
            accentColor: theme.accent
            surfaceColor: theme.surfaceSoft
            available: weatherModule.available
            loading: weatherModule.loading
            temperature: weatherModule.temperature
            apparentTemperature: weatherModule.apparentTemperature
            humidity: weatherModule.humidity
            weatherCode: weatherModule.weatherCode
            windSpeed: weatherModule.windSpeed
            forecastDays: weatherModule.forecastDays
            forecastHighs: weatherModule.forecastHighs
            forecastLows: weatherModule.forecastLows
            forecastCodes: weatherModule.forecastCodes
            forecastPrecipitation: weatherModule.forecastPrecipitation
            locationName: weatherModule.locationName
            errorText: weatherModule.errorText
            onRefreshRequested: weatherModule.refresh()
        }
    }

    Component {
        id: shellContextComponent
        ShellPopover {
            unit: root.unit
            backgroundColor: theme.backgroundCss
            foregroundColor: theme.foreground
            mutedColor: theme.muted
            accentColor: theme.accent
            surfaceColor: theme.surfaceSoft
            paletteAvailable: theme.paletteAvailable
            walColors: theme.walColors
            onCloseRequested: root.closeContextMorph()
            onLauncherRequested: root.toggleStandalone(launcherPopup)
            onWallpaperRequested: root.toggleStandalone(wallpaperPopup)
            onNotificationsRequested: root.toggleStandalone(notificationsPopup)
            onPowerRequested: root.toggleStandalone(powerPopup)
        }
    }

    function handlePanelRequest(name) {
        if (name === "power") {
            toggleStandalone(powerPopup)
            return
        }
        if (name === "help") {
            toggleStandalone(helpPopup)
            return
        }
        if (name === "launcher") {
            toggleStandalone(launcherPopup)
            return
        }
        if (name === "wallpaper") {
            toggleStandalone(wallpaperPopup)
            return
        }
        if (name === "notifications") {
            toggleStandalone(notificationsPopup)
            return
        }
        if (name === "audio") {
            mediaContextTab = 1
            openContextMorph("media", mediaIsland)
            return
        }
        if (name === "connectivity") {
            openContextMorph("connectivity", connectivityIsland)
            return
        }
        if (name === "system") {
            openContextMorph("system", systemIsland)
            return
        }
        if (name === "battery") {
            openContextMorph("battery", batteryIsland)
            return
        }
        openContextMorph("shell", archIsland)
    }

    Connections {
        target: ShellControl
        function onPanelRequested(name, screenName) {
            if (root.screen.name !== screenName)
                return
            root.handlePanelRequest(name)
        }
    }

    // Studios are real bottom layer-shell surfaces, not transient xdg popups.
    // This makes keyboard/script activation independent from a prior mouse click
    // on the bar, while preserving the same bottom-sheet presentation.
    PanelWindow {
        id: launcherPopup
        screen: root.screen
        anchors.bottom: true
        margins.bottom: 0
        implicitWidth: Math.min(root.screen.width - root.unit * 1.45, root.unit * 13.6)
        implicitHeight: Math.min(root.height * 0.76, launcherPanel.preferredHeight)
        exclusionMode: ExclusionMode.Ignore
        aboveWindows: true
        focusable: true
        color: "transparent"
        visible: false

        function requestClose() {
            launcherPanel.beginClose()
        }

        onVisibleChanged: {
            if (visible) {
                launcherPanel.prepareOpen()
                Qt.callLater(function() {
                    if (!launcherPopup.visible)
                        return
                    launcherPanel.forceActiveFocus()
                    launcherPanel.openPanel()
                })
            } else {
                launcherPanel.snapClosed()
            }
        }

        LauncherPopover {
            id: launcherPanel
            anchors.fill: parent
            focus: true
            onDismissed: {
                launcherPopup.visible = false
                if (ContextState.currentPopup === launcherPopup)
                    ContextState.currentPopup = null
            }
            unit: root.unit
            backgroundColor: theme.backgroundCss
            foregroundColor: theme.foreground
            mutedColor: theme.muted
            accentColor: theme.accent
            surfaceColor: theme.surfaceSoft
            onCloseRequested: launcherPopup.requestClose()
        }
    }

    PanelWindow {
        id: wallpaperPopup
        screen: root.screen
        anchors.bottom: true
        margins.bottom: 0
        implicitWidth: Math.min(root.screen.width - root.unit * 1.45, root.unit * 14.6)
        implicitHeight: Math.min(root.height * 0.74, wallpaperPanel.preferredHeight)
        exclusionMode: ExclusionMode.Ignore
        aboveWindows: true
        focusable: true
        color: "transparent"
        visible: false

        function requestClose() {
            wallpaperPanel.beginClose()
        }

        onVisibleChanged: {
            if (visible) {
                wallpaperPanel.prepareOpen()
                Qt.callLater(function() {
                    if (!wallpaperPopup.visible)
                        return
                    wallpaperPanel.forceActiveFocus()
                    wallpaperPanel.openPanel()
                })
            } else {
                wallpaperPanel.snapClosed()
            }
        }

        WallpaperPopover {
            id: wallpaperPanel
            anchors.fill: parent
            focus: true
            onDismissed: {
                wallpaperPopup.visible = false
                if (ContextState.currentPopup === wallpaperPopup)
                    ContextState.currentPopup = null
            }
            unit: root.unit
            backgroundColor: theme.backgroundCss
            foregroundColor: theme.foreground
            mutedColor: theme.muted
            accentColor: theme.accent
            surfaceColor: theme.surfaceSoft
            onCloseRequested: wallpaperPopup.requestClose()
        }
    }
    PopupWindow {
        id: notificationsPopup
        anchor.window: root
        anchor.rect.x: root.barWidth + root.unit * 0.12
        anchor.rect.y: Math.max(root.outerGap, (root.height - height) / 2)
        implicitWidth: root.unit * 4.7
        implicitHeight: Math.min(root.height - root.outerGap * 2, notificationsPanel.preferredHeight)
        color: "transparent"
        visible: false
        grabFocus: true
        onVisibleChanged: {
            NotificationService.panelActive = visible
            if (visible) {
                NotificationService.refresh()
                notificationsPanel.forceActiveFocus()
            }
        }

        NotificationsPopover {
            id: notificationsPanel
            anchors.fill: parent
            focus: true
            Keys.onEscapePressed: notificationsPopup.visible = false
            unit: root.unit
            backgroundColor: theme.backgroundCss
            foregroundColor: theme.foreground
            mutedColor: theme.muted
            accentColor: theme.accent
            surfaceColor: theme.surfaceSoft
            onCloseRequested: {
                notificationsPopup.visible = false
                ContextState.currentPopup = null
            }
        }
    }

    // Power / Session is a native right-edge surface, mirroring the custom
    // Studio surfaces while keeping its own right-to-left reveal language.
    // The layer surface spans the screen vertically only so we can center the
    // menu reliably; the input mask is restricted to the real menu rectangle.
    PanelWindow {
        id: powerPopup
        screen: root.screen
        anchors {
            right: true
            top: true
            bottom: true
        }
        margins.right: 0
        implicitWidth: powerPanel.preferredWidth
        exclusionMode: ExclusionMode.Ignore
        aboveWindows: true
        focusable: true
        color: "transparent"
        visible: false

        mask: Region {
            x: 0
            y: Math.round((powerPopup.height - powerPanel.preferredHeight) / 2)
            width: Math.round(powerPanel.preferredWidth)
            height: Math.round(powerPanel.preferredHeight)
        }

        function requestClose() {
            powerPanel.beginClose()
        }

        onVisibleChanged: {
            if (visible) {
                powerPanel.prepareOpen()
                Qt.callLater(function() {
                    if (!powerPopup.visible)
                        return
                    powerPanel.forceActiveFocus()
                    powerPanel.openPanel()
                })
            } else {
                powerPanel.snapClosed()
            }
        }

        PowerPopover {
            id: powerPanel
            width: preferredWidth
            height: preferredHeight
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            focus: true
            unit: root.unit
            backgroundColor: theme.backgroundCss
            foregroundColor: theme.foreground
            mutedColor: theme.muted
            accentColor: theme.accent
            surfaceColor: theme.surfaceSoft
            onCloseRequested: powerPopup.requestClose()
            onDismissed: {
                powerPopup.visible = false
                if (ContextState.currentPopup === powerPopup)
                    ContextState.currentPopup = null
            }
        }
    }

    PopupWindow {
        id: helpPopup
        anchor.window: root
        anchor.rect.x: root.barWidth + root.unit * 0.12
        anchor.rect.y: root.outerGap
        implicitWidth: root.unit * 5.7
        implicitHeight: Math.min(root.height - root.outerGap * 2, helpPanel.preferredHeight)
        color: "transparent"
        visible: false
        grabFocus: true
        ShortcutsPopover {
            id: helpPanel
            anchors.fill: parent
            focus: true
            Keys.onEscapePressed: helpPopup.visible = false
            unit: root.unit
            backgroundColor: theme.backgroundCss
            foregroundColor: theme.foreground
            mutedColor: theme.muted
            accentColor: theme.accent
            surfaceColor: theme.surfaceSoft
        }
    }

}
