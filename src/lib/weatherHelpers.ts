import {
  Sun, CloudSun, Cloud, CloudRain, CloudDrizzle,
  CloudSnow, CloudLightning, CloudFog, Wind,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { native } from '@/lib/native';

/** Regex for 5-digit or 5+4-digit US zip codes. */
export const ZIP_REGEX = /^\d{5}(-\d{4})?$/;

/** Read the saved zip/coords string from localStorage. */
export function loadZip(userId?: string): string {
  try {
    const key = userId ? `${userId}_al_zip` : 'al_zip';
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

/** Persist a zip/coords string to localStorage. */
export function saveZip(zip: string, userId?: string): void {
  try {
    const key = userId ? `${userId}_al_zip` : 'al_zip';
    localStorage.setItem(key, zip);
  } catch {
    /* ignore storage errors */
  }
}

/** Format the current time as 'h:mm AM/PM'. */
export function formatTime(): string {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Resolve the best available field coordinates from the fields array or
 * a saved zip/coords string. Returns 0,0 when no coords are available.
 */
export function fallbackToFields(
  fields: { lat: number | null; lng: number | null }[],
  savedZip: string,
): { lat: number; lng: number; locationString: string } {
  // First field with coords
  const field = fields.find(f => f.lat != null && f.lng != null);
  if (field && field.lat != null && field.lng != null) {
    const lat = Math.round(field.lat * 10000) / 10000;
    const lng = Math.round(field.lng * 10000) / 10000;
    return { lat, lng, locationString: `${lat},${lng}` };
  }

  // Parse saved zip if it's already coords
  const match = savedZip.trim().match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
  if (match) {
    return { lat: parseFloat(match[1]), lng: parseFloat(match[2]), locationString: savedZip.trim() };
  }

  // No coords available — return 0s, locationString will be the zip for weather API
  return { lat: 0, lng: 0, locationString: savedZip || '' };
}

/**
 * Resolve coordinates for weather + radar.
 *
 * Priority:
 *   1. Saved zip/coords or field coordinates (via `fallbackToFields`)
 *   2. Browser / native GPS
 *
 * GPS is only attempted when no saved location or field coords exist.
 */
export function resolveCoords(
  fields: { lat: number | null; lng: number | null }[],
  savedZip: string,
): Promise<{ lat: number; lng: number; locationString: string }> {
  const fallback = fallbackToFields(fields, savedZip);
  if ((fallback.lat !== 0 && fallback.lng !== 0) || savedZip.trim()) {
    return Promise.resolve(fallback);
  }

  // Browser GPS is only requested when no saved location or field coords exist.
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      // GPS took too long — use fallback
      resolve(fallback);
    }, 5000);

    native.geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 4000 })
      .then((pos) => {
        clearTimeout(timeoutId);
        const lat = Math.round(pos.coords.latitude * 10000) / 10000;
        const lng = Math.round(pos.coords.longitude * 10000) / 10000;
        resolve({ lat, lng, locationString: `${lat},${lng}` });
      })
      .catch(() => {
        clearTimeout(timeoutId);
        resolve(fallback);
      });
  });
}

/** Map Visual Crossing icon/conditions to a Lucide icon component */
export function getWeatherLucideIcon(vcIcon?: string, precipProb?: number, isRainingNow?: boolean): LucideIcon {
  if (isRainingNow) return CloudRain;
  if (!vcIcon) return precipProb && precipProb > 60 ? CloudDrizzle : Sun;
  if (vcIcon.includes('thunder') || vcIcon.includes('lightning')) return CloudLightning;
  if (vcIcon.includes('snow')) return CloudSnow;
  if (vcIcon.includes('rain')) return CloudRain;
  if (vcIcon.includes('fog')) return CloudFog;
  if (vcIcon.includes('wind')) return Wind;
  if (vcIcon.includes('partly-cloudy')) return CloudSun;
  if (vcIcon.includes('cloudy') || vcIcon.includes('overcast')) return Cloud;
  if (precipProb && precipProb > 60) return CloudDrizzle;
  return Sun;
}

/** Return Tailwind gradient classes based on weather conditions */
export function getConditionGradient(vcIcon?: string, isRainingNow?: boolean): string {
  if (isRainingNow || (vcIcon && (vcIcon.includes('rain') || vcIcon.includes('drizzle')))) return 'from-blue-500/10 to-blue-600/5';
  if (vcIcon?.includes('snow')) return 'from-slate-300/10 to-blue-200/5';
  if (vcIcon?.includes('thunder') || vcIcon?.includes('lightning')) return 'from-purple-500/10 to-slate-600/5';
  if (vcIcon?.includes('fog')) return 'from-slate-400/8 to-slate-500/5';
  if (vcIcon?.includes('partly-cloudy')) return 'from-amber-400/5 to-blue-400/5';
  if (vcIcon?.includes('cloudy') || vcIcon?.includes('overcast')) return 'from-slate-400/10 to-slate-500/5';
  return 'from-amber-400/10 to-orange-500/5';
}

/** Get degrees of rotation for wind direction arrow */
export function getWindRotation(dir: string): number {
  const angles: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5
  };
  return angles[dir] ?? 0;
}

