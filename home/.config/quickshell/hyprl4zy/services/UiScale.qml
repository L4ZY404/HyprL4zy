pragma Singleton
import QtQuick

QtObject {
    // Global readability boosts. These scale glyphs/text without changing the
    // shell's base unit, panel geometry or bar width.
    readonly property real textBoost: 1.06
    readonly property real iconBoost: 1.08

    // Screen dimensions are Qt logical pixels; never multiply by devicePixelRatio.
    // Use the short edge for portrait displays and cap growth on large desktops.
    function forScreen(screen) {
        const width = Math.max(1, Number(screen ? screen.width : 1920) || 1920)
        const height = Math.max(1, Number(screen ? screen.height : 1080) || 1080)
        return Math.max(1, Math.min(84, Math.min(width, height) * 0.055,
                                    width / 8, height / 18))
    }

    // Small labels receive a stronger boost than headings so the hierarchy stays intact.
    function text(pixelSize, unit) {
        const px = Math.max(1, Number(pixelSize) || 1)
        const u = Math.max(1, Number(unit) || 1)
        const ratio = px / u

        // The previous multiplier still left 0.08-0.10u metadata around 8-9 px
        // on common monitor scales. Keep a responsive floor instead of using a
        // fixed pixel size so the public rice remains resolution independent.
        const readableFloor = u * 0.155
        let scaled = px

        if (ratio <= 0.10)
            scaled = px * 1.54
        else if (ratio <= 0.13)
            scaled = px * 1.42
        else if (ratio <= 0.17)
            scaled = px * 1.30
        else if (ratio <= 0.23)
            scaled = px * 1.18
        else
            scaled = px * 1.08

        return Math.max(readableFloor, scaled) * textBoost
    }

    function icon(size) {
        return Math.max(1, (Number(size) || 1) * iconBoost)
    }
}
