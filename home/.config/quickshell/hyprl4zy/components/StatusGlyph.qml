import QtQuick

Item {
    id: root

    property string kind: "wifi"
    property color color: "#6791a9"
    property real lineWidth: Math.max(1.4, width * 0.085)
    property bool disabled: false

    onKindChanged: canvas.requestPaint()
    onColorChanged: canvas.requestPaint()
    onLineWidthChanged: canvas.requestPaint()
    onDisabledChanged: canvas.requestPaint()
    onWidthChanged: canvas.requestPaint()
    onHeightChanged: canvas.requestPaint()

    Canvas {
        id: canvas
        anchors.fill: parent
        antialiasing: true

        onPaint: {
            const ctx = getContext("2d")
            ctx.clearRect(0, 0, width, height)
            ctx.strokeStyle = root.color
            ctx.fillStyle = root.color
            ctx.lineWidth = root.lineWidth
            ctx.lineCap = "round"
            ctx.lineJoin = "round"

            const w = width
            const h = height
            const cx = w / 2

            if (root.kind === "wifi") {
                const baseY = h * 0.70
                const radii = [w * 0.34, w * 0.235, w * 0.125]
                for (let i = 0; i < radii.length; ++i) {
                    ctx.beginPath()
                    ctx.arc(cx, baseY, radii[i], Math.PI * 1.18, Math.PI * 1.82, false)
                    ctx.stroke()
                }
                ctx.beginPath()
                ctx.arc(cx, baseY, w * 0.035, 0, Math.PI * 2)
                ctx.fill()
            } else if (root.kind === "bluetooth") {
                ctx.beginPath()
                ctx.moveTo(cx, h * 0.12)
                ctx.lineTo(cx, h * 0.88)
                ctx.moveTo(cx, h * 0.12)
                ctx.lineTo(w * 0.73, h * 0.32)
                ctx.lineTo(w * 0.30, h * 0.66)
                ctx.moveTo(cx, h * 0.88)
                ctx.lineTo(w * 0.73, h * 0.68)
                ctx.lineTo(w * 0.30, h * 0.34)
                ctx.stroke()
            } else if (root.kind === "speaker") {
                ctx.beginPath()
                ctx.moveTo(w * 0.16, h * 0.40)
                ctx.lineTo(w * 0.34, h * 0.40)
                ctx.lineTo(w * 0.56, h * 0.22)
                ctx.lineTo(w * 0.56, h * 0.78)
                ctx.lineTo(w * 0.34, h * 0.60)
                ctx.lineTo(w * 0.16, h * 0.60)
                ctx.closePath()
                ctx.fill()

                if (!root.disabled) {
                    ctx.beginPath()
                    ctx.arc(w * 0.53, h * 0.50, w * 0.20, -0.80, 0.80, false)
                    ctx.stroke()
                    ctx.beginPath()
                    ctx.arc(w * 0.53, h * 0.50, w * 0.31, -0.70, 0.70, false)
                    ctx.stroke()
                } else {
                    ctx.beginPath()
                    ctx.moveTo(w * 0.68, h * 0.37)
                    ctx.lineTo(w * 0.88, h * 0.63)
                    ctx.moveTo(w * 0.88, h * 0.37)
                    ctx.lineTo(w * 0.68, h * 0.63)
                    ctx.stroke()
                }
            } else if (root.kind === "updates") {
                // Download/update glyph: vertical arrow into a tray. This reads
                // more clearly at the narrow bar scale than a circular refresh icon.
                ctx.beginPath()
                ctx.moveTo(cx, h * 0.14)
                ctx.lineTo(cx, h * 0.58)
                ctx.moveTo(w * 0.34, h * 0.44)
                ctx.lineTo(cx, h * 0.60)
                ctx.lineTo(w * 0.66, h * 0.44)
                ctx.stroke()

                ctx.beginPath()
                ctx.moveTo(w * 0.22, h * 0.66)
                ctx.lineTo(w * 0.22, h * 0.82)
                ctx.lineTo(w * 0.78, h * 0.82)
                ctx.lineTo(w * 0.78, h * 0.66)
                ctx.stroke()
            } else if (root.kind === "bell") {
                ctx.beginPath()
                ctx.moveTo(w * 0.29, h * 0.64)
                ctx.lineTo(w * 0.34, h * 0.58)
                ctx.lineTo(w * 0.34, h * 0.40)
                ctx.arc(cx, h * 0.40, w * 0.18, Math.PI, 0, false)
                ctx.lineTo(w * 0.66, h * 0.58)
                ctx.lineTo(w * 0.71, h * 0.64)
                ctx.closePath()
                ctx.stroke()
                ctx.beginPath()
                ctx.arc(cx, h * 0.70, w * 0.075, 0.15, Math.PI - 0.15, false)
                ctx.stroke()
            }

            if (root.disabled && root.kind !== "speaker") {
                ctx.beginPath()
                ctx.moveTo(w * 0.16, h * 0.16)
                ctx.lineTo(w * 0.84, h * 0.84)
                ctx.stroke()
            }
        }
    }
}
