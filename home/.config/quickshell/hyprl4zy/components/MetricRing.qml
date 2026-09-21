import QtQuick
import "../services"

Item {
    id: root

    required property real unit
    required property real value
    required property string label
    required property color foregroundColor
    required property color mutedColor
    required property color accentColor
    property color surfaceColor: Qt.rgba(1, 1, 1, 0.05)
    property string suffix: ""

    // Keep metric updates calm instead of snapping between samples.
    property real animatedValue: value
    readonly property real normalizedValue: Math.max(0, Math.min(100, animatedValue)) / 100

    Behavior on animatedValue {
        enabled: SettingsService.animations
        NumberAnimation {
            duration: 420
            easing.type: Easing.OutCubic
        }
    }

    Canvas {
        id: ring
        anchors.fill: parent
        antialiasing: true

        onPaint: {
            const ctx = getContext("2d")
            ctx.clearRect(0, 0, width, height)

            const cx = width / 2
            const cy = height / 2
            const radius = Math.max(1, Math.min(width, height) * 0.40)
            const line = Math.max(2.8, root.unit * 0.068)
            const start = Math.PI * 0.72
            const sweep = Math.PI * 1.56

            ctx.lineCap = "round"
            ctx.lineWidth = line

            ctx.beginPath()
            ctx.strokeStyle = root.surfaceColor
            ctx.arc(cx, cy, radius, start, start + sweep, false)
            ctx.stroke()

            ctx.beginPath()
            ctx.strokeStyle = root.accentColor
            ctx.arc(cx, cy, radius, start, start + sweep * root.normalizedValue, false)
            ctx.stroke()
        }
    }

    onAnimatedValueChanged: ring.requestPaint()
    onWidthChanged: ring.requestPaint()
    onHeightChanged: ring.requestPaint()
    onAccentColorChanged: ring.requestPaint()
    onSurfaceColorChanged: ring.requestPaint()

    Column {
        anchors.centerIn: parent
        spacing: -root.unit * 0.004

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: Math.round(root.animatedValue) + root.suffix
            color: root.foregroundColor
            font.pixelSize: UiScale.text(root.unit * 0.182, root.unit)
            font.weight: Font.Bold
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: root.label
            color: root.mutedColor
            font.pixelSize: UiScale.text(root.unit * 0.112, root.unit)
            font.weight: Font.DemiBold
        }
    }
}
