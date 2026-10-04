/**
 * Tiny locale-keyed terminology helper (Australia pilot, Phase 1f).
 *
 * Not a string catalog — full i18n extraction is out of scope for the pilot.
 * AU-locale screens render "paddock" where US screens render "field".
 * Callers pass the active locale explicitly, like formatNumber().
 */
import type { LocaleCode } from '@/store/useAppPreferences';

export type TermKey = 'field' | 'fields';

const TERMS: Record<LocaleCode, Record<TermKey, string>> = {
  'en-US': { field: 'field', fields: 'fields' },
  'en-AU': { field: 'paddock', fields: 'paddocks' },
};

export function term(key: TermKey, locale: LocaleCode): string {
  return TERMS[locale][key];
}
