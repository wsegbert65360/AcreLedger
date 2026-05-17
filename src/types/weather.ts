export interface WeatherData {
    wind: number;
    temp: number;
    humidity: number;
    windDirection: string;
    isError?: boolean;
    precip24h?: number;
    precip72h?: number;
    precipProb?: number;
}

export interface ForecastDay {
    date: string;
    tempHighF: number | null;
    tempLowF: number | null;
    rainChance: number | null;
    precipIn: number | null;
}

export interface ExtendedWeatherData {
    temp: number;
    feelsLike: number;
    humidity: number;
    wind: number;
    gusts: number;
    windDirection: string;
    dewPoint: number;
    precipProb: number;
    precip24h: number;
    precip72h: number;
    precip168h: number;
    isRainingNow: boolean;
    locationName: string;
    resolvedLocation: string;
    isError?: boolean;
    forecastDays: ForecastDay[];
}
