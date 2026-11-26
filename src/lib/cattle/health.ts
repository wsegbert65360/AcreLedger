import { calvingStats } from '@/lib/cattle/counts';
import type {
  CattleCounts, CattleEvent, CattleGroup, CattleTreatment, CountClass, DoseBasis, DoseUnit,
  TreatmentKind, TreatmentRoute,
} from '@/types/cattle';

export const TREATMENT_KINDS: readonly TreatmentKind[] = ['vaccine', 'dewormer', 'antibiotic', 'other'];
export const TREATMENT_KIND_LABELS: Record<TreatmentKind, string> = {
  vaccine: 'Vaccine', dewormer: 'Dewormer', antibiotic: 'Antibiotic', other: 'Other',
};

export const DOSE_UNITS: readonly DoseUnit[] = ['mL', 'cc', 'mg', 'g', 'oz', 'tablet', 'bolus'];
export const DOSE_BASES: readonly DoseBasis[] = ['per_head', 'per_100_lb'];
export const DOSE_BASIS_LABELS: Record<DoseBasis, string> = {
  per_head: 'per head', per_100_lb: 'per 100 lb',
};

export const TREATMENT_ROUTES: readonly TreatmentRoute[] = ['SQ', 'IM', 'IV', 'oral', 'pour_on', 'intranasal', 'topical', 'implant'];
export const ROUTE_LABELS: Record<TreatmentRoute, string> = {
  SQ: 'SQ (under the skin)', IM: 'IM (in the muscle)', IV: 'IV (in the vein)', oral: 'Oral',
  pour_on: 'Pour-on', intranasal: 'Intranasal', topical: 'Topical', implant: 'Implant',
};
/** Short form for lists and the report. */
export const ROUTE_SHORT: Record<TreatmentRoute, string> = {
  SQ: 'SQ', IM: 'IM', IV: 'IV', oral: 'Oral', pour_on: 'Pour-on', intranasal: 'Intranasal',
  topical: 'Topical', implant: 'Implant',
};

export const MAX_WITHDRAWAL_DAYS = 365;
/** Days from breeding to calving; used to line a calving up with its breeding season. */
export const GESTATION_DAYS = 283;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** A yyyy-mm-dd date plus whole days, in UTC so daylight saving never shifts it. */
export function addDaysIso(isoDate: string, days: number): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) return isoDate;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) + days * 86_400_000;
  // eslint-disable-next-line no-restricted-syntax -- pure calendar arithmetic, UTC by design
  return new Date(time).toISOString().slice(0, 10);
}

export function treatmentWithdrawalUntil(treatedOn: string, withdrawalDays: number): string {
  return addDaysIso(treatedOn, Math.max(0, Math.trunc(withdrawalDays)));
}

/** A treatment holds cattle back while the date is before withdrawalUntil. */
export function isWithdrawalActive(treatment: Pick<CattleTreatment, 'withdrawalUntil' | 'treatedOn' | 'deleted_at'>, onDate: string): boolean {
  return !treatment.deleted_at && treatment.treatedOn <= onDate && onDate < treatment.withdrawalUntil;
}

export interface ActiveWithdrawal {
  until: string;
  product: string;
  treatmentId: string;
}

type HoldEvent = Pick<CattleEvent, 'groupId' | 'eventType' | 'eventDate' | 'cattleClass' | 'toClass' | 'transferId' | 'deleted_at'>;

/** A herd and class that may hold treated head; no class means any class in the herd. */
interface HoldPlace {
  groupId: string;
  cattleClass?: CountClass;
  /** The earliest date treated head could have been there. */
  since: string;
}

/**
 * Everywhere a treatment's head may be on a date: where they were treated, plus
 * wherever a later reclass or transfer could have taken them. Events do not say
 * which head moved, so any move out of a held class carries the hold with it.
 */
function holdPlaces(treatment: CattleTreatment, events: readonly HoldEvent[], onDate: string): HoldPlace[] {
  const places = new Map<string, HoldPlace>();
  const queue: HoldPlace[] = [];
  const reach = (place: HoldPlace) => {
    const key = `${place.groupId}|${place.cattleClass ?? '*'}`;
    const seen = places.get(key);
    if (seen && seen.since <= place.since) return;
    places.set(key, place);
    queue.push(place);
  };
  reach({ groupId: treatment.groupId, cattleClass: treatment.cattleClass, since: treatment.treatedOn });

  const moves = events.filter(item => !item.deleted_at && item.eventDate <= onDate
    && (item.eventType === 'reclass' || (item.eventType === 'head_removed' && item.transferId)));
  for (let place = queue.shift(); place; place = queue.shift()) {
    for (const move of moves) {
      if (move.groupId !== place.groupId || move.eventDate < place.since) continue;
      if (place.cattleClass && move.cattleClass && move.cattleClass !== place.cattleClass) continue;
      if (move.eventType === 'reclass') {
        reach({ groupId: move.groupId, cattleClass: move.toClass, since: move.eventDate });
        continue;
      }
      for (const arrival of events) {
        if (arrival.deleted_at || arrival.eventType !== 'head_added' || arrival.transferId !== move.transferId) continue;
        reach({ groupId: arrival.groupId, cattleClass: arrival.cattleClass ?? move.cattleClass, since: move.eventDate });
      }
    }
  }
  return [...places.values()];
}

