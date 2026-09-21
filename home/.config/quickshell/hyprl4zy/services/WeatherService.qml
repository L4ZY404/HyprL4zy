pragma Singleton
import QtQuick

Item {
    id: root

    property bool started: false
    property bool available: false
    property bool loading: false
    property string errorText: ""
    property real temperature: 0
    property real apparentTemperature: 0
    property real humidity: 0
    property int weatherCode: 0
    property real windSpeed: 0
    property var forecastDays: []
    property var forecastHighs: []
    property var forecastLows: []
    property var forecastCodes: []
    property var forecastPrecipitation: []
    property date lastUpdated: new Date(0)

    property bool searchLoading: false
    property string searchError: ""
    property var searchResults: []

    property int weatherRequestSerial: 0
    property int searchRequestSerial: 0

    readonly property string locationName: SettingsService.weatherName
    readonly property real latitude: SettingsService.weatherLatitude
    readonly property real longitude: SettingsService.weatherLongitude
    readonly property bool locationConfigured: String(locationName || "").trim().length > 0

    function beginIfReady() {
        if (!SettingsService.ready || started)
            return
        started = true
        if (locationConfigured)
            refresh()
        else {
            available = false
            loading = false
            errorText = "Set a weather location"
        }
    }

    function refresh() {
        if (!SettingsService.ready)
            return
        if (!locationConfigured) {
            available = false
            loading = false
            errorText = "Set a weather location"
            return
        }

        const serial = ++weatherRequestSerial
        loading = true
        errorText = ""

        const url = "https://api.open-meteo.com/v1/forecast?latitude=" + encodeURIComponent(latitude)
            + "&longitude=" + encodeURIComponent(longitude)
            + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m"
            + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
            + "&timezone=auto&forecast_days=5"

        const request = new XMLHttpRequest()
        request.onreadystatechange = function() {
            if (request.readyState !== XMLHttpRequest.DONE || serial !== root.weatherRequestSerial)
                return

            root.loading = false
            if (request.status < 200 || request.status >= 300) {
                root.available = false
                root.errorText = "Weather request failed"
                return
            }

            try {
                const payload = JSON.parse(request.responseText)
                const current = payload.current || null
                if (!current) {
                    root.available = false
                    root.errorText = "Weather data unavailable"
                    return
                }

                root.temperature = Number(current.temperature_2m)
                root.apparentTemperature = Number(current.apparent_temperature)
                root.humidity = Number(current.relative_humidity_2m)
                root.weatherCode = Number(current.weather_code)
                root.windSpeed = Number(current.wind_speed_10m || 0)

                const daily = payload.daily || ({})
                root.forecastDays = daily.time || []
                root.forecastHighs = daily.temperature_2m_max || []
                root.forecastLows = daily.temperature_2m_min || []
                root.forecastCodes = daily.weather_code || []
                root.forecastPrecipitation = daily.precipitation_probability_max || []

                root.available = isFinite(root.temperature)
                root.errorText = root.available ? "" : "Weather data unavailable"
                if (root.available)
                    root.lastUpdated = new Date()
            } catch (error) {
                root.available = false
                root.errorText = "Could not parse weather data"
            }
        }

        request.open("GET", url)
        request.send()
    }

    function searchLocation(query) {
        const serial = ++searchRequestSerial
        searchLoading = false
        const trimmed = String(query || "").trim()
        if (trimmed.length < 2) {
            searchResults = []
            searchError = "Type at least two characters"
            return
        }

        searchLoading = true
        searchError = ""
        searchResults = []

        const url = "https://geocoding-api.open-meteo.com/v1/search?name="
            + encodeURIComponent(trimmed)
            + "&count=5&language=en&format=json"
        const request = new XMLHttpRequest()
        request.onreadystatechange = function() {
            if (request.readyState !== XMLHttpRequest.DONE || serial !== root.searchRequestSerial)
                return

            root.searchLoading = false
            if (request.status < 200 || request.status >= 300) {
                root.searchError = "Location search failed"
                return
            }

            try {
                const payload = JSON.parse(request.responseText)
                root.searchResults = payload.results || []
                if (root.searchResults.length === 0)
                    root.searchError = "No matching locations"
            } catch (error) {
                root.searchError = "Could not parse location results"
            }
        }
        request.open("GET", url)
        request.send()
    }

    function displayNameFor(result) {
        if (!result)
            return ""
        const values = [result.name, result.admin1, result.country]
        const parts = []
        for (let i = 0; i < values.length; ++i) {
            const value = values[i] ? String(values[i]).trim() : ""
            if (!value)
                continue
            if (parts.length > 0 && parts[parts.length - 1].toLowerCase() === value.toLowerCase())
                continue
            parts.push(value)
        }
        return parts.join(", ")
    }

    function selectLocation(result) {
        if (!result)
            return
        const latitudeValue = Number(result.latitude)
        const longitudeValue = Number(result.longitude)
        if (!isFinite(latitudeValue) || !isFinite(longitudeValue))
            return

        SettingsService.weatherName = displayNameFor(result) || "Custom location"
        SettingsService.weatherLatitude = Math.max(-90, Math.min(90, latitudeValue))
        SettingsService.weatherLongitude = Math.max(-180, Math.min(180, longitudeValue))
        ++searchRequestSerial
        searchLoading = false
        searchResults = []
        searchError = ""
        locationRefresh.restart()
    }

    Component.onCompleted: beginIfReady()

    Connections {
        target: SettingsService
        function onReadyChanged() { root.beginIfReady() }
        function onWeatherNameChanged() {
            if (!root.started)
                return
            if (root.locationConfigured)
                locationRefresh.restart()
            else {
                root.available = false
                root.loading = false
                root.errorText = "Set a weather location"
            }
        }
        function onWeatherLatitudeChanged() { if (root.started) locationRefresh.restart() }
        function onWeatherLongitudeChanged() { if (root.started) locationRefresh.restart() }
    }

    Timer {
        id: locationRefresh
        interval: 180
        repeat: false
        onTriggered: root.refresh()
    }

    Timer {
        interval: 15 * 60 * 1000
        repeat: true
        running: root.started
        onTriggered: root.refresh()
    }
}
