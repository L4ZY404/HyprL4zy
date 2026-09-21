pragma Singleton
import QtQuick
import Quickshell.Io
import Quickshell.Services.UPower

Item {
    id: root

    readonly property var displayDevice: UPower.displayDevice
    readonly property bool nativeBatteryReady: displayDevice && displayDevice.ready && displayDevice.isLaptopBattery && displayDevice.isPresent

    readonly property bool sysfsAvailable: HardwareService.battery.available
    readonly property real sysfsPercent: HardwareService.battery.percent
    readonly property string sysfsStatus: HardwareService.battery.status

    readonly property bool batteryAvailable: nativeBatteryReady || sysfsAvailable
    readonly property real batteryPercent: nativeBatteryReady ? displayDevice.percentage : sysfsPercent
    readonly property bool charging: nativeBatteryReady
        ? (displayDevice.state === UPowerDeviceState.Charging || displayDevice.state === UPowerDeviceState.PendingCharge)
        : sysfsStatus.toLowerCase().indexOf("charging") >= 0 && sysfsStatus.toLowerCase().indexOf("discharging") < 0
    readonly property bool fullyCharged: nativeBatteryReady
        ? displayDevice.state === UPowerDeviceState.FullyCharged
        : sysfsStatus.toLowerCase().indexOf("full") >= 0
    readonly property bool onBattery: nativeBatteryReady ? UPower.onBattery : (batteryAvailable && !charging && !fullyCharged)
    readonly property string batteryState: nativeBatteryReady ? prettyEnum(UPowerDeviceState.toString(displayDevice.state)) : sysfsStatus
    readonly property real batteryHealth: nativeBatteryReady && displayDevice.healthSupported ? displayDevice.healthPercentage : -1
    readonly property real batteryRate: nativeBatteryReady ? Math.abs(displayDevice.changeRate) : 0
    readonly property real batteryEnergy: nativeBatteryReady ? displayDevice.energy : 0
    readonly property real batteryCapacity: nativeBatteryReady ? displayDevice.energyCapacity : 0
    readonly property real timeRemaining: nativeBatteryReady
        ? (charging ? displayDevice.timeToFull : displayDevice.timeToEmpty)
        : 0
    readonly property string batteryModel: nativeBatteryReady && displayDevice.model ? displayDevice.model : ""

    readonly property int profile: PowerProfiles.profile
    readonly property string profileName: profileLabel(profile)
    readonly property bool hasPerformanceProfile: PowerProfiles.hasPerformanceProfile
    readonly property var profileHolds: PowerProfiles.holds || []
    readonly property string degradationReason: prettyEnum(PerformanceDegradationReason.toString(PowerProfiles.degradationReason))

    function prettyEnum(value) {
        if (!value)
            return "Unknown"
        const text = String(value).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ")
        return text.charAt(0).toUpperCase() + text.slice(1)
    }

    function profileLabel(value) {
        if (value === PowerProfile.PowerSaver)
            return "Power saver"
        if (value === PowerProfile.Performance)
            return "Performance"
        return "Balanced"
    }

    function setProfile(name) {
        if (name === "power-saver")
            PowerProfiles.profile = PowerProfile.PowerSaver
        else if (name === "performance" && hasPerformanceProfile)
            PowerProfiles.profile = PowerProfile.Performance
        else
            PowerProfiles.profile = PowerProfile.Balanced
    }

    function profileSelected(name) {
        if (name === "power-saver")
            return profile === PowerProfile.PowerSaver
        if (name === "performance")
            return profile === PowerProfile.Performance
        return profile === PowerProfile.Balanced
    }

    function formatDuration(seconds) {
        const value = Math.max(0, Math.round(Number(seconds) || 0))
        if (value <= 0)
            return "Estimating…"
        const minutes = Math.floor(value / 60)
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        if (hours > 0)
            return hours + "h " + mins + "m"
        return mins + "m"
    }

}
