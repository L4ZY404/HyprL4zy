import QtQuick
import "../services"

QtObject {
    id: root

    readonly property color fallbackBackground: "#0b0e0c"
    readonly property color fallbackAccent: "#6791a9"

    readonly property var walSpecial: PaletteService.special || ({})
    readonly property var walColors: PaletteService.colors || ({})
    readonly property bool paletteAvailable: isColor(walColors.color11)
    readonly property string accentKey: "color" + SettingsService.accentSlot

    // The wallpaper owns the shell surface. The user only chooses which live
    // Pywal slot becomes the foreground/accent color.
    // Keep the original Pywal CSS string available. Canvas and Rectangle now
    // consume the same source value instead of round-tripping through RGBA.
    readonly property string backgroundCss: isColor(walSpecial.background)
        ? String(walSpecial.background)
        : String(fallbackBackground)
    readonly property color background: backgroundCss
    readonly property color accent: isColor(walColors[accentKey])
        ? walColors[accentKey]
        : (isColor(walColors.color11) ? walColors.color11 : fallbackAccent)

    // Foreground is intentionally the selected accent. This keeps the shell
    // two-tone: @background for surfaces, @colorN for visible information.
    readonly property color foreground: accent
    readonly property color muted: mix(background, accent, 0.68)

    readonly property color surfaceSoft: mix(background, accent, 0.055)
    readonly property color surfaceStrong: mix(background, accent, 0.13)
    readonly property color outlineSoft: withAlpha(accent, 0.34)
    readonly property color accentSoft: withAlpha(accent, 0.16)

    function isColor(value) {
        return typeof value === "string"
            && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value)
    }

    function withAlpha(colorValue, alpha) {
        return Qt.rgba(colorValue.r, colorValue.g, colorValue.b, alpha)
    }

    function mix(a, b, amount) {
        const t = Math.max(0, Math.min(1, amount))
        return Qt.rgba(
            a.r * (1 - t) + b.r * t,
            a.g * (1 - t) + b.g * t,
            a.b * (1 - t) + b.b * t,
            1
        )
    }
}
