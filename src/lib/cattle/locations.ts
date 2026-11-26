import type { CattleMove } from '@/types/cattle';
import { restDaysSinceLastGrazed } from './derived';

/**
 * Where a herd can be: a pasture, a hay field, or (in fall and winter) a crop field
 * grazed for stalks or stubble. The kind comes from the field's intended use; the crop
 * and harvest status come from this season's planting, harvest and hay records.
 */

export type LocationKind = 'pasture' | 'hay' | 'crop';

export const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  pasture: 'Pasture',
  hay: 'Hay field',
  crop: 'Crop field',
};

export interface LocationField {
  id: string;
  name: string;
  intendedUse?: string;
  deleted_at?: string | null;
}

export interface LocationPlanting { fieldId: string; crop?: string; seasonYear: number; deleted_at?: string | null }
export interface LocationHarvest { fieldId: string; crop?: string; harvestDate?: string; seasonYear: number; deleted_at?: string | null }
export interface LocationHay { fieldId: string; date: string; cuttingNumber: number; seasonYear: number; deleted_at?: string | null }

export interface LocationContext {
  plantings: LocationPlanting[];
  harvests: LocationHarvest[];
  hay: LocationHay[];
  moves: CattleMove[];
  /** yyyy-mm-dd. */
  today: string;
  /** The season being worked (the crop year). */
  season: number;
}

export interface LocationOption {
  id: string;
  name: string;
  kind: LocationKind;
  /** One line for the picker, e.g. "Corn stalks · harvested Oct 20". */
  detail: string;
  /** A crop field whose crop is planted but not harvested yet. */
  unharvested: boolean;
  /** Offered without "Show all fields". */
  suggested: boolean;
}

/** Pasture and forage fields graze; hay fields are cut and grazed on the aftermath; anything else is a crop field. */
export function locationKind(field: Pick<LocationField, 'intendedUse'>): LocationKind {
  const use = (field.intendedUse ?? '').toLowerCase();
  if (use.includes('hay')) return 'hay';
  if (use.includes('pasture') || use.includes('forage')) return 'pasture';
  return 'crop';
}

/** September through March: stalks and stubble are on offer. */
export function isStalkSeason(today: string): boolean {
  const month = Number(today.slice(5, 7));
  return month >= 9 || (month >= 1 && month <= 3);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso: string): string {
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return month >= 1 && month <= 12 && day >= 1 ? `${MONTHS[month - 1]} ${day}` : iso;
}

function cropWord(crop: string | undefined): string {
  const name = (crop ?? '').trim().toLowerCase();
  if (!name) return 'Crop';
  const base = name.charAt(0).toUpperCase() + name.slice(1);
  return base;
}

/** Latest planting of the season on a field, and its harvest if there is one. */
export function cropFieldStatus(
  fieldId: string,
  context: Pick<LocationContext, 'plantings' | 'harvests' | 'season'>,
): { crop?: string; planted: boolean; harvested: boolean; harvestedOn?: string } {
  const planted = context.plantings.filter(item => !item.deleted_at && item.fieldId === fieldId && item.seasonYear === context.season);
  const crop = planted.find(item => item.crop)?.crop;
  const harvests = context.harvests
    .filter(item => !item.deleted_at && item.fieldId === fieldId && item.seasonYear === context.season)
    .map(item => item.harvestDate ?? '')
    .filter(Boolean)
    .sort();
  const harvestedOn = harvests.length > 0 ? harvests[harvests.length - 1] : undefined;
  const anyHarvest = context.harvests.some(item => !item.deleted_at && item.fieldId === fieldId && item.seasonYear === context.season);
  return { crop, planted: planted.length > 0, harvested: anyHarvest, harvestedOn };
}

export function buildLocationOptions(fields: LocationField[], context: LocationContext): LocationOption[] {
  const stalkSeason = isStalkSeason(context.today);
  const options = fields
    .filter(field => !field.deleted_at)
    .map((field): LocationOption => {
      const kind = locationKind(field);
      if (kind === 'crop') {
        const status = cropFieldStatus(field.id, context);
        const word = status.planted ? `${cropWord(status.crop)} ${status.crop && /soy/i.test(status.crop) ? 'stubble' : 'stalks'}` : 'No crop recorded';
        const harvestText = status.harvested
          ? (status.harvestedOn ? `harvested ${shortDate(status.harvestedOn)}` : 'harvested')
          : status.planted ? 'not harvested yet' : '';
        const unharvested = status.planted && !status.harvested;
        return {
          id: field.id, name: field.name, kind,
          detail: [word, harvestText].filter(Boolean).join(' · '),
          unharvested,
          suggested: status.harvested || (stalkSeason && status.planted),
        };
      }
      if (kind === 'hay') {
        const cuttings = context.hay
          .filter(item => !item.deleted_at && item.fieldId === field.id && item.seasonYear === context.season)
          .sort((a, b) => b.date.localeCompare(a.date));
        const last = cuttings[0];
        return {
          id: field.id, name: field.name, kind,
          detail: last ? `cut ${shortDate(last.date)} (cutting ${last.cuttingNumber})` : 'not cut this season',
          unharvested: false, suggested: true,
        };
      }
      const rest = restDaysSinceLastGrazed(field.id, context.moves, context.today);
      return {
        id: field.id, name: field.name, kind,
        detail: rest === null ? 'never grazed' : rest === 0 ? 'grazing now' : `${rest} day${rest === 1 ? '' : 's'} of rest`,
        unharvested: false, suggested: true,
      };
    });
  const order: Record<LocationKind, number> = { pasture: 0, hay: 1, crop: 2 };
  return options.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
}

/** Picker row text, e.g. "North 80 — Crop field · Corn stalks · harvested Oct 20". */
export function locationOptionLabel(option: LocationOption): string {
  return `${option.name} — ${LOCATION_KIND_LABELS[option.kind]}${option.detail ? ` · ${option.detail}` : ''}`;
}

/** What a herd's current field is, for the card: "corn stalks", "pasture", "hay field". */
export function currentLocationKind(
  fieldId: string | undefined,
  fields: LocationField[],
): LocationKind | null {
  if (!fieldId) return null;
  const field = fields.find(item => item.id === fieldId && !item.deleted_at);
  return field ? locationKind(field) : null;
}
