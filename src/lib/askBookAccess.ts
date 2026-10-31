export const ASK_BOOK_ALLOWED_FARM_IDS: readonly string[] = [
  'cc3280e8-8fe3-49a8-9020-7132a7e8241c',
];

export function isAskBookEnabled(farmId: string | null | undefined): boolean {
  return typeof farmId === 'string' && ASK_BOOK_ALLOWED_FARM_IDS.includes(farmId);
}
