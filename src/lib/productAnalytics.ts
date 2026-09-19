export type ProductEventName =
  | 'carry_suggestion_shown'
  | 'carry_suggestion_accepted'
  | 'carry_suggestion_declined';

export interface ProductEventProps {
  recordType: 'spray' | 'plant' | 'fertilizer';
}

/**
 * Privacy-preserving product-event seam. Remote collection is intentionally
 * disabled until the owner separately approves a sink and policy update.
 */
export function trackProductEvent(event: ProductEventName, props: ProductEventProps): void {
  void event;
  void props;
}
