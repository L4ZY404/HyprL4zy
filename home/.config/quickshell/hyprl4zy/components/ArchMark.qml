import QtQuick
import QtQuick.Shapes

Item {
    id: root

    property color color: "#6791a9"

    // The path is embedded directly in QML so the shell does not need an icon
    // font, an icon theme lookup, an SVG file, or an external helper process.
    readonly property real sourceMinX: 310
    readonly property real sourceMinY: 40
    readonly property real sourceWidth: 218
    readonly property real sourceHeight: 218
    readonly property real pathScale: Math.min(width / sourceWidth, height / sourceHeight)

    Shape {
        x: (root.width - root.sourceWidth * root.pathScale) / 2
            - root.sourceMinX * root.pathScale
        y: (root.height - root.sourceHeight * root.pathScale) / 2
            - root.sourceMinY * root.pathScale
        width: 560
        height: 300

        transform: Scale {
            origin.x: 0
            origin.y: 0
            xScale: root.pathScale
            yScale: root.pathScale
        }

        ShapePath {
            fillColor: root.color
            strokeColor: "transparent"

            PathSvg {
                path: "M 418.65593,41.52652 c -9.29195,23.22986 -15.26534,37.83149 -25.8847,60.39764 6.6371,7.30082 14.60163,15.26535 27.21212,23.89358 -13.93791,-5.30968 -23.22985,-11.28307 -29.86696,-17.25647 -13.93792,28.53955 -35.17665,68.36218 -77.65412,146.0163 33.18552,-19.91132 59.73394,-31.85811 84.29123,-36.50408 -1.32742,-4.64596 -1.99113,-9.29194 -1.99113,-14.60163 v -0.6637 c 0.66371,-21.90245 11.94678,-38.49522 25.22098,-37.16779 13.27421,0.66371 23.89358,19.24761 23.22987,41.15005 l -1.32742,11.28307 c 23.89358,4.64597 49.77828,17.25648 82.96381,35.84036 l -17.92019,-33.18551 c -8.62823,-6.63711 -17.92018,-15.26534 -36.50408,-25.221 12.61051,3.31855 21.90246,7.30082 29.20327,11.28308 C 442.54951,101.26046 437.90354,87.32254 418.65593,40.8628 Z"
            }
        }
    }
}
