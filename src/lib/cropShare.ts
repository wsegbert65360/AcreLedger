/** Field producer share is authoritative; stored harvest splits support legacy fields only. */
export function getLandlordSplitPercent(
  field: { producerShare?: number } | undefined,
  legacySplit?: number,
): number | undefined {
  return field?.producerShare != null ? 100 - field.producerShare : legacySplit;
}
