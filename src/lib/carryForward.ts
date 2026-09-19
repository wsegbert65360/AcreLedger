import { parseLocalDate, toLocalIsoDate } from '@/utils/dates';

type CarryForwardRecord = {
  fieldId: string;
  deleted_at: string | null;
  seasonYear: number;
  timestamp?: number;
};

interface CarryForwardOptions<T> {
  dateKey: keyof T;
  todayLocalIso: string;
}

function isLocalIsoDay(value: unknown, expectedDay: string): boolean {
  if (typeof value !== 'string') return false;
  const datePart = value.split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return false;

  const parsed = parseLocalDate(datePart);
  return Number.isFinite(parsed.getTime()) && toLocalIsoDate(parsed.getTime()) === expectedDay;
}

/** Select the latest same-day, same-season record from a different field. */
export function getCarryForwardSource<T extends CarryForwardRecord>(
  records: T[],
  currentFieldId: string,
  viewingSeason: number,
  opts: CarryForwardOptions<T>,
): T | null {
  return records.reduce<T | null>((latest, record) => {
    if (
      record.fieldId === currentFieldId
      || record.deleted_at !== null
      || record.seasonYear !== viewingSeason
      || !isLocalIsoDay(record[opts.dateKey], opts.todayLocalIso)
    ) {
      return latest;
    }

    if (!latest || (record.timestamp ?? 0) > (latest.timestamp ?? 0)) return record;
    return latest;
  }, null);
}

/** Format the source record's local clock time without using date-only UTC parsing. */
export function formatCarryForwardTime(timestamp: number, localTime?: string): string {
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime || '')) {
    const [hours, minutes] = localTime!.split(':').map(Number);
    const suffix = hours >= 12 ? 'PM' : 'AM';
    return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`;
  }

  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