/** Every treatment that may hold a herd (or one class of it) back on a date, longest first. */
export function withdrawalConflicts(
  treatments: CattleTreatment[],
  events: readonly HoldEvent[],
  groupId: string,
  onDate: string,
  cattleClass?: CountClass,
): CattleTreatment[] {
  return treatments
    .filter(item => isWithdrawalActive(item, onDate)
      && holdPlaces(item, events, onDate).some(place => place.groupId === groupId
        // A class-only hold does not hold back the other classes.
        && !(cattleClass && place.cattleClass && place.cattleClass !== cattleClass)))
    .sort((a, b) => b.withdrawalUntil.localeCompare(a.withdrawalUntil));
}

/** The treatment that holds a herd back the longest on a date, or null. */
export function activeWithdrawal(
  treatments: CattleTreatment[],
  events: readonly HoldEvent[],
  groupId: string,
  onDate: string,
  cattleClass?: CountClass,
): ActiveWithdrawal | null {
  const best = withdrawalConflicts(treatments, events, groupId, onDate, cattleClass)[0];
  return best ? { until: best.withdrawalUntil, product: best.product, treatmentId: best.id } : null;
}

/** What the form remembers about a product used before, so a repeat is two taps. */
export interface ProductMemory {
  product: string;
  kind: TreatmentKind;
  dose: number;
  doseUnit: DoseUnit;
  doseBasis: DoseBasis;
  route: TreatmentRoute;
  withdrawalDays: number;
  lotNumber?: string;
  lastUsed: string;
}

export function productMemory(treatments: CattleTreatment[]): ProductMemory[] {
  const newest = new Map<string, CattleTreatment>();
  for (const item of treatments) {
    if (item.deleted_at) continue;
    const key = item.product.trim().toLowerCase();
    const seen = newest.get(key);
    if (!seen || item.treatedOn > seen.treatedOn
      || (item.treatedOn === seen.treatedOn && item.createdAt > seen.createdAt)) {
      newest.set(key, item);
    }
  }
  return [...newest.values()]
    .sort((a, b) => b.treatedOn.localeCompare(a.treatedOn) || b.createdAt.localeCompare(a.createdAt))
    .map(item => ({
      product: item.product, kind: item.kind, dose: item.dose, doseUnit: item.doseUnit,
      doseBasis: item.doseBasis, route: item.route, withdrawalDays: item.withdrawalDays,
      lotNumber: item.lotNumber, lastUsed: item.treatedOn,
    }));
}

/** "2 mL per head SQ" */
export function describeDose(item: Pick<CattleTreatment, 'dose' | 'doseUnit' | 'doseBasis' | 'route'>): string {
  const dose = Number.isInteger(item.dose) ? String(item.dose) : String(Number(item.dose.toFixed(2)));
  return `${dose} ${item.doseUnit} ${DOSE_BASIS_LABELS[item.doseBasis]} ${ROUTE_SHORT[item.route]}`;
}

// ---- Breeding seasons and herd statistics -------------------------------------------

export interface BreedingSeason {
  /** The bulls-in date. */
  start: string;
  /** The bulls-out date; undefined while the bulls are still in. */
  end?: string;
  /** Cows and heifers exposed; undefined when the turnout recorded no number. */
  exposed?: number;
  turnoutEventId: string;
}

type SeasonEvent = Pick<CattleEvent, 'id' | 'groupId' | 'eventType' | 'eventDate' | 'exposedCount' | 'deleted_at' | 'createdAt'>;

/** One bulls-in followed by the next bulls-out is a breeding season. Oldest first. */
export function breedingSeasons(events: SeasonEvent[], groupId: string): BreedingSeason[] {
  const own = events
    .filter(item => !item.deleted_at && item.groupId === groupId && (item.eventType === 'bull_in' || item.eventType === 'bull_out'))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const seasons: BreedingSeason[] = [];
  for (const item of own) {
    if (item.eventType === 'bull_in') {
      seasons.push({ start: item.eventDate, exposed: item.exposedCount, turnoutEventId: item.id });
    } else {
      const open = [...seasons].reverse().find(season => !season.end && season.start <= item.eventDate);
      if (open) open.end = item.eventDate;
    }
  }
  return seasons;
}

/** The season still open (bulls in, none pulled), or null. */
export function openSeason(seasons: BreedingSeason[]): BreedingSeason | null {
  const last = seasons[seasons.length - 1];
  return last && !last.end ? last : null;
}

/** The calendar year a breeding season's calves are due in. */
export function seasonCalvingYear(season: BreedingSeason): string {
  return addDaysIso(season.start, GESTATION_DAYS).slice(0, 4);
}

export interface PregResult {
  date: string;
  bred: number;
  open: number;
  notChecked: number;
  /** Bred plus open: the head the vet actually called. */
  checked: number;
  /** Whole percent of the checked head found bred; null when none was checked. */
  percent: number | null;
}

