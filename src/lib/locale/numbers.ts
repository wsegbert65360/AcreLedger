/**
 * Locale-aware number formatting and parsing.
 *
 * Replaces bare `toLocaleString()` / `Number()` call sites so display and
 * input parsing follow an explicit locale instead of the device default.
 * Australia uses a decimal POINT (same as en-US); the separator table is
 * keyed per locale so decimal-comma markets (pt-BR, es-419) slot in later
 * without touching call sites.
 */
import type { LocaleCode } from '@/store/useAppPreferences';

const DECIMAL_SEPARATORS: Record<LocaleCode, string> = {
  'en-US': '.',
  'en-AU': '.',
};

/**
 * Formats a number for display in the given locale.
 * Returns '' for non-finite values (callers must not render NaN/Infinity).
 */
export function formatNumber(
  value: number,
  locale: LocaleCode,
  options?: { decimals?: number },
): string {
  if (!Number.isFinite(value)) return '';
  const formatter = new Intl.NumberFormat(
    locale,
    options?.decimals !== undefined
      ? { minimumFractionDigits: options.decimals, maximumFractionDigits: options.decimals }
      : { maximumFractionDigits: 2 },
  );
  return formatter.format(value);
}

/**
 * Parses user-typed numeric input respecting the locale's decimal separator.
 * Strips grouping separators (commas, spaces, apostrophes). Returns null for
 * anything that is not a plain decimal number — no NaN propagation.
 */
export function parseLocalizedNumber(input: string, locale: LocaleCode): number | null {
  if (typeof input !== 'string') return null;
  const decimalSep = DECIMAL_SEPARATORS[locale] ?? '.';
  let s = input.trim().replace(/[\s']/g, '');
  if (!s) return null;
  if (decimalSep === '.') {
    s = s.replace(/,/g, '');
  } else {
    // Decimal-comma locale: dots/spaces are grouping, comma is the decimal.
    s = s.replace(/\./g, '').replace(/,/g, '.');
  }
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
