import { timeout } from "../../lib/lifecycle"
import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib?version=2.0"

import { replaceCssClass } from "../../lib/gtk"
import { createActionsSection } from "../../lib/ui/Actions"
import { actionButton, actionButtonRow, actionHint, createActionMenu } from "../../lib/ui/ActionMenu"
import { createInfoPopover } from "../../lib/ui/Popover"
import {
  EMPTY_WEATHER,
  WEATHER_REFRESH_MS,
  formatForecastLine,
  formatLastWeatherCheck,
  formatRainChance,
  formatWeatherDetail,
  formatWeatherExtra,
  formatWeatherTemperature,
  getWeatherClass,
  openWeatherPage,
  readWeather,
  type WeatherState,
} from "../../services/weather"

const STATE_CLASSES = [
  "weather-clear",
  "weather-cloudy",
  "weather-fog",
  "weather-rain",
  "weather-storm",
  "weather-snow",
  "weather-offline",
]

function createInfoRow(label: string, value = "—") {
  const row = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["weather-popover-row", "popover-data-row"],
    spacing: 8,
  })
  const labelWidget = new Gtk.Label({
    label,
    css_classes: ["weather-popover-row-label", "popover-data-label"],
    halign: Gtk.Align.START,
    xalign: 0,
    hexpand: true,
  })
  const valueWidget = new Gtk.Label({
    label: value,
    css_classes: ["weather-popover-row-value", "popover-data-value"],
    halign: Gtk.Align.END,
    xalign: 1,
  })
  row.append(labelWidget)
  row.append(valueWidget)
  return { row, valueWidget }
}

export default function Weather() {
  let state: WeatherState = EMPTY_WEATHER
  let refreshing = false

  const wrapper = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["weather-module", getWeatherClass(state)],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })
  const button = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, css_classes: ["weather-button"] })
  const content = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["weather-content"],
    spacing: 0,
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })
  const iconLabel = new Gtk.Label({
    label: state.icon,
    css_classes: ["weather-icon"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
    yalign: 0.5,
  })
  const tempLabel = new Gtk.Label({
    label: formatWeatherTemperature(state),
    css_classes: ["weather-temp"],
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
    xalign: 0.5,
    yalign: 0.5,
  })
  content.append(iconLabel)
  content.append(tempLabel)
  button.append(content)
  wrapper.append(button)

  const rowsBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["weather-popover-grid", "popover-data-grid"],
    spacing: 3,
  })
  const feelsRow = createInfoRow("Feels like")
  const humidityRow = createInfoRow("Humidity")
  const windRow = createInfoRow("Wind")
  const rainRow = createInfoRow("Rain chance")
  const cloudsRow = createInfoRow("Clouds")
  const gustsRow = createInfoRow("Gusts")
  const updatedRow = createInfoRow("Updated")
  const forecast1Row = createInfoRow("Next")
  const forecast2Row = createInfoRow("Later")
  const forecast3Row = createInfoRow("After")
  for (const item of [feelsRow, humidityRow, windRow, rainRow, cloudsRow, gustsRow, updatedRow, forecast1Row, forecast2Row, forecast3Row]) rowsBox.append(item.row)
  rowsBox.append(createActionsSection([
    { label: "Left click", value: "Open actions" },
    { label: "Right click", value: "Open weather page" },
  ]))

  const popover = createInfoPopover(wrapper, {
    icon: state.icon,
    title: state.location,
    value: `${formatWeatherTemperature(state)} • ${state.condition}`,
    detail: formatWeatherDetail(state),
    extra: rowsBox,
    className: "weather-popover-card",
  })
  const extraLabel = new Gtk.Label({
    label: formatWeatherExtra(state),
    css_classes: ["dial-popover-detail", "weather-popover-extra"],
    halign: Gtk.Align.START,
    xalign: 0,
  })
  popover.card.append(extraLabel)

  const actionBody = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
  const actionStatus = actionHint("Refresh the forecast or open the full weather page.")
  actionBody.append(actionStatus)
  actionBody.append(actionButtonRow([
    actionButton("Refresh", () => void refresh()),
    actionButton("Open forecast", openWeatherPage),
  ]))
  const actionMenu = createActionMenu(wrapper, {
    icon: "󰖐",
    title: "Weather",
    subtitle: "Forecast actions",
    content: actionBody,
    className: "weather-action-menu",
    onOpen: () => void refresh(),
  })

  function updateUi() {
    iconLabel.set_label(state.icon)
    tempLabel.set_label(formatWeatherTemperature(state))
    popover.iconLabel.set_label(state.icon)
    popover.titleLabel.set_label(state.location)
    popover.valueLabel.set_label(`${formatWeatherTemperature(state)} • ${state.condition}`)
    popover.detailLabel.set_label(formatWeatherDetail(state))
    extraLabel.set_label(formatWeatherExtra(state))
    feelsRow.valueWidget.set_label(`${state.apparentTemperature === null ? "—" : Math.round(state.apparentTemperature)}°`)
    humidityRow.valueWidget.set_label(`${state.humidity === null ? "—" : Math.round(state.humidity)}%`)
    windRow.valueWidget.set_label(`${state.windSpeed === null ? "—" : Math.round(state.windSpeed)} km/h`)
    rainRow.valueWidget.set_label(formatRainChance(state))
    cloudsRow.valueWidget.set_label(`${state.cloudCover === null ? "—" : Math.round(state.cloudCover)}%`)
    gustsRow.valueWidget.set_label(`${state.windGusts === null ? "—" : Math.round(state.windGusts)} km/h`)
    updatedRow.valueWidget.set_label(formatLastWeatherCheck(state))
    forecast1Row.valueWidget.set_label(state.forecast[0] ? `${state.forecast[0].time} ${formatForecastLine(state.forecast[0])}` : "—")
    forecast2Row.valueWidget.set_label(state.forecast[1] ? `${state.forecast[1].time} ${formatForecastLine(state.forecast[1])}` : "—")
    forecast3Row.valueWidget.set_label(state.forecast[2] ? `${state.forecast[2].time} ${formatForecastLine(state.forecast[2])}` : "—")
    actionStatus.set_label(`${state.location} • ${formatWeatherTemperature(state)} • ${formatLastWeatherCheck(state)}`)
    actionMenu.subtitleLabel.set_label(`${state.condition} • ${formatWeatherTemperature(state)}`)
    replaceCssClass(wrapper, STATE_CLASSES, getWeatherClass(state))
  }

  async function refresh() {
    if (refreshing) return
    refreshing = true
    try {
      state = await readWeather()
      updateUi()
    } finally {
      refreshing = false
    }
  }

  const click = new Gtk.GestureClick()
  click.set_button(0)
  click.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
  click.connect("pressed", (gesture) => {
    if (gesture.get_current_button() === 3) openWeatherPage()
  })
  wrapper.add_controller(click)

  timeout(GLib.PRIORITY_DEFAULT, 1400, () => {
    void refresh()
    return GLib.SOURCE_REMOVE
  })
  timeout(GLib.PRIORITY_DEFAULT, WEATHER_REFRESH_MS, () => {
    void refresh()
    return GLib.SOURCE_CONTINUE
  })
  return wrapper
}