type PregEvent = Pick<CattleEvent, 'id' | 'groupId' | 'eventType' | 'eventDate' | 'bredCount' | 'openCount' | 'notCheckedCount' | 'deleted_at' | 'createdAt'>;

/** The newest preg check that has results, optionally limited to one calendar year. */
export function latestPregCheck(events: PregEvent[], groupId: string, year?: string): PregResult | null {
  const checks = events
    .filter(item => !item.deleted_at && item.groupId === groupId && item.eventType === 'preg_check'
      && item.bredCount !== undefined && item.openCount !== undefined
      && (!year || item.eventDate.startsWith(year)))
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const latest = checks[0];
  if (!latest) return null;
  const bred = latest.bredCount ?? 0;
  const open = latest.openCount ?? 0;
  const checked = bred + open;
  return {
    date: latest.eventDate,
    bred,
    open,
    notChecked: latest.notCheckedCount ?? 0,
    checked,
    percent: checked > 0 ? Math.round((bred / checked) * 100) : null,
  };
}

export interface HerdYearStats {
  year: string;
  preg: PregResult | null;
  /** Females the calving and weaning percentages divide by. */
  exposed: number | null;
  /** turnout: from bulls-in records; on_hand: cows and heifers in the herd now. */
  exposedBasis: 'turnout' | 'on_hand' | null;
  calvesBorn: number;
  calvesLost: number;
  calvingPercent: number | null;
  headWeaned: number;
  /** Head-weighted average weaning weight; null when no weaning recorded a weight. */
  avgWeaningWeight: number | null;
  weaningPercent: number | null;
  /** Pounds (or kg) weaned per cow exposed: head weaned x average weight / exposed. */
  weanedWeightPerExposed: number | null;
}

type StatsEvent = SeasonEvent & PregEvent & Pick<CattleEvent, 'headDelta' | 'cattleClass' | 'transferId' | 'headWeaned' | 'avgWeight'>;

/**
 * A herd's calf-crop numbers for one calendar year. Calving % and weaning % divide
 * by the females exposed to the bulls in the seasons whose calves are due that year;
 * without a recorded turnout they fall back to the cows and heifers on hand.
 */
export function herdYearStats(
  group: Pick<CattleGroup, 'id' | 'counts'>,
  events: StatsEvent[],
  year: string,
): HerdYearStats {
  const seasons = breedingSeasons(events, group.id).filter(season => seasonCalvingYear(season) === year);
  const turnoutExposed = seasons.reduce((sum, season) => sum + (season.exposed ?? 0), 0);
  const onHand = group.counts.cows + group.counts.heifers;
  const exposed = turnoutExposed > 0 ? turnoutExposed : onHand > 0 ? onHand : null;
  const exposedBasis = turnoutExposed > 0 ? 'turnout' : onHand > 0 ? 'on_hand' : null;

  const calving = calvingStats({ id: group.id, counts: group.counts }, events, year);
  let headWeaned = 0;
  let weightedHead = 0;
  let weightTotal = 0;
  for (const item of events) {
    if (item.deleted_at || item.groupId !== group.id || item.eventType !== 'weaning'
      || !item.eventDate.startsWith(year) || !item.headWeaned) continue;
    headWeaned += item.headWeaned;
    if (item.avgWeight) {
      weightedHead += item.headWeaned;
      weightTotal += item.headWeaned * item.avgWeight;
    }
  }
  const avgWeaningWeight = weightedHead > 0 ? weightTotal / weightedHead : null;

  return {
    year,
    preg: latestPregCheck(events, group.id, year),
    exposed,
    exposedBasis,
    calvesBorn: calving.calvesBorn,
    calvesLost: calving.calvesLost,
    calvingPercent: exposed && calving.calvesBorn > 0 ? Math.round((calving.calvesBorn / exposed) * 100) : null,
    headWeaned,
    avgWeaningWeight: avgWeaningWeight === null ? null : Math.round(avgWeaningWeight * 10) / 10,
    weaningPercent: exposed && headWeaned > 0 ? Math.round((headWeaned / exposed) * 100) : null,
    weanedWeightPerExposed: exposed && weightedHead > 0 ? Math.round(weightTotal / exposed) : null,
  };
}

/** Years worth showing for a herd: any year with a calving, weaning, preg check or due breeding season, newest first. */
export function statsYears(group: Pick<CattleGroup, 'id'>, events: StatsEvent[]): string[] {
  const years = new Set<string>();
  for (const item of events) {
    if (item.deleted_at || item.groupId !== group.id) continue;
    if (item.eventType === 'calving' || item.eventType === 'weaning' || item.eventType === 'preg_check') {
      years.add(item.eventDate.slice(0, 4));
    }
  }
  for (const season of breedingSeasons(events, group.id)) years.add(seasonCalvingYear(season));
  return [...years].sort((a, b) => b.localeCompare(a));
}

/** Preg-check starting values: cows and heifers, none called yet. */
export function pregCheckDefaults(counts: CattleCounts): { bred: number; open: number; notChecked: number } {
  return { bred: 0, open: 0, notChecked: counts.cows + counts.heifers };
}
