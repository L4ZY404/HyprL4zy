pragma Singleton
import QtQuick
import Quickshell.Services.Pipewire

Item {
    id: root

    readonly property bool ready: Pipewire.ready
    readonly property var defaultSink: Pipewire.defaultAudioSink
    readonly property var defaultSource: Pipewire.defaultAudioSource

    readonly property var audioNodes: Pipewire.nodes.values.filter(node => node && node.audio)
    readonly property var outputDevices: audioNodes.filter(node => !node.isStream && node.isSink)
    readonly property var inputDevices: audioNodes.filter(node => !node.isStream && !node.isSink)
    readonly property var playbackStreams: audioNodes.filter(node => node.isStream && !node.isSink)

    readonly property bool outputAvailable: defaultSink !== null && defaultSink.ready && defaultSink.audio !== null
    readonly property bool inputAvailable: defaultSource !== null && defaultSource.ready && defaultSource.audio !== null
    readonly property real outputVolume: outputAvailable ? defaultSink.audio.volume : 0
    readonly property real inputVolume: inputAvailable ? defaultSource.audio.volume : 0
    readonly property bool outputMuted: outputAvailable ? defaultSink.audio.muted : false
    readonly property bool inputMuted: inputAvailable ? defaultSource.audio.muted : false

    // Bind only audio nodes. Volume, mute and node.properties require a bound object.
    PwObjectTracker {
        objects: root.audioNodes
    }

    function clampVolume(value) {
        const numeric = Number(value)
        if (!isFinite(numeric))
            return 0
        return Math.max(0, Math.min(1, numeric))
    }

    function setOutputVolume(value) {
        if (outputAvailable)
            defaultSink.audio.volume = clampVolume(value)
    }

    function adjustOutputVolume(delta) {
        if (outputAvailable)
            setOutputVolume(outputVolume + Number(delta || 0))
    }

    function toggleOutputMute() {
        if (outputAvailable)
            defaultSink.audio.muted = !defaultSink.audio.muted
    }

    function setInputVolume(value) {
        if (inputAvailable)
            defaultSource.audio.volume = clampVolume(value)
    }

    function toggleInputMute() {
        if (inputAvailable)
            defaultSource.audio.muted = !defaultSource.audio.muted
    }

    function setDefaultOutput(node) {
        if (node)
            Pipewire.preferredDefaultAudioSink = node
    }

    function setDefaultInput(node) {
        if (node)
            Pipewire.preferredDefaultAudioSource = node
    }

    function setNodeVolume(node, value) {
        if (node && node.ready && node.audio)
            node.audio.volume = clampVolume(value)
    }

    function toggleNodeMute(node) {
        if (node && node.ready && node.audio)
            node.audio.muted = !node.audio.muted
    }

    function nodeName(node) {
        if (!node)
            return "Unavailable"
        return node.description || node.nickname || node.name || "Audio device"
    }

    function streamName(node) {
        if (!node)
            return "Application"
        if (node.ready) {
            const properties = node.properties || ({})
            const applicationName = properties["application.name"] || properties["application.process.binary"]
            if (applicationName)
                return String(applicationName)
        }
        return node.description || node.nickname || node.name || "Application"
    }

    function streamSubtitle(node) {
        if (!node || !node.ready)
            return "Playback stream"
        const properties = node.properties || ({})
        return String(properties["media.name"] || properties["media.title"] || "Playback stream")
    }
}
