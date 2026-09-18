import { preferences } from "./preferences"
import { execAsync, shellQuote, spawn } from "../lib/shell"

export type WeatherKind =
  | "clear"
  | "cloudy"
  | "fog"
  | "rain"
  | "storm"
  | "snow"
  | "offline"

export type WeatherForecastHour = {
  time: string
  temperature: number | null
  precipitationProbability: number | null
  weatherCode: number | null
  condition: string
  icon: string
  kind: WeatherKind
}

export type WeatherState = {
  location: string
  temperature: number | null
  apparentTemperature: number | null
  humidity: number | null
  precipitation: number | null
  precipitationProbability: number | null
  cloudCover: number | null
  windSpeed: number | null
  windGusts: number | null
  weatherCode: number | null
  isDay: boolean
  condition: string
  icon: string
  kind: WeatherKind
  timezone: string
  forecast: WeatherForecastHour[]
  fetchedAt: number
}

export const WEATHER_REFRESH_MS = 15 * 60 * 1000

export const WEATHER_CONFIG = preferences.weather

export const EMPTY_WEATHER: WeatherState = {
  location: WEATHER_CONFIG.location,
  temperature: null,
  apparentTemperature: null,
  humidity: null,
  precipitation: null,
  precipitationProbability: null,
  cloudCover: null,
  windSpeed: null,
  windGusts: null,
  weatherCode: null,
  isDay: true,
  condition: "Weather unavailable",
  icon: "󰖐",
  kind: "offline",
  timezone: "auto",
  forecast: [],
  fetchedAt: 0,
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

function rounded(value: number | null) {
  return value === null ? "--" : `${Math.round(value)}`
}

function weatherInfo(code: number | null, isDay: boolean): {
  condition: string
  icon: string
  kind: WeatherKind
} {
  if (code === null) {
    return {
      condition: "Weather unavailable",
      icon: "󰖐",
      kind: "offline",
    }
  }

  if (code === 0) {
    return {
      condition: "Clear sky",
      icon: isDay ? "󰖙" : "󰖔",
      kind: "clear",
    }
  }

  if ([1, 2].includes(code)) {
    return {
      condition: "Partly cloudy",
      icon: isDay ? "󰖕" : "󰼱",
      kind: "cloudy",
    }
  }

  if (code === 3) {
    return {
      condition: "Cloudy",
      icon: "",
      kind: "cloudy",
    }
  }

  if ([45, 48].includes(code)) {
    return {
      condition: "Fog",
      icon: "",
      kind: "fog",
    }
  }

  if ([51, 53, 55, 56, 57].includes(code)) {
    return {
      condition: "Drizzle",
      icon: "",
      kind: "rain",
    }
  }

  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return {
      condition: "Rain",
      icon: "",
      kind: "rain",
    }
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return {
      condition: "Snow",
      icon: "",
      kind: "snow",
    }
  }

  if ([95, 96, 99].includes(code)) {
    return {
      condition: "Thunderstorm",
      icon: "",
      kind: "storm",
    }
  }

  return {
    condition: "Weather",
    icon: "󰖐",
    kind: "cloudy",
  }
}

function buildWeatherUrl() {
  const params = [
    `latitude=${WEATHER_CONFIG.latitude}`,
    `longitude=${WEATHER_CONFIG.longitude}`,
    "current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m",
    "hourly=temperature_2m,precipitation_probability,weather_code",
    "forecast_days=2",
    "temperature_unit=celsius",
    "wind_speed_unit=kmh",
    "precipitation_unit=mm",
    "timezone=auto",
  ]

  return `https://api.open-meteo.com/v1/forecast?${params.join("&")}`
}

