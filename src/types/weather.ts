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
    conditions?: string;    // 'Partly Cloudy', etc.
    icon?: string;          // 'partly-cloudy-day', etc.
    cloudCover?: number;    // 0-100
    windSpeed?: number;     // mph
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
    cloudCover: number;       // 0-100
    conditions: string;       // e.g., 'Partly Cloudy'
    icon: string;             // e.g., 'partly-cloudy-day'
    sunrise: string;          // HH:mm
    sunset: string;           // HH:mm
    isError?: boolean;
    forecastDays: ForecastDay[];
}
