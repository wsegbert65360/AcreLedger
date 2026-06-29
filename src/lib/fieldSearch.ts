import type { Field } from '@/types/farm';

export interface FieldActivityStatus {
  planted: boolean;
  sprayed: number;
  fertilized: number;
  harvested: number;
  hayed: number;
}

export type StatusFilter =
  | 'planted'
  | 'not-planted'
  | 'sprayed'
  | 'not-sprayed'
  | 'fertilized'
  | 'not-fertilized'
  | 'harvested'
  | 'not-harvested'
  | 'hayed'
  | 'not-hayed';

export interface ParsedSearchQuery {
  nameTerms: string[];
  statuses: StatusFilter[];
}

export interface ActivityRecords {
  plantRecords?: { fieldId: string; seasonYear: number }[];
  sprayRecords?: { fieldId: string; seasonYear: number }[];
  fertilizerApplications?: { fieldId: string; seasonYear: number }[];
  harvestRecords?: { fieldId: string; seasonYear: number }[];
  hayHarvestRecords?: { fieldId: string; seasonYear: number }[];
}

const SINGLE_WORD_STATUS: Record<string, StatusFilter> = {
  planted: 'planted',
  unplanted: 'not-planted',
  sprayed: 'sprayed',
  unsprayed: 'not-sprayed',
  fertilized: 'fertilized',
  unfertilized: 'not-fertilized',
  harvested: 'harvested',
  unharvested: 'not-harvested',
  hayed: 'hayed',
};

const NEGATABLE_WORDS = new Set([
  'planted',
  'sprayed',
  'fertilized',
  'harvested',
  'hayed',
]);

export function buildFieldActivityStatusMap(
  fields: Pick<Field, 'id'>[],
  records: ActivityRecords,
  viewingSeason: number,
): Map<string, FieldActivityStatus> {
  const map = new Map<string, FieldActivityStatus>();
  for (const field of fields) {
    map.set(field.id, {
      planted: false,
      sprayed: 0,
      fertilized: 0,
      harvested: 0,
      hayed: 0,
    });
  }

  const inSeason = (r: { fieldId: string; seasonYear: number }) =>
    r.seasonYear === viewingSeason ? map.get(r.fieldId) : undefined;

  for (const r of records.plantRecords || []) {
    const s = inSeason(r);
    if (s) s.planted = true;
  }
  for (const r of records.sprayRecords || []) {
    const s = inSeason(r);
    if (s) s.sprayed += 1;
  }
  for (const r of records.fertilizerApplications || []) {
    const s = inSeason(r);
    if (s) s.fertilized += 1;
  }
  for (const r of records.harvestRecords || []) {
    const s = inSeason(r);
    if (s) s.harvested += 1;
  }
  for (const r of records.hayHarvestRecords || []) {
    const s = inSeason(r);
    if (s) s.hayed += 1;
  }

  return map;
}

export function parseSearchQuery(input: string): ParsedSearchQuery {
  const cleaned = input.toLowerCase().replace(/[,;.:]/g, ' ');
  const tokens = cleaned.trim().split(/\s+/).filter(Boolean);
  const nameTerms: string[] = [];
  const statuses: StatusFilter[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];

    if (token === 'not' && next && NEGATABLE_WORDS.has(next)) {
      statuses.push(`not-${next}` as StatusFilter);
      i++;
      continue;
    }

    if (SINGLE_WORD_STATUS[token]) {
      statuses.push(SINGLE_WORD_STATUS[token]);
      continue;
    }

    nameTerms.push(token);
  }

  return { nameTerms, statuses };
}

export function fieldMatchesQuery(
  fieldName: string,
  status: FieldActivityStatus | undefined,
  query: ParsedSearchQuery,
): boolean {
  if (query.nameTerms.length === 0 && query.statuses.length === 0) {
    return true;
  }

  const lowerName = fieldName.toLowerCase();
  for (const term of query.nameTerms) {
    if (!lowerName.includes(term)) return false;
  }

  if (query.statuses.length > 0) {
    const s = status ?? { planted: false, sprayed: 0, fertilized: 0, harvested: 0, hayed: 0 };
    for (const filter of query.statuses) {
      if (!statusMatches(s, filter)) return false;
    }
  }

  return true;
}

function statusMatches(status: FieldActivityStatus, filter: StatusFilter): boolean {
  switch (filter) {
    case 'planted': return status.planted;
    case 'not-planted': return !status.planted;
    case 'sprayed': return status.sprayed > 0;
    case 'not-sprayed': return status.sprayed === 0;
    case 'fertilized': return status.fertilized > 0;
    case 'not-fertilized': return status.fertilized === 0;
    case 'harvested': return status.harvested > 0;
    case 'not-harvested': return status.harvested === 0;
    case 'hayed': return status.hayed > 0;
    case 'not-hayed': return status.hayed === 0;
  }
}
