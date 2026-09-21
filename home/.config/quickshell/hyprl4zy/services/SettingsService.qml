pragma Singleton
import QtQuick
import Quickshell.Io

Item {
    id: root

    // Selected live Pywal foreground/accent slot. 11 preserves the original hyprl4zy default.
    property int accentSlot: 11
    property bool animations: true
    property bool clock24: true
    property string weatherName: ""
    property string wallpaperDirectory: ""
    property string currentWallpaper: ""
    property var favoriteApps: []
    property var recentApps: []
    property real weatherLatitude: 0
    property real weatherLongitude: 0
    property bool ready: false
    property string saveStatus: "Loading preferences…"


    function normalizeAppList(value, limit) {
        if (!Array.isArray(value))
            return []
        const result = []
        for (let i = 0; i < value.length && result.length < limit; ++i) {
            const id = String(value[i] || "").trim()
            if (id.length > 0 && result.indexOf(id) < 0)
                result.push(id)
        }
        return result
    }

    function isFavoriteApp(appId) {
        const id = String(appId || "").trim()
        return id.length > 0 && favoriteApps.indexOf(id) >= 0
    }

    function toggleFavoriteApp(appId) {
        const id = String(appId || "").trim()
        if (!id.length)
            return
        const next = favoriteApps.slice()
        const index = next.indexOf(id)
        if (index >= 0)
            next.splice(index, 1)
        else
            next.unshift(id)
        favoriteApps = normalizeAppList(next, 16)
    }

    function recordLaunchedApp(appId) {
        const id = String(appId || "").trim()
        if (!id.length)
            return
        const next = recentApps.filter(value => value !== id)
        next.unshift(id)
        recentApps = normalizeAppList(next, 12)
    }

    function save() {
        if (!ready)
            return
        saveStatus = "Saving…"
        debounce.restart()
    }

    onAccentSlotChanged: save()
    onAnimationsChanged: save()
    onClock24Changed: save()
    onWeatherNameChanged: save()
    onWeatherLatitudeChanged: save()
    onWeatherLongitudeChanged: save()
    onWallpaperDirectoryChanged: save()
    onCurrentWallpaperChanged: save()
    onFavoriteAppsChanged: save()
    onRecentAppsChanged: save()

    Timer {
        id: debounce
        interval: 200
        onTriggered: file.setText(JSON.stringify({
            accentSlot: root.accentSlot,
            animations: root.animations,
            clock24: root.clock24,
            weatherName: root.weatherName,
            weatherLatitude: root.weatherLatitude,
            weatherLongitude: root.weatherLongitude,
            wallpaperDirectory: root.wallpaperDirectory,
            currentWallpaper: root.currentWallpaper,
            favoriteApps: root.favoriteApps,
            recentApps: root.recentApps
        }, null, 2))
    }

    FileView {
        id: file
        path: Qt.resolvedUrl("../settings.json")
        printErrors: false

        onLoaded: {
            try {
                const data = JSON.parse(text())
                // alpha28 and older stored accentIndex for a fixed five-color palette.
                // Do not reinterpret those values as Pywal slots; migrate them to @color11.
                root.accentSlot = Number.isInteger(data.accentSlot)
                    ? Math.max(0, Math.min(15, data.accentSlot))
                    : 11
                root.animations = data.animations !== false
                root.clock24 = data.clock24 !== false

                const latitude = Number(data.weatherLatitude)
                const longitude = Number(data.weatherLongitude)
                root.weatherName = typeof data.weatherName === "string" && data.weatherName.trim().length > 0
                    ? data.weatherName.trim()
                    : ""
                root.weatherLatitude = isFinite(latitude) && latitude >= -90 && latitude <= 90
                    ? latitude
                    : 0
                root.weatherLongitude = isFinite(longitude) && longitude >= -180 && longitude <= 180
                    ? longitude
                    : 0
                root.wallpaperDirectory = typeof data.wallpaperDirectory === "string"
                    ? data.wallpaperDirectory.trim()
                    : ""
                root.currentWallpaper = typeof data.currentWallpaper === "string"
                    ? data.currentWallpaper.trim()
                    : ""
                root.favoriteApps = root.normalizeAppList(data.favoriteApps, 16)
                root.recentApps = root.normalizeAppList(data.recentApps, 12)
                root.saveStatus = "Preferences saved locally"
            } catch (error) {
                root.saveStatus = "Invalid preferences — using defaults"
            }
            root.ready = true
        }

        onLoadFailed: {
            root.ready = true
            root.saveStatus = "Using default preferences"
        }
        onSaved: root.saveStatus = "Preferences saved locally"
        onSaveFailed: root.saveStatus = "Could not save preferences"
    }
}
