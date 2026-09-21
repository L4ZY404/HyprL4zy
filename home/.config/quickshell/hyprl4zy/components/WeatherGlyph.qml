import QtQuick

Item {
    id: root

    property int weatherCode: -1
    property color color: "#6791a9"
    property real lineWidth: Math.max(1.2, width * 0.07)

    onWeatherCodeChanged: canvas.requestPaint()
    onColorChanged: canvas.requestPaint()
    onWidthChanged: canvas.requestPaint()
    onHeightChanged: canvas.requestPaint()

    Canvas {
        id: canvas
        anchors.fill: parent
        antialiasing: true

        function cloud(ctx, w, h) {
            ctx.beginPath()
            ctx.arc(w * 0.40, h * 0.54, w * 0.17, Math.PI, 0, false)
            ctx.arc(w * 0.57, h * 0.47, w * 0.21, Math.PI * 1.05, Math.PI * 1.95, false)
            ctx.arc(w * 0.70, h * 0.57, w * 0.14, Math.PI * 1.05, Math.PI * 1.95, false)
            ctx.lineTo(w * 0.30, h * 0.68)
            ctx.closePath()
            ctx.stroke()
        }

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
            const code = root.weatherCode
            const rainy = (code >= 51 && code <= 67) || (code >= 80 && code <= 82)
            const snowy = code >= 71 && code <= 77
            const storm = code >= 95
            const cloudy = code >= 2

            if (!cloudy || code < 0) {
                ctx.beginPath()
                ctx.arc(w * 0.50, h * 0.48, w * 0.18, 0, Math.PI * 2)
                ctx.stroke()
                for (let i = 0; i < 8; ++i) {
                    const a = i * Math.PI / 4
                    ctx.beginPath()
                    ctx.moveTo(w * 0.50 + Math.cos(a) * w * 0.27, h * 0.48 + Math.sin(a) * w * 0.27)
                    ctx.lineTo(w * 0.50 + Math.cos(a) * w * 0.36, h * 0.48 + Math.sin(a) * w * 0.36)
                    ctx.stroke()
                }
                return
            }

            if (code === 2) {
                ctx.beginPath()
                ctx.arc(w * 0.35, h * 0.34, w * 0.13, 0, Math.PI * 2)
                ctx.stroke()
            }

            cloud(ctx, w, h)

            if (rainy || storm) {
                for (let i = 0; i < 3; ++i) {
                    ctx.beginPath()
                    ctx.moveTo(w * (0.36 + i * 0.14), h * 0.76)
                    ctx.lineTo(w * (0.32 + i * 0.14), h * 0.88)
                    ctx.stroke()
                }
            } else if (snowy) {
                for (let i = 0; i < 3; ++i) {
                    ctx.beginPath()
                    ctx.arc(w * (0.36 + i * 0.14), h * 0.82, w * 0.025, 0, Math.PI * 2)
                    ctx.fill()
                }
            }

            if (storm) {
                ctx.beginPath()
                ctx.moveTo(w * 0.53, h * 0.70)
                ctx.lineTo(w * 0.44, h * 0.84)
                ctx.lineTo(w * 0.54, h * 0.83)
                ctx.lineTo(w * 0.47, h * 0.95)
                ctx.stroke()
            }
        }
    }
}
