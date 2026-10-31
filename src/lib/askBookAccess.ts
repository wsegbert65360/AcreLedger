export const ASK_BOOK_ALLOWED_FARM_IDS: readonly string[] = [
  '28e107ba-3384-4b6e-9917-8a694803cb82',
];

export function isAskBookEnabled(farmId: string | null | undefined): boolean {
  return typeof farmId === 'string' && ASK_BOOK_ALLOWED_FARM_IDS.includes(farmId);
}
