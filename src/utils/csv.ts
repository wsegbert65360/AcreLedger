/**
 * Quote a CSV cell and neutralize spreadsheet formulas in user-entered text.
 */
export function sanitizeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const text = String(value).replace(/"/g, '""');
  if (typeof value === 'number' && Number.isFinite(value)) return `"${text}"`;
  return /^[=+\-@＝]/.test(text.trimStart()) || /^[\t\r]/.test(text)
    ? `"'${text}"` : `"${text}"`;
}
