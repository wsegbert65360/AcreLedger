export interface WeatherData {
    wind: number;
    temp: number;
    humidity: number;
    windDirection: string;
    isError?: boolean;
    precip24h?: number;
    precip72h?: number;
}

export interface RainData {
    periodEndUtc: string;
    units: string;
    rain: {
        '12h': number;
        '24h': number;
        '72h': number;
    };
    rainMm: {
        '12h': number;
        '24h': number;
        '72h': number;
    };
    location: {
        type: 'point' | 'polygon';
        lat?: number;
        lon?: number;
        centroidLat?: number;
        centroidLon?: number;
    };
    dataWarning?: string;
}
