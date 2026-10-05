/**
 * Property identifier helpers (Australia pilot, Phase 2a).
 *
 * The canonical in-app representation for property IDs. Migration strategy
 * is lazy derivation at the mapper layer (see src/lib/mappers.ts):
 *   DB read  → fsa columns populate both fsa* fields and propertyIdentifiers
 *   DB write → propertyIdentifiers (us-fsa) persist back into fsa columns
 * No Supabase schema change is needed; the derivation is lossless and
 * idempotent by construction, and old builds keep working against fsa columns.
 */
import type {
  PropertyIdentifier,
  PropertyIdKind,
  PropertyIdScheme,
} from '@/types/farm';

export interface FsaFields {
  fsaFarmNumber?: string | null;
  fsaTractNumber?: string | null;
  fsaFieldNumber?: string | null;
}

/**
 * Losslessly maps legacy FSA fields into us-fsa property identifiers.
 * Pure: trims whitespace, skips empty values, preserves farm→tract→field
 * order. Idempotent — it only reads the fsa* fields, so re-running on
 * already-migrated data changes nothing.
 */
export function migrateFsaToPropertyIdentifiers(fsa: FsaFields): PropertyIdentifier[] {
  const ids: PropertyIdentifier[] = [];
  const farm = fsa.fsaFarmNumber?.trim();
  const tract = fsa.fsaTractNumber?.trim();
  const field = fsa.fsaFieldNumber?.trim();
  if (farm) ids.push({ scheme: 'us-fsa', kind: 'farm', value: farm });
  if (tract) ids.push({ scheme: 'us-fsa', kind: 'tract', value: tract });
  if (field) ids.push({ scheme: 'us-fsa', kind: 'field', value: field });
  return ids;
}

/** Finds the value for a scheme+kind pair, or undefined. */
export function getPropertyIdentifier(
  ids: readonly PropertyIdentifier[] | undefined,
  scheme: PropertyIdScheme,
  kind: PropertyIdKind,
): string | undefined {
  return ids?.find(id => id.scheme === scheme && id.kind === kind)?.value;
}

/**
 * Adds or replaces the identifier for a scheme+kind pair.
 * Returns a new array; the input is not mutated.
 */
export function upsertPropertyIdentifier(
  ids: readonly PropertyIdentifier[] | undefined,
  id: PropertyIdentifier,
): PropertyIdentifier[] {
  const rest = (ids ?? []).filter(
    existing => !(existing.scheme === id.scheme && existing.kind === id.kind),
  );
  return [...rest, id];
}

/**
 * Remove a property identifier by scheme+kind. Used when the user clears
 * the PIC input — otherwise the stale identifier would survive the save.
 */
export function removePropertyIdentifier(
  ids: readonly PropertyIdentifier[] | undefined,
  scheme: PropertyIdentifier['scheme'],
  kind: PropertyIdentifier['kind'],
): PropertyIdentifier[] {
  return (ids ?? []).filter(
    existing => !(existing.scheme === scheme && existing.kind === kind),
  );
}

/**
 * Read-compat shim: derives the legacy fsa* fields from propertyIdentifiers.
 * When the record carries us-fsa identifiers they are canonical; otherwise
 * falls back to the record's own fsa* fields (old write paths that never
 * populated propertyIdentifiers).
 */
export function syncFsaLegacyFields<T extends FsaFields & { propertyIdentifiers?: readonly PropertyIdentifier[] }>(
  record: T,
): { fsaFarmNumber?: string; fsaTractNumber?: string; fsaFieldNumber?: string } {
  const ids = record.propertyIdentifiers;
  if (ids && ids.length > 0) {
    return {
      fsaFarmNumber: getPropertyIdentifier(ids, 'us-fsa', 'farm'),
      fsaTractNumber: getPropertyIdentifier(ids, 'us-fsa', 'tract'),
      fsaFieldNumber: getPropertyIdentifier(ids, 'us-fsa', 'field'),
    };
  }
  return {
    fsaFarmNumber: record.fsaFarmNumber?.trim() || undefined,
    fsaTractNumber: record.fsaTractNumber?.trim() || undefined,
    fsaFieldNumber: record.fsaFieldNumber?.trim() || undefined,
  };
}

/**
 * Returns a copy of the record with fsa* fields AND us-fsa identifiers
 * updated together from the given FSA values. Non-us-fsa identifiers
 * (e.g. au-pic) are preserved.
 *
 * Use this whenever FSA numbers are edited (e.g. FieldManageModal) so the
 * two representations cannot diverge. Without it, the stale
 * propertyIdentifiers array would win in syncFsaLegacyFields and the edit
 * would silently disappear on the next save.
 */
export function withFsaFields<T extends FsaFields & { propertyIdentifiers?: PropertyIdentifier[] }>(
  record: T,
  fsa: FsaFields,
): T {
  const fsaFarmNumber = fsa.fsaFarmNumber?.trim() || undefined;
  const fsaTractNumber = fsa.fsaTractNumber?.trim() || undefined;
  const fsaFieldNumber = fsa.fsaFieldNumber?.trim() || undefined;
  const otherIds = (record.propertyIdentifiers ?? []).filter(id => id.scheme !== 'us-fsa');
  return {
    ...record,
    fsaFarmNumber,
    fsaTractNumber,
    fsaFieldNumber,
    propertyIdentifiers: [...migrateFsaToPropertyIdentifiers({ fsaFarmNumber, fsaTractNumber, fsaFieldNumber }), ...otherIds],
  };
}

/**
 * Loose PIC format check (Phase 0 verification): 8-character state-issued
 * code whose leading character(s) indicate the state (N=NSW, Q=QLD, V=VIC…).
 * Kept loose on purpose — live register validation is out of pilot scope.
 */
const PIC_PATTERN = /^[A-Z]{1,2}[A-Z0-9]{6,7}$/;

export function isValidPicFormat(pic: string): boolean {
  return PIC_PATTERN.test(pic.trim().toUpperCase());
}
