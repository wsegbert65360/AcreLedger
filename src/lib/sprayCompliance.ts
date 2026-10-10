import type { SprayRecord, SprayRecipeProduct } from '@/types/farm';
import { hasValidSprayRate } from '@/utils/unitConversion';
import {
  getComplianceProfileFor,
  type ComplianceProfileId,
} from './compliance/profiles';

/**
 * Product-level review check driven by the record's compliance profile.
 * us-epa: name + EPA registration number + valid rate (unchanged legacy behavior).
 * au-apvma: name + valid rate (APVMA/permit numbers are "when relevant", not review flags).
 */
export function sprayProductsNeedReview(
  products?: SprayRecipeProduct[],
  profileId?: ComplianceProfileId | string | null,
): boolean {
  const checks = getComplianceProfileFor(profileId ?? null).productChecks;
  return !products?.length || products.some(product => (
    (checks.requireName && !product.product.trim())
    || (checks.requireRegistrationNumber && !product.epaRegNumber?.trim())
    || (checks.requireRate && !hasValidSprayRate(product))
  ));
}

/**
 * Maps a profile field key to the record value it validates.
 * Returns undefined for product-level fields (handled by sprayProductsNeedReview)
 * and for fields not stored on the record (e.g. weather, which lives in form
 * state and is covered by the nonCompliant flag the form sets).
 */
function recordValueForField(record: SprayRecord, key: string): unknown {
  switch (key) {
    case 'startTime': return record.startTime;
    case 'endTime': return record.endTime;
    case 'sprayDate': return record.sprayDate;
    case 'applicatorName': return record.applicatorName;
    case 'licenseNumber': return record.licenseNumber;
    case 'windDirection': return record.windDirection;
    case 'windSpeed': return record.windSpeed;
    case 'cropOrSite':
    case 'crop': return record.cropOrSiteTreated;
    case 'applicationMethod': return record.applicationMethod;
    case 'equipmentId':
    case 'equipment': return record.equipmentId;
    case 'targetPest': return record.targetPest;
    case 'treatedArea': return record.treatedAreaSize;
    case 'pic': return record.pic;
    case 'paddock': return record.fieldName;
    case 'waterRate': return record.waterRate;
    case 'sensitiveAreas': return record.sensitiveAreaCheck;
    default: return undefined;
  }
}

function isFieldValuePresent(value: unknown, key?: string): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return false;
    // A zero treated area is not a valid application.
    if (key === 'treatedArea') return value > 0;
    return true;
  }
  if (typeof value === 'boolean') return true;
  return true;
}

/**
 * Labels of the profile's required fields that are missing from the record.
 * Product-level fields (names, registration numbers, rates) are excluded —
 * they are covered by sprayProductsNeedReview.
 */
export function missingComplianceFields(
  record: SprayRecord,
  profileId?: ComplianceProfileId | string | null,
): string[] {
  const profile = getComplianceProfileFor(profileId ?? record.complianceProfile ?? null);
  const productKeys = new Set(['productNames', 'epaRegNumbers', 'rates']);
  // Fields validated elsewhere: product-level fields go through
  // sprayProductsNeedReview; weather lives in form state and is covered by
  // the nonCompliant flag the form sets at save time.
  const skippedKeys = new Set([...productKeys, 'weather']);
  const missing: string[] = [];
  for (const field of profile.fields) {
    if (!field.required || skippedKeys.has(field.key)) continue;
    if (!isFieldValuePresent(recordValueForField(record, field.key), field.key)) {
      missing.push(field.label);
    }
  }
  return missing;
}

/**
 * Derives review status for legacy rows without rewriting stored records.
 * A record needs review when its stored flag says so, when its products fail
 * the profile's product checks, or when required profile fields are absent.
 */
export function sprayRecordNeedsReview(record: SprayRecord): boolean {
  return Boolean(record.nonCompliant)
    || sprayProductsNeedReview(record.products, record.complianceProfile)
    || missingComplianceFields(record).length > 0;
}
