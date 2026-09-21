pragma Singleton
import QtQuick
import Quickshell.Io
import Quickshell.Services.UPower

Item {
    id: root

    readonly property var displayDevice: UPower.displayDevice
    readonly property var physicalBattery: {
        const devices = UPower.devices && UPower.devices.values ? UPower.devices.values : []
        for (let i = 0; i < devices.length; ++i) {
            const device = devices[i]
            if (device && device.ready && device.isLaptopBattery && device.isPresent)
                return device
        }
        return null
    }
    readonly property bool physicalBatteryReady: physicalBattery !== null
    // displayDevice is an aggregate UPower device, so it is not guaranteed to
    // advertise itself as a physical laptop battery. It is still the preferred
    // source for aggregate percentage/time whenever a physical battery exists.
    readonly property bool displayBatteryReady: displayDevice && displayDevice.ready
        && (physicalBatteryReady || displayDevice.isLaptopBattery)
    readonly property var nativeBattery: displayBatteryReady ? displayDevice : physicalBattery
    readonly property bool nativeBatteryReady: nativeBattery !== null

    readonly property bool sysfsAvailable: HardwareService.battery.available
    readonly property real sysfsPercent: HardwareService.battery.percent
    readonly property string sysfsStatus: HardwareService.battery.status

    readonly property bool batteryAvailable: nativeBatteryReady || sysfsAvailable
    readonly property real batteryPercent: nativeBatteryReady
        ? clampPercent(nativeBattery.percentage)
        : clampPercent(sysfsPercent)
    readonly property bool charging: nativeBatteryReady
        ? (nativeBattery.state === UPowerDeviceState.Charging || nativeBattery.state === UPowerDeviceState.PendingCharge)
        : sysfsStatus.toLowerCase().indexOf("charging") >= 0 && sysfsStatus.toLowerCase().indexOf("discharging") < 0
    readonly property bool fullyCharged: nativeBatteryReady
        ? nativeBattery.state === UPowerDeviceState.FullyCharged
        : sysfsStatus.toLowerCase().indexOf("full") >= 0
    readonly property bool onBattery: nativeBatteryReady ? UPower.onBattery : (batteryAvailable && !charging && !fullyCharged)
    readonly property string batteryState: nativeBatteryReady ? prettyEnum(UPowerDeviceState.toString(nativeBattery.state)) : sysfsStatus
    readonly property real batteryHealth: physicalBatteryReady && physicalBattery.healthSupported
        ? physicalBattery.healthPercentage
        : (nativeBatteryReady && nativeBattery.healthSupported ? nativeBattery.healthPercentage : -1)
    readonly property real batteryRate: nativeBatteryReady ? Math.abs(nativeBattery.changeRate) : 0
    readonly property real batteryEnergy: nativeBatteryReady ? nativeBattery.energy : 0
    readonly property real batteryCapacity: nativeBatteryReady ? nativeBattery.energyCapacity : 0
    readonly property real timeRemaining: nativeBatteryReady
        ? (charging ? nativeBattery.timeToFull : nativeBattery.timeToEmpty)
        : 0
    readonly property string batteryModel: physicalBatteryReady && physicalBattery.model
        ? physicalBattery.model
        : (nativeBatteryReady && nativeBattery.model ? nativeBattery.model : "")

    function clampPercent(value) {
        const number = Number(value)
        if (!isFinite(number))
            return 0
        return Math.max(0, Math.min(100, number))
    }

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
