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