function formatClock(value: string) {
  const date = new Date(value)

  if (!Number.isFinite(date.getTime())) {
    return value.replace("T", " ")
  }

  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

function buildForecast(json: any, isDay: boolean) {
  const hourly = json.hourly ?? {}
  const times: string[] = hourly.time ?? []
  const temperatures: unknown[] = hourly.temperature_2m ?? []
  const rainChances: unknown[] = hourly.precipitation_probability ?? []
  const codes: unknown[] = hourly.weather_code ?? []
  const now = Date.now()

  return times
    .map((time, index) => {
      return {
        time,
        index,
        timestamp: new Date(time).getTime(),
      }
    })
    .filter((item) => Number.isFinite(item.timestamp) && item.timestamp >= now - 30 * 60 * 1000)
    .filter((_item, index) => index % 3 === 0)
    .slice(0, 4)
    .map((item): WeatherForecastHour => {
      const code = numberOrNull(codes[item.index])
      const info = weatherInfo(code, isDay)

      return {
        time: formatClock(item.time),
        temperature: numberOrNull(temperatures[item.index]),
        precipitationProbability: numberOrNull(rainChances[item.index]),
        weatherCode: code,
        condition: info.condition,
        icon: info.icon,
        kind: info.kind,
      }
    })
}

export function getWeatherClass(state: WeatherState) {
  return `weather-${state.kind}`
}

export function formatWeatherTemperature(state: WeatherState) {
  return `${rounded(state.temperature)}°`
}

export function formatWeatherDetail(state: WeatherState) {
  if (state.kind === "offline") {
    return "Check network connection"
  }

  return [
    `Feels: ${rounded(state.apparentTemperature)}°`,
    `Humidity: ${rounded(state.humidity)}%`,
    `Wind: ${rounded(state.windSpeed)} km/h`,
  ].join(" | ")
}

export function formatWeatherExtra(state: WeatherState) {
  if (state.kind === "offline") {
    return "No weather data"
  }

  return [
    `Clouds: ${rounded(state.cloudCover)}%`,
    `Rain: ${state.precipitation === null ? "--" : state.precipitation.toFixed(1)} mm`,
    `Gusts: ${rounded(state.windGusts)} km/h`,
  ].join(" | ")
}

export function formatLastWeatherCheck(state: WeatherState) {
  if (!state.fetchedAt) {
    return "Never"
  }

  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(state.fetchedAt))
}

export function formatRainChance(state: WeatherState) {
  if (state.precipitationProbability !== null) {
    return `${rounded(state.precipitationProbability)}%`
  }

  if (state.forecast[0]?.precipitationProbability != null) {
    return `${rounded(state.forecast[0]?.precipitationProbability ?? null)}%`
  }

  return "—"
}

export function formatForecastLine(item: WeatherForecastHour) {
  return `${item.icon} ${rounded(item.temperature)}° / ${rounded(item.precipitationProbability)}%`
}

export function openWeatherPage() {
  const query = encodeURIComponent(`weather ${WEATHER_CONFIG.location}`)

  spawn(`xdg-open ${shellQuote(`https://www.google.com/search?q=${query}`)}`)
}

async function fetchWeather(): Promise<WeatherState> {
  if (!WEATHER_CONFIG.enabled) return { ...EMPTY_WEATHER, condition: "Set a location in local.json" }
  const url = buildWeatherUrl()
  const output = await execAsync([
    "bash",
    "-c",
    `curl -fsSL --max-time 8 ${shellQuote(url)}`,
  ])

  if (!output) {
    return {
      ...EMPTY_WEATHER,
      fetchedAt: Date.now(),
    }
  }

  try {
    const json = JSON.parse(output)
    const current = json.current ?? {}
    const weatherCode = numberOrNull(current.weather_code)
    const isDay = Number(current.is_day ?? 1) === 1
    const info = weatherInfo(weatherCode, isDay)

    return {
      location: WEATHER_CONFIG.location,
      temperature: numberOrNull(current.temperature_2m),
      apparentTemperature: numberOrNull(current.apparent_temperature),
      humidity: numberOrNull(current.relative_humidity_2m),
      precipitation: numberOrNull(current.precipitation),
      precipitationProbability: null,
      cloudCover: numberOrNull(current.cloud_cover),
      windSpeed: numberOrNull(current.wind_speed_10m),
      windGusts: numberOrNull(current.wind_gusts_10m),
      weatherCode,
      isDay,
      condition: info.condition,
      icon: info.icon,
      kind: info.kind,
      timezone: json.timezone ?? "auto",
      forecast: buildForecast(json, isDay),
      fetchedAt: Date.now(),
    }
  } catch (error) {
    console.error("Weather parse error:", error)
    console.error("Raw weather output:", output)

    return {
      ...EMPTY_WEATHER,
      fetchedAt: Date.now(),
    }
  }
}

let weatherCache = EMPTY_WEATHER
let weatherPromise: Promise<WeatherState> | null = null
export function readWeather(force = false): Promise<WeatherState> {
  if (weatherPromise) return weatherPromise
  if (!force && weatherCache.fetchedAt && Date.now() - weatherCache.fetchedAt < WEATHER_REFRESH_MS)
    return Promise.resolve(weatherCache)
  weatherPromise = fetchWeather().then(state => {
    weatherCache = state
    return state
  }).finally(() => { weatherPromise = null })
  return weatherPromise
}
