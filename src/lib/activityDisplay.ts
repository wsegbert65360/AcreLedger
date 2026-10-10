import type { GrainMovement, HarvestRecord } from '@/types/farm';
import { formatDate, formatShortDate, parseLocalDate, toLocalIsoDate } from '@/utils/dates';
import { cleanName } from '@/utils/text';

/**
 * Shared, display-only formatting for harvest and grain-movement cards so the
 * All feed, Harvest tab and Grain tab read the same way. Nothing here writes
 * or reshapes stored records.
 */
export interface RecordCardText {
  title: string;
  subtitle: string;
  details: string;
  date: string;
}

const formatBushels = (bu: number) =>
  `${Number.isFinite(bu) ? bu.toLocaleString('en-US') : '—'} BU`;

const formatMoisture = (m: number) =>
  Number.isFinite(m) ? `${m}% moisture` : 'Moisture not recorded';

/**
 * Work date with time when the stored timestamp falls on that same day
 * (harvests save the chosen date + time into timestamp). Otherwise just the
 * work date, so an entry typed in later never shows the typing time.
 */
export function formatWorkDateTime(isoDate: string | undefined | null, ts: number | undefined): string {
  const datePart = isoDate ? String(isoDate).split('T')[0] : '';
  const hasTs = typeof ts === 'number' && Number.isFinite(ts) && ts > 0;
  if (hasTs && (!datePart || toLocalIsoDate(ts) === datePart)) return formatDate(ts);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return formatShortDate(parseLocalDate(datePart).getTime());
  return hasTs ? formatDate(ts) : '';
}

/** Harvest card: field · crop + bushels · moisture + where it went · date/time. */
export function harvestCardText(r: HarvestRecord, binName?: string): RecordCardText {
  const where = r.destination === 'town'
    ? 'to town'
    : `to ${binName ? cleanName(binName) : 'bin'}`;
  const details = [formatMoisture(r.moisturePercent), where];
  if (r.scaleTicketNumber) details.push(`Ticket ${r.scaleTicketNumber}`);
  return {
    title: cleanName(r.fieldName),
    subtitle: `${r.crop || 'Crop not set'} · ${formatBushels(r.bushels)}`,
    details: details.join(' · '),
    date: formatWorkDateTime(r.harvestDate, r.timestamp),
  };
}

/** Grain movement card: bin · in/out + bushels · moisture + from/to · date/time. */
export function grainCardText(m: GrainMovement): RecordCardText {
  const direction = m.type === 'in' ? 'In' : 'Out';
  const route = m.type === 'in'
    ? (m.sourceFieldName ? `from ${cleanName(m.sourceFieldName)}` : null)
    : (m.destination ? `to ${cleanName(m.destination)}` : null);
  return {
    title: cleanName(m.binName),
    subtitle: `${direction} · ${formatBushels(m.bushels)}`,
    details: [formatMoisture(m.moisturePercent), route].filter(Boolean).join(' · '),
    date: formatWorkDateTime(undefined, m.timestamp),
  };
}

/**
 * IDs of grain movements that mirror a harvest already shown in the same list.
 * The All feed hides these so one load appears once (on the harvest card);
 * they stay visible on the Grain tab, and editing/deleting the harvest
 * already updates/removes the linked movement.
 */
export function mirroredGrainIds(harvests: HarvestRecord[], movements: GrainMovement[]): Set<string> {
  const harvestIds = new Set(harvests.map(h => h.id));
  return new Set(
    movements
      .filter(m => m.type === 'in' && m.harvestRecordId && harvestIds.has(m.harvestRecordId))
      .map(m => m.id),
  );
}
