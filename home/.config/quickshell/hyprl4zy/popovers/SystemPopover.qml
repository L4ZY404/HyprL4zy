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
    required property real cpuPercent
    required property real memoryPercent
    required property real temperatureC
    required property bool temperatureAvailable

    property int selectedTab: 0
    readonly property real preferredHeight: unit * 4.72
    implicitHeight: preferredHeight

    radius: unit * 0.28
    color: backgroundColor
    border.width: 0
    antialiasing: true

    function clamp(value) { return Math.max(0, Math.min(100, Number(value) || 0)) }

    Column {
        anchors.fill: parent
        anchors.margins: root.unit * 0.22
        spacing: root.unit * 0.12

        Item {
            width: parent.width
            height: root.unit * 0.52

            Column {
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                spacing: -root.unit * 0.005

                Text {
                    text: "System"
                    color: root.accentColor
                    font.pixelSize: UiScale.text(root.unit * 0.26, root.unit)
                    font.weight: Font.Bold
                }

                Text {
                    width: parent.width
                    text: SystemService.hostname + " · " + SystemService.uptimeText
                    elide: Text.ElideRight
                    color: root.mutedColor
                    font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
                    font.weight: Font.Medium
                }
            }
        }

        Row {
            width: parent.width
            height: root.unit * 0.42
            spacing: root.unit * 0.08

            PanelButton {
                width: (parent.width - root.unit * 0.08) / 2
                height: parent.height
                unit: root.unit
                accentColor: root.accentColor
                foregroundColor: root.foregroundColor
                surfaceColor: root.surfaceColor
                text: "OVERVIEW"
                selected: root.selectedTab === 0
                onClicked: root.selectedTab = 0
            }
            PanelButton {
                width: (parent.width - root.unit * 0.08) / 2
                height: parent.height
                unit: root.unit
                accentColor: root.accentColor
                foregroundColor: root.foregroundColor
                surfaceColor: root.surfaceColor
                text: "POWER"
                selected: root.selectedTab === 1
                onClicked: root.selectedTab = 1
            }
        }

        Item {
            width: parent.width
            height: root.unit * 3.28

            Column {
                visible: root.selectedTab === 0
                anchors.fill: parent
                spacing: root.unit * 0.10

                Grid {
                    id: metricGrid
                    width: parent.width
                    columns: 2
                    columnSpacing: root.unit * 0.09
                    rowSpacing: root.unit * 0.09

                    Repeater {
                        model: [
                            { label: "Temperature", value: root.temperatureAvailable ? Math.round(root.temperatureC) + "°C" : "N/A", progress: root.temperatureAvailable ? root.clamp(root.temperatureC) : 0 },
                            { label: "CPU", value: Math.round(root.cpuPercent) + "%", progress: root.clamp(root.cpuPercent) },
                            { label: "Memory", value: SystemService.memoryUsedGiB.toFixed(1) + " / " + SystemService.memoryTotalGiB.toFixed(1) + " GiB", progress: root.clamp(root.memoryPercent) },
                            { label: "Root storage", value: SystemService.diskAvailable ? SystemService.diskUsedGiB.toFixed(1) + " / " + SystemService.diskTotalGiB.toFixed(1) + " GiB" : "Unavailable", progress: SystemService.diskAvailable ? root.clamp(SystemService.diskPercent) : 0 }
                        ]
                        delegate: Rectangle {
                            required property var modelData
                            width: (metricGrid.width - metricGrid.columnSpacing) / 2
                            height: root.unit * 0.92
                            radius: root.unit * 0.15
                            color: root.surfaceColor
                            Column {
                                anchors.fill: parent
                                anchors.margins: root.unit * 0.12
                                spacing: root.unit * 0.045
                                Text { width: parent.width; text: modelData.label; color: root.mutedColor; font.pixelSize: UiScale.text(root.unit * 0.10, root.unit); font.weight: Font.DemiBold; elide: Text.ElideRight }
                                Text { width: parent.width; text: modelData.value; color: root.foregroundColor; font.pixelSize: UiScale.text(root.unit * 0.145, root.unit); font.weight: Font.Bold; elide: Text.ElideRight }
                                Rectangle {
                                    width: parent.width; height: Math.max(2, root.unit * 0.055); radius: height / 2
                                    color: Qt.rgba(root.mutedColor.r, root.mutedColor.g, root.mutedColor.b, 0.15)
                                    Rectangle { width: parent.width * Math.max(0, Math.min(1, Number(modelData.progress) / 100)); height: parent.height; radius: parent.radius; color: root.accentColor }
                                }
                            }
                        }
                    }
                }

                Rectangle {
                    width: parent.width; height: root.unit * 0.72; radius: root.unit * 0.15; color: root.surfaceColor
                    Column {
                        anchors.fill: parent; anchors.margins: root.unit * 0.11; spacing: root.unit * 0.025
                        Text { width: parent.width; text: "Load  " + SystemService.load1.toFixed(2) + "  ·  " + SystemService.load5.toFixed(2) + "  ·  " + SystemService.load15.toFixed(2); color: root.foregroundColor; font.pixelSize: UiScale.text(root.unit * 0.12, root.unit); font.weight: Font.DemiBold; elide: Text.ElideRight }
                        Text { width: parent.width; text: SystemService.logicalCpuCount + " logical CPUs · " + SystemService.processRunning + "/" + SystemService.processTotal + " processes"; color: root.mutedColor; font.pixelSize: UiScale.text(root.unit * 0.095, root.unit); elide: Text.ElideRight }
                    }
                }

                Row {
                    width: parent.width; height: root.unit * 0.28
                    Text { width: parent.width * 0.62; text: "Kernel  " + SystemService.kernel; color: root.mutedColor; font.pixelSize: UiScale.text(root.unit * 0.095, root.unit); elide: Text.ElideRight }
                    Text { width: parent.width * 0.38; horizontalAlignment: Text.AlignRight; text: SystemService.swapTotalGiB > 0.01 ? "Swap " + Math.round(SystemService.swapPercent) + "%" : ""; color: root.mutedColor; font.pixelSize: UiScale.text(root.unit * 0.095, root.unit); elide: Text.ElideRight }
                }
            }

            Column {
                visible: root.selectedTab === 1
                anchors.fill: parent
                spacing: root.unit * 0.10

                Text { text: "Power profile"; color: root.foregroundColor; font.pixelSize: UiScale.text(root.unit * 0.13, root.unit); font.weight: Font.DemiBold }

                Row {
                    width: parent.width; height: root.unit * 0.42; spacing: root.unit * 0.07
                    PanelButton { width: (parent.width - root.unit * 0.14) / 3; height: parent.height; unit: root.unit; accentColor: root.accentColor; foregroundColor: root.foregroundColor; surfaceColor: root.surfaceColor; text: "SAVER"; selected: PowerService.profileSelected("power-saver"); onClicked: PowerService.setProfile("power-saver") }
                    PanelButton { width: (parent.width - root.unit * 0.14) / 3; height: parent.height; unit: root.unit; accentColor: root.accentColor; foregroundColor: root.foregroundColor; surfaceColor: root.surfaceColor; text: "BALANCED"; selected: PowerService.profileSelected("balanced"); onClicked: PowerService.setProfile("balanced") }
                    PanelButton { width: (parent.width - root.unit * 0.14) / 3; height: parent.height; unit: root.unit; accentColor: root.accentColor; foregroundColor: root.foregroundColor; surfaceColor: root.surfaceColor; text: "PERF"; enabled: PowerService.hasPerformanceProfile; selected: PowerService.profileSelected("performance"); onClicked: PowerService.setProfile("performance") }
                }

                Grid {
                    id: powerGrid
                    width: parent.width
                    columns: 2
                    columnSpacing: root.unit * 0.09
                    rowSpacing: root.unit * 0.09

                    Repeater {
                        model: [
                            { label: "Active profile", value: PowerService.profileName },
                            { label: "Power source", value: PowerService.batteryAvailable ? (PowerService.onBattery ? "Battery" : "External power") : "AC / desktop" },
                            { label: PowerService.batteryAvailable ? "Battery" : "Performance", value: PowerService.batteryAvailable ? Math.round(PowerService.batteryPercent) + "% · " + PowerService.batteryState : (PowerService.hasPerformanceProfile ? "Available" : "Unavailable") },
                            { label: PowerService.batteryAvailable ? "Health / time" : "Profile holds", value: PowerService.batteryAvailable ? ((PowerService.batteryHealth >= 0 ? Math.round(PowerService.batteryHealth) + "% · " : "") + PowerService.formatDuration(PowerService.timeRemaining)) : String(PowerService.profileHolds.length) }
                        ]
                        delegate: Rectangle {
                            required property var modelData
                            width: (powerGrid.width - powerGrid.columnSpacing) / 2
                            height: root.unit * 0.82
                            radius: root.unit * 0.15
                            color: root.surfaceColor
                            Column {
                                anchors.fill: parent; anchors.margins: root.unit * 0.11; spacing: root.unit * 0.045
                                Text { width: parent.width; text: modelData.label; color: root.mutedColor; font.pixelSize: UiScale.text(root.unit * 0.095, root.unit); font.weight: Font.DemiBold; elide: Text.ElideRight }
                                Text { width: parent.width; text: modelData.value; color: root.foregroundColor; font.pixelSize: UiScale.text(root.unit * 0.13, root.unit); font.weight: Font.Bold; elide: Text.ElideRight }
                            }
                        }
                    }
                }

                Rectangle {
                    width: parent.width
                    height: root.unit * 0.58
                    radius: root.unit * 0.14
                    color: root.surfaceColor
                    Text {
                        anchors.fill: parent
                        anchors.margins: root.unit * 0.11
                        verticalAlignment: Text.AlignVCenter
                        text: PowerService.degradationReason !== "None" && PowerService.degradationReason !== "Unknown"
                            ? "Performance limited: " + PowerService.degradationReason
                            : (PowerService.profileHolds.length > 0
                                ? PowerService.profileHolds.length + " application power-profile hold" + (PowerService.profileHolds.length === 1 ? "" : "s") + " active"
                                : "Power profiles are managed through Quickshell / UPower")
                        color: root.mutedColor
                        font.pixelSize: UiScale.text(root.unit * 0.095, root.unit)
                        elide: Text.ElideRight
                    }
                }
            }
        }
    }
}
