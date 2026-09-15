import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { getWorkDateMs } from "@/utils/dates";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function workDateMs<T extends { timestamp: string | number }>(record: T, dateField: keyof T): number {
  const raw = record[dateField];
  const date = typeof raw === 'string' && raw ? raw : undefined;
  const timestamp = typeof record.timestamp === 'number' && Number.isFinite(record.timestamp)
    ? record.timestamp
    : undefined;
  return getWorkDateMs({ date, timestamp });
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
  return [...filtered].sort((a, b) => workDateMs(b, dateField) - workDateMs(a, dateField))[0] || null;
}
