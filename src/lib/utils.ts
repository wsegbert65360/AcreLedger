import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getLatestForField<
  T extends { fieldId: string; deleted_at?: string | null; timestamp: string | number }
>(
  records: T[] | null | undefined,
  fieldId: string,
  dateField: keyof T,
  extraFilter?: (record: T) => boolean
): T | null {
  if (!records) return null;
  const filtered = records.filter(
    record => record.fieldId === fieldId && !record.deleted_at && (!extraFilter || extraFilter(record))
  );
  if (filtered.length === 0) return null;
  return [...filtered].sort((a, b) => {
    const aTime = new Date((a[dateField] as unknown as string) || a.timestamp).getTime();
    const bTime = new Date((b[dateField] as unknown as string) || b.timestamp).getTime();
    return bTime - aTime;
  })[0] || null;
}
