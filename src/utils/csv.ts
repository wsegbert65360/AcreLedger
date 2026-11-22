/**
 * Quote a CSV cell and neutralize spreadsheet formulas in user-entered text.
 */
export function sanitizeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const text = String(value).replace(/"/g, '""');
  if (typeof value === 'number' && Number.isFinite(value)) return `"${text}"`;
  // A plain signed number ("-12.5") is not a formula; keep it numeric so a
  // negative bushel or balance isn't turned into text with a leading '.
  if (/^-?\d+(\.\d+)?$/.test(text)) return `"${text}"`;
  return /^[=+\-@＝]/.test(text.trimStart()) || /^[\t\r]/.test(text)
    ? `"'${text}"` : `"${text}"`;
}
