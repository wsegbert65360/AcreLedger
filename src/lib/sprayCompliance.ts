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

/** Derives review status for legacy rows without rewriting stored records. */
export function sprayRecordNeedsReview(record: SprayRecord): boolean {
  return Boolean(record.nonCompliant)
    || sprayProductsNeedReview(record.products, record.complianceProfile);
}
