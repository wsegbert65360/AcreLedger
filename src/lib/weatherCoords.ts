/** Round lat/lng to 4 decimals for weather/radar grid consistency (AGENTS). */
export function roundWeatherLatLng(lat: number, lng: number): { lat: number; lng: number } {
  return { lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) };
}

export function formatWeatherLatLng(lat: number, lng: number): string {
  const { lat: roundedLat, lng: roundedLng } = roundWeatherLatLng(lat, lng);
  return `${roundedLat.toFixed(4)},${roundedLng.toFixed(4)}`;
}

const LAT_LNG_RE = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/;

/** If `location` is a lat,lng pair, round it to 4 decimals; otherwise leave it. */
export function normalizeWeatherLocation(location: string): string {
  const match = location.trim().match(LAT_LNG_RE);
  if (!match) return location;
  return formatWeatherLatLng(Number(match[1]), Number(match[2]));
}
