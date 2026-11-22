/** Strip quotes and whitespace that CI sometimes pastes into env values. */
export function cleanEnvValue(value?: string): string {
  return (value ?? '').trim().replace(/^['"]|['"]$/g, '');
}

/** Native builds talk to the deployed proxy. A missing URL is a failed build. */
export function assertCapacitorWeatherProxy(mode: string, proxyUrl?: string): void {
  if (mode !== 'capacitor') return;
  if (!cleanEnvValue(proxyUrl)) {
    throw new Error(
      'Capacitor build requires VITE_WEATHER_PROXY_URL. Do not ship VITE_VISUALCROSSING_KEY in an App Store or native bundle.',
    );
  }
}
