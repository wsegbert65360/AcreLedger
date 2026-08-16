import { getLatestForField } from '@/lib/utils';
import type { PlantRecord } from '@/types/farm';

export type CropColorKey = 'corn' | 'soybean' | 'wheat' | 'sorghum' | 'cotton' | 'hay' | 'other';

export interface CropColorStyles {
  key: CropColorKey;
  card: string;
  thumb: string;
  pill: string;
  chip: string;
  chipActive: string;
}

const CROP_ALIASES: Array<{ key: Exclude<CropColorKey, 'other'>; pattern: RegExp }> = [
  { key: 'soybean', pattern: /\b(soy|soya|soybean|soybeans|beans)\b/ },
  { key: 'corn', pattern: /\b(corn|maize|maiz)\b/ },
  { key: 'wheat', pattern: /\bwheat\b/ },
  { key: 'sorghum', pattern: /\b(sorghum|milo)\b/ },
  { key: 'cotton', pattern: /\bcotton\b/ },
  { key: 'hay', pattern: /\b(hay|haylage|alfalfa|lucerne|pasture|grass)\b/ },
];

const CROP_COLOR_STYLES: Record<CropColorKey, CropColorStyles> = {
  corn: {
    key: 'corn',
    card: 'border-crop-corn/55 bg-crop-corn/10 hover:border-crop-corn/75',
    thumb: 'border-crop-corn/35 bg-crop-corn/15 text-crop-corn',
    pill: 'bg-crop-corn/15 text-crop-corn border-crop-corn/30',
    chip: 'border-crop-corn/40 bg-crop-corn/10 text-crop-corn',
    chipActive: 'ring-2 ring-crop-corn border-crop-corn/40 bg-crop-corn/15 text-crop-corn font-black shadow-sm',
  },
  soybean: {
    key: 'soybean',
    card: 'border-crop-soybean/55 bg-crop-soybean/10 hover:border-crop-soybean/75',
    thumb: 'border-crop-soybean/35 bg-crop-soybean/15 text-crop-soybean',
    pill: 'bg-crop-soybean/15 text-crop-soybean border-crop-soybean/30',
    chip: 'border-crop-soybean/40 bg-crop-soybean/10 text-crop-soybean',
    chipActive: 'ring-2 ring-crop-soybean border-crop-soybean/40 bg-crop-soybean/15 text-crop-soybean font-black shadow-sm',
  },
  wheat: {
    key: 'wheat',
    card: 'border-crop-wheat/55 bg-crop-wheat/10 hover:border-crop-wheat/75',
    thumb: 'border-crop-wheat/35 bg-crop-wheat/15 text-crop-wheat',
    pill: 'bg-crop-wheat/15 text-crop-wheat border-crop-wheat/30',
    chip: 'border-crop-wheat/40 bg-crop-wheat/10 text-crop-wheat',
    chipActive: 'ring-2 ring-crop-wheat border-crop-wheat/40 bg-crop-wheat/15 text-crop-wheat font-black shadow-sm',
  },
  sorghum: {
    key: 'sorghum',
    card: 'border-crop-sorghum/55 bg-crop-sorghum/10 hover:border-crop-sorghum/75',
    thumb: 'border-crop-sorghum/35 bg-crop-sorghum/15 text-crop-sorghum',
    pill: 'bg-crop-sorghum/15 text-crop-sorghum border-crop-sorghum/30',
    chip: 'border-crop-sorghum/40 bg-crop-sorghum/10 text-crop-sorghum',
    chipActive: 'ring-2 ring-crop-sorghum border-crop-sorghum/40 bg-crop-sorghum/15 text-crop-sorghum font-black shadow-sm',
  },
  cotton: {
    key: 'cotton',
    card: 'border-crop-cotton/55 bg-crop-cotton/10 hover:border-crop-cotton/75',
    thumb: 'border-crop-cotton/35 bg-crop-cotton/15 text-crop-cotton',
    pill: 'bg-crop-cotton/15 text-crop-cotton border-crop-cotton/30',
    chip: 'border-crop-cotton/40 bg-crop-cotton/10 text-crop-cotton',
    chipActive: 'ring-2 ring-crop-cotton border-crop-cotton/40 bg-crop-cotton/15 text-crop-cotton font-black shadow-sm',
  },
  hay: {
    key: 'hay',
    card: 'border-crop-hay/55 bg-crop-hay/10 hover:border-crop-hay/75',
    thumb: 'border-crop-hay/35 bg-crop-hay/15 text-crop-hay',
    pill: 'bg-crop-hay/15 text-crop-hay border-crop-hay/30',
    chip: 'border-crop-hay/40 bg-crop-hay/10 text-crop-hay',
    chipActive: 'ring-2 ring-crop-hay border-crop-hay/40 bg-crop-hay/15 text-crop-hay font-black shadow-sm',
  },
  other: {
    key: 'other',
    card: 'border-crop-other/55 bg-crop-other/10 hover:border-crop-other/75',
    thumb: 'border-crop-other/35 bg-crop-other/15 text-crop-other',
    pill: 'bg-crop-other/15 text-crop-other border-crop-other/30',
    chip: 'border-crop-other/40 bg-crop-other/10 text-crop-other',
    chipActive: 'ring-2 ring-crop-other border-crop-other/40 bg-crop-other/15 text-crop-other font-black shadow-sm',
  },
};

export function normalizeCropName(crop: string): string {
  return crop.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function getCropColorKey(crop: string | undefined | null): Exclude<CropColorKey, 'other'> | null {
  if (!crop?.trim()) return null;
  const normalized = normalizeCropName(crop);
  if (!normalized) return null;
  return CROP_ALIASES.find(({ pattern }) => pattern.test(normalized))?.key ?? null;
}

export function getCropColorStyles(crop: string | undefined | null): CropColorStyles | null {
  const key = getCropColorKey(crop);
  return key ? CROP_COLOR_STYLES[key] : null;
}

/** Color a planted field even when the crop name is not in the known map. */
export function getPlantedCropColorStyles(crop: string | undefined | null): CropColorStyles | null {
  if (!crop?.trim()) return null;
  return getCropColorStyles(crop) ?? CROP_COLOR_STYLES.other;
}

export function getFieldPlantedCrop(
  plantRecords: PlantRecord[] | null | undefined,
  fieldId: string,
  viewingSeason: number,
): string | undefined {
  const latest = getLatestForField(
    plantRecords,
    fieldId,
    'plantDate',
    record => record.seasonYear === viewingSeason && (record.cropStatus ?? 'Planted') !== 'Prevented Planting',
  );
  const crop = latest?.crop?.trim();
  return crop || undefined;
}
