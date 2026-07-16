import type { SprayRecord, SprayRecipeProduct } from '@/types/farm';
import { hasValidSprayRate } from '@/utils/unitConversion';

export function sprayProductsNeedReview(products?: SprayRecipeProduct[]): boolean {
  return !products?.length || products.some(product => (
    !product.product.trim()
    || !product.epaRegNumber?.trim()
    || !hasValidSprayRate(product)
  ));
}

/** Derives review status for legacy rows without rewriting stored records. */
export function sprayRecordNeedsReview(record: SprayRecord): boolean {
  return Boolean(record.nonCompliant) || sprayProductsNeedReview(record.products);
}
