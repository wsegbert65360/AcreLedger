/** Strip quotes and whitespace that CI sometimes pastes into env values. */
export function cleanEnvValue(value?: string): string {
  return (value ?? '').trim().replace(/^['"]|['"]$/g, '');
}

/**
 * The Visual Crossing vendor key may be used for local dev direct calls only.
 * Production web and Capacitor builds must return '' so Vite can drop the
 * VITE_VISUALCROSSING_KEY literal from the bundle.
 */
export function bundledVisualCrossingKey(dev: boolean, rawKey?: string): string {
  if (!dev) return '';
  return cleanEnvValue(rawKey);
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
