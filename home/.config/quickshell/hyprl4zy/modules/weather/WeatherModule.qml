import QtQuick
import "../../components"
import "../../services"

Item {
    id: root

    required property real unit
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    property color surfaceColor: Qt.rgba(1, 1, 1, 0.05)

    readonly property bool available: WeatherService.available
    readonly property bool loading: WeatherService.loading
    readonly property string errorText: WeatherService.errorText
    readonly property real temperature: WeatherService.temperature
    readonly property real apparentTemperature: WeatherService.apparentTemperature
    readonly property real humidity: WeatherService.humidity
    readonly property int weatherCode: WeatherService.weatherCode
    readonly property real windSpeed: WeatherService.windSpeed
    readonly property var forecastDays: WeatherService.forecastDays
    readonly property var forecastHighs: WeatherService.forecastHighs
    readonly property var forecastLows: WeatherService.forecastLows
    readonly property var forecastCodes: WeatherService.forecastCodes
    readonly property var forecastPrecipitation: WeatherService.forecastPrecipitation
    readonly property string locationName: WeatherService.locationName
    signal activated()

    implicitHeight: unit * 0.96

    function refresh() {
        WeatherService.refresh()
    }

    Column {
        anchors.centerIn: parent
        spacing: -root.unit * 0.01

        WeatherGlyph {
            anchors.horizontalCenter: parent.horizontalCenter
            width: root.unit * 0.50
            height: width
            weatherCode: root.weatherCode
            color: root.available ? root.accentColor : root.mutedColor
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: root.loading ? "…" : (root.available ? Math.round(root.temperature) + "°" : "--°")
            color: root.available ? root.foregroundColor : root.mutedColor
            font.pixelSize: UiScale.text(root.unit * 0.19, root.unit)
            font.weight: Font.Bold
        }
    }

    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        cursorShape: Qt.PointingHandCursor
        onClicked: mouse => {
            if (mouse.button === Qt.RightButton)
                root.refresh()
            else
                root.activated()
        }
    }
}
