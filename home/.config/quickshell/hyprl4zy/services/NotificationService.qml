pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Services.Notifications
import Quickshell.Services.Mpris

Item {
    id: root

    property bool available: true
    property bool paused: false
    property bool busy: false
    property bool panelActive: false
    property var activeEntries: []
    property var historyEntries: []
    property int revision: 0
    property int serialCounter: 0
    property string statusText: paused ? "Do Not Disturb enabled" : "Quickshell notification server active"
    property string errorText: ""

    readonly property int waitingCount: activeEntries.length
    readonly property int historyCount: historyEntries.length
    readonly property int maxVisible: 3
    readonly property int maxHistory: 40

    // MPRIS now-playing listener. It stays inside the notification service so
    // track changes reuse the same toast stack, animation and DND policy.
    readonly property var mediaPlayer: {
        const players = Mpris.players.values
        if (!players || players.length === 0)
            return null
        return players.find(candidate => candidate.isPlaying) || players[0]
    }
    readonly property string mediaTrackKey: {
        const player = mediaPlayer
        if (!player || !player.isPlaying)
            return ""
        return String(player.identity || "") + "|"
            + String(player.trackTitle || "") + "|"
            + String(player.trackArtist || "") + "|"
            + String(player.trackAlbum || "")
    }
    readonly property bool mediaPlaying: mediaPlayer !== null && mediaPlayer.isPlaying
    readonly property bool mediaCanPrevious: mediaPlayer !== null && mediaPlayer.canGoPrevious
    readonly property bool mediaCanNext: mediaPlayer !== null && mediaPlayer.canGoNext
    readonly property bool mediaCanToggle: mediaPlayer !== null && mediaPlayer.canTogglePlaying
    property bool mediaListenerPrimed: false
    property string lastMediaTrackKey: ""

    function refresh() {
        available = true
        busy = false
        errorText = ""
    }

    function togglePaused() {
        paused = !paused
        revision += 1
    }

    function hintValue(notification, name) {
        if (!notification || !notification.hints)
            return undefined
        const hints = notification.hints
        if (hints[name] !== undefined)
            return hints[name]
        return undefined
    }

    function coalesceKeyFor(notification) {
        const syncHint = hintValue(notification, "x-canonical-private-synchronous")
        const sync = syncHint === undefined ? "" : String(syncHint).trim()
        if (sync.length > 0)
            return "sync:" + sync

        const app = String(notification && notification.appName || "").trim().toLowerCase()
        const summary = String(notification && notification.summary || "").trim().toLowerCase()
        if (app === "system" && (summary === "volume" || summary === "brightness"))
            return "osd:" + summary

        return ""
    }

    function progressFor(notification) {
        const raw = hintValue(notification, "value")
        const value = Number(raw)
        if (!isFinite(value))
            return -1
        return Math.max(0, Math.min(100, Math.round(value)))
    }

    function timeoutFor(notification, isOsd) {
        // Keep every toast on screen for a predictable five seconds. OSD
        // notifications still coalesce in place, so holding volume/brightness
        // never creates a burst even with the longer lifetime.
        return 5000
    }

    function snapshot(entry) {
        return {
            id: entry.id,
            serial: entry.serial,
            appName: entry.appName,
            summary: entry.summary,
            body: entry.body,
            appIcon: entry.appIcon,
            image: entry.image,
            timestamp: entry.timestamp,
            coalesceKey: entry.coalesceKey,
            progressValue: entry.progressValue,
            isOsd: entry.isOsd,
            isMedia: entry.isMedia === true
        }
    }

    function removeActiveExact(id, serial) {
        const next = activeEntries.filter(entry => !(entry.id === id && entry.serial === serial))
        if (next.length !== activeEntries.length) {
            activeEntries = next
            revision += 1
        }
    }

    function expireEntry(entry) {
        if (!entry)
            return
        if (!entry.notification) {
            removeActiveExact(entry.id, entry.serial)
            return
        }
        try {
            entry.notification.expire()
        } catch (error) {
            removeActiveExact(entry.id, entry.serial)
        }
    }

    function dismiss(id) {
        const entry = activeEntries.find(value => value.id === id)
        if (!entry)
            return
        if (!entry.notification) {
            removeActiveExact(entry.id, entry.serial)
            return
        }
        try {
            entry.notification.dismiss()
        } catch (error) {
            removeActiveExact(entry.id, entry.serial)
        }
    }

    function expire(id) {
        const entry = activeEntries.find(value => value.id === id)
        expireEntry(entry)
    }

    function expireSerial(id, serial) {
        const entry = activeEntries.find(value => value.id === id && value.serial === serial)
        expireEntry(entry)
    }

    function invokeAction(id, index) {
        const entry = activeEntries.find(value => value.id === id)
        if (!entry || !entry.notification)
            return
        const actions = entry.notification.actions || []
        if (index < 0 || index >= actions.length)
            return
        try {
            actions[index].invoke()
        } catch (error) {
            console.warn("hyprl4zy notification action failed:", error)
        }
    }

    function closeVisible() {
        const previous = activeEntries.slice()
        activeEntries = []
        revision += 1
        for (let i = 0; i < previous.length; ++i)
            expireEntry(previous[i])
    }

    function clearHistory() {
        historyEntries = []
        revision += 1
    }

    function activeForScreen(screenName) {
        const name = String(screenName || "")
        const screens = Quickshell.screens.map(screen => screen.name)
        const fallback = ShellControl.targetScreenName()
        return activeEntries.filter(entry => entry.screenName === name
            || (screens.indexOf(entry.screenName) < 0 && name === fallback))
    }

    function accept(notification) {
        if (!notification)
            return

        notification.tracked = true

        const key = coalesceKeyFor(notification)
        const isOsd = key.length > 0
        const serial = ++serialCounter
        const entry = {
            id: notification.id,
            serial: serial,
            identity: key.length > 0 ? key : "notification:" + notification.id + ":" + serial,
            coalesceKey: key,
            isOsd: isOsd,
            isMedia: false,
            progressValue: progressFor(notification),
            notification: notification,
            appName: String(notification.appName || notification.desktopEntry || "Application"),
            summary: String(notification.summary || "Notification"),
            body: String(notification.body || ""),
            appIcon: String(notification.appIcon || ""),
            image: String(notification.image || ""),
            screenName: ShellControl.targetScreenName(),
            timestamp: Date.now(),
            timeoutMs: timeoutFor(notification, isOsd)
        }

        // OSD-style notifications are live state, not history. This keeps volume
        // and brightness key repeats from flooding either the toast stack or the
        // notification panel. The same rule respects the standard transient hint.
        if (!isOsd && !notification.transient) {
            historyEntries = [snapshot(entry)]
                .concat(historyEntries.filter(value => value.id !== entry.id))
                .slice(0, maxHistory)
        }

        if (paused) {
            revision += 1
            Qt.callLater(function() {
                try {
                    if (notification.tracked)
                        notification.expire()
                } catch (error) {
                    // The sender may already have withdrawn the notification.
                }
            })
            return
        }

        const previousEntries = activeEntries.slice()
        let replacementIndex = -1
        if (key.length > 0)
            replacementIndex = previousEntries.findIndex(value => value.coalesceKey === key)
        if (replacementIndex < 0)
            replacementIndex = previousEntries.findIndex(value => value.id === entry.id)

        let next
        if (replacementIndex >= 0) {
            next = previousEntries.slice()
            next[replacementIndex] = entry
        } else {
            next = [entry].concat(previousEntries)
        }

        const overflow = next.slice(maxVisible)
        activeEntries = next.slice(0, maxVisible)
        revision += 1

        notification.closed.connect(function() {
            root.removeActiveExact(entry.id, entry.serial)
        })

        // Explicitly retire the old tracked object after the new state is in
        // place. removeActiveExact() is serial-aware, so the old closed signal
        // cannot accidentally remove a newer coalesced OSD with the same id.
        if (replacementIndex >= 0) {
            const previous = previousEntries[replacementIndex]
            if (previous && previous.notification
                    && previous.notification !== notification
                    && previous.id !== entry.id)
                expireEntry(previous)
        }

        for (let i = 0; i < overflow.length; ++i) {
            const old = overflow[i]
            if (!old || old.serial === entry.serial)
                continue
            expireEntry(old)
        }
    }

    function mediaPrevious() {
        if (mediaPlayer && mediaPlayer.canGoPrevious)
            mediaPlayer.previous()
    }

    function mediaToggle() {
        if (mediaPlayer && mediaPlayer.canTogglePlaying)
            mediaPlayer.togglePlaying()
    }

    function mediaNext() {
        if (mediaPlayer && mediaPlayer.canGoNext)
            mediaPlayer.next()
    }

    function publishMediaTrack() {
        const player = mediaPlayer
        const key = mediaTrackKey
        if (!player || !player.isPlaying || key.length === 0)
            return

        if (!mediaListenerPrimed) {
            mediaListenerPrimed = true
            lastMediaTrackKey = key
            return
        }
        if (key === lastMediaTrackKey)
            return
        lastMediaTrackKey = key

        if (paused)
            return

        const serial = ++serialCounter
        const title = String(player.trackTitle || player.identity || "Unknown track")
        const artist = String(player.trackArtist || "")
        const album = String(player.trackAlbum || "")
        const body = artist.length > 0
            ? (album.length > 0 ? artist + " · " + album : artist)
            : album
        const entry = {
            id: -serial,
            serial: serial,
            identity: "media-now-playing:" + serial,
            coalesceKey: "media:now-playing",
            isOsd: false,
            isMedia: true,
            progressValue: -1,
            notification: null,
            appName: String(player.identity || "Now Playing"),
            summary: title,
            body: body,
            appIcon: "audio-x-generic",
            image: String(player.trackArtUrl || ""),
            screenName: ShellControl.targetScreenName(),
            timestamp: Date.now(),
            timeoutMs: 5000
        }

        const previous = activeEntries.slice()
        const replacementIndex = previous.findIndex(value => value.coalesceKey === entry.coalesceKey)
        let next = previous.slice()
        if (replacementIndex >= 0)
            next[replacementIndex] = entry
        else
            next = [entry].concat(previous)

        const overflow = next.slice(maxVisible)
        activeEntries = next.slice(0, maxVisible)
        revision += 1
        for (let i = 0; i < overflow.length; ++i)
            expireEntry(overflow[i])
    }

    onMediaTrackKeyChanged: {
        if (mediaTrackKey.length > 0)
            mediaDebounce.restart()
    }

    Timer {
        id: mediaDebounce
        interval: 220
        repeat: false
        onTriggered: root.publishMediaTrack()
    }

    NotificationServer {
        id: server
        keepOnReload: false
        bodySupported: true
        bodyMarkupSupported: false
        bodyHyperlinksSupported: false
        actionsSupported: true
        actionIconsSupported: false
        imageSupported: true
        bodyImagesSupported: false
        persistenceSupported: false
        extraHints: ["x-canonical-private-synchronous", "value"]
        onNotification: notification => root.accept(notification)
    }

    Component.onCompleted: refresh()
}
