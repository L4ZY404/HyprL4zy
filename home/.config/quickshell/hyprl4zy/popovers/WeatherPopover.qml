import QtQuick
import "../components"
import "../services"

Rectangle {
    id: root

    required property real unit
    required property color backgroundColor
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    required property color surfaceColor
    required property bool available
    required property bool loading
    required property real temperature
    required property real apparentTemperature
    required property real humidity
    required property int weatherCode
    required property real windSpeed
    required property var forecastDays
    required property var forecastHighs
    required property var forecastLows
    required property var forecastCodes
    required property var forecastPrecipitation
    required property string locationName
    required property string errorText
    signal refreshRequested()

    readonly property int visibleSearchResults: Math.min(3, WeatherService.searchResults.length)
    implicitHeight: unit * (4.48 + visibleSearchResults * 0.52)

    radius: unit * 0.28
    color: backgroundColor
    border.width: Math.max(1, unit * 0.025)
    border.color: backgroundColor
    antialiasing: true

    function shortDay(value) {
        if (!value)
            return "--"
        const date = new Date(value + "T12:00:00")
        return Qt.formatDate(date, "ddd")
    }

    function conditionFor(code) {
        const value = Number(code)
        if (value === 0) return "Clear"
        if (value === 1 || value === 2) return "Partly cloudy"
        if (value === 3) return "Overcast"
        if (value === 45 || value === 48) return "Fog"
        if (value >= 51 && value <= 57) return "Drizzle"
        if (value >= 61 && value <= 67) return "Rain"
        if (value >= 71 && value <= 77) return "Snow"
        if (value >= 80 && value <= 82) return "Showers"
        if (value >= 85 && value <= 86) return "Snow showers"
        if (value >= 95) return "Thunderstorm"
        return "Weather"
    }

    function runLocationSearch() {
        WeatherService.searchLocation(searchInput.text)
    }

    Column {
        anchors.fill: parent
        anchors.margins: root.unit * 0.22
        spacing: root.unit * 0.095

        Row {
            width: parent.width
            spacing: root.unit * 0.18

            Item {
                width: root.unit * 0.70
                height: root.unit * 0.78

                WeatherGlyph {
                    anchors.horizontalCenter: parent.horizontalCenter
                    y: root.unit * 0.07
                    width: root.unit * 0.70
                    height: width
                    weatherCode: root.weatherCode
                    color: root.available ? root.accentColor : root.mutedColor
                }
            }

            Column {
                width: parent.width - root.unit * 0.88
                anchors.verticalCenter: parent.verticalCenter
                spacing: root.unit * 0.018

                Text {
                    text: root.loading ? "…" : (root.available ? Math.round(root.temperature) + "°C" : "--")
                    color: root.foregroundColor
                    font.pixelSize: UiScale.text(root.unit * 0.32, root.unit)
                    font.weight: Font.Bold
                }

                Text {
                    width: parent.width
                    text: root.available ? root.conditionFor(root.weatherCode) : (root.errorText || "Weather unavailable")
                    color: root.mutedColor
                    font.pixelSize: UiScale.text(root.unit * 0.13, root.unit)
                    font.weight: Font.Medium
                    elide: Text.ElideRight
                }

                Text {
                    width: parent.width
                    text: root.available
                        ? "Feels " + Math.round(root.apparentTemperature) + "° · " + Math.round(root.humidity) + "% humidity · " + Math.round(root.windSpeed) + " km/h wind"
                        : ""
                    color: root.mutedColor
                    font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
                    elide: Text.ElideRight
                }
            }
        }

        Text {
            width: parent.width
            text: root.locationName
            color: root.accentColor
            font.pixelSize: UiScale.text(root.unit * 0.13, root.unit)
            font.weight: Font.DemiBold
            elide: Text.ElideRight
        }

        Row {
            id: forecastRow
            width: parent.width
            spacing: root.unit * 0.08

            Repeater {
                model: Math.min(4, root.forecastDays ? root.forecastDays.length : 0)

                delegate: Rectangle {
                    required property int index
                    width: (forecastRow.width - forecastRow.spacing * 3) / 4
                    height: root.unit * 1.32
                    radius: root.unit * 0.15
                    color: root.surfaceColor

                    Column {
                        anchors.centerIn: parent
                        spacing: root.unit * 0.025

                        Text {
                            anchors.horizontalCenter: parent.horizontalCenter
                            text: root.shortDay(root.forecastDays[index])
                            color: root.mutedColor
                            font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
                            font.weight: Font.DemiBold
                        }

                        WeatherGlyph {
                            anchors.horizontalCenter: parent.horizontalCenter
                            width: root.unit * 0.34
                            height: width
                            weatherCode: Number(root.forecastCodes[index] || 0)
                            color: root.accentColor
                        }

                        Text {
                            anchors.horizontalCenter: parent.horizontalCenter
                            text: Math.round(Number(root.forecastHighs[index] || 0)) + "°"
                            color: root.foregroundColor
                            font.pixelSize: UiScale.text(root.unit * 0.13, root.unit)
                            font.weight: Font.Bold
                        }

                        Text {
                            anchors.horizontalCenter: parent.horizontalCenter
                            text: Math.round(Number(root.forecastLows[index] || 0)) + "°"
                            color: root.mutedColor
                            font.pixelSize: UiScale.text(root.unit * 0.10, root.unit)
                            font.weight: Font.Medium
                        }

                        Text {
                            anchors.horizontalCenter: parent.horizontalCenter
                            text: Math.round(Number(root.forecastPrecipitation[index] || 0)) + "%"
                            color: root.accentColor
                            font.pixelSize: UiScale.text(root.unit * 0.09, root.unit)
                            font.weight: Font.DemiBold
                        }
                    }
                }
            }
        }

        Item {
            width: parent.width
            height: root.unit * 0.44

            Text {
                anchors {
                    left: parent.left
                    verticalCenter: parent.verticalCenter
                }
                text: WeatherService.lastUpdated.getTime() > 0
                    ? "Updated " + Qt.formatTime(WeatherService.lastUpdated, "hh:mm")
                    : "Not updated yet"
                color: root.mutedColor
                font.pixelSize: UiScale.text(root.unit * 0.10, root.unit)
            }

            Rectangle {
                anchors {
                    right: parent.right
                    verticalCenter: parent.verticalCenter
                }
                width: root.unit * 1.12
                height: root.unit * 0.40
                radius: height / 2
                color: root.surfaceColor

                Text {
                    anchors.centerIn: parent
                    text: root.loading ? "…" : "Refresh"
                    color: root.accentColor
                    font.pixelSize: UiScale.text(root.unit * 0.11, root.unit)
                    font.weight: Font.Bold
                }

                MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.refreshRequested()
                }
            }
        }

        Rectangle {
            width: parent.width
            height: Math.max(1, root.unit * 0.012)
            radius: height / 2
            color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.28)
        }

        Rectangle {
            id: searchBox
            width: parent.width
            height: root.unit * 0.48
            radius: root.unit * 0.12
            color: root.surfaceColor
            border.width: searchInput.activeFocus ? Math.max(1, root.unit * 0.012) : 0
            border.color: root.accentColor

            Text {
                visible: searchInput.text.length === 0 && !searchInput.activeFocus
                anchors {
                    left: parent.left
                    leftMargin: root.unit * 0.14
                    verticalCenter: parent.verticalCenter
                }
                text: "Search location"
                color: root.mutedColor
                font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
            }

            TextInput {
                id: searchInput
                anchors {
                    left: parent.left
                    right: searchButton.left
                    leftMargin: root.unit * 0.14
                    rightMargin: root.unit * 0.10
                    verticalCenter: parent.verticalCenter
                }
                color: root.foregroundColor
                selectionColor: root.accentColor
                selectedTextColor: root.backgroundColor
                font.pixelSize: UiScale.text(root.unit * 0.12, root.unit)
                clip: true
                onAccepted: root.runLocationSearch()
            }

            Rectangle {
                id: searchButton
                anchors {
                    right: parent.right
                    rightMargin: root.unit * 0.055
                    verticalCenter: parent.verticalCenter
                }
                width: root.unit * 0.78
                height: root.unit * 0.36
                radius: height / 2
                color: Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.16)

                Text {
                    anchors.centerIn: parent
                    text: WeatherService.searchLoading ? "…" : "Find"
                    color: root.accentColor
                    font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
                    font.weight: Font.Bold
                }

                MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.runLocationSearch()
                }
            }
        }

        Text {
            visible: WeatherService.searchError.length > 0
            width: parent.width
            text: WeatherService.searchError
            color: root.mutedColor
            font.pixelSize: UiScale.text(root.unit * 0.105, root.unit)
            elide: Text.ElideRight
        }

        Column {
            id: searchResultsColumn
            width: parent.width
            spacing: root.unit * 0.06
            visible: root.visibleSearchResults > 0

            Repeater {
                model: WeatherService.searchResults.slice(0, 3)

                delegate: Rectangle {
                    id: resultRow
                    required property var modelData
                    width: searchResultsColumn.width
                    height: root.unit * 0.50
                    radius: root.unit * 0.11
                    color: root.surfaceColor

                    Text {
                        anchors {
                            left: parent.left
                            right: parent.right
                            leftMargin: root.unit * 0.12
                            rightMargin: root.unit * 0.12
                            verticalCenter: parent.verticalCenter
                        }
                        text: WeatherService.displayNameFor(resultRow.modelData)
                        color: root.foregroundColor
                        font.pixelSize: UiScale.text(root.unit * 0.115, root.unit)
                        elide: Text.ElideRight
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            WeatherService.selectLocation(resultRow.modelData)
                            searchInput.text = ""
                        }
                    }
                }
            }
        }

    }
}
