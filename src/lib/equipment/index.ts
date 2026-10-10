import type {
  Equipment,
  EquipmentKind,
  MaintenanceLog,
  MaintenanceSchedule,
  MeterUnit,
} from '@/types/equipment';
import { toLocalIsoDate } from '@/utils/dates';

export type DueStatus = 'ok' | 'due_soon' | 'overdue';

export interface EquipmentDueStatus {
  status: DueStatus;
  remainingReading?: number;
  remainingDays?: number;
}

const STATUS_RANK: Record<DueStatus, number> = {
  ok: 0,
  due_soon: 1,
  overdue: 2,
};

export function localTodayIso(now: Date = new Date()): string {
  return toLocalIsoDate(now.getTime());
}

function calendarDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? toLocalIsoDate(ms) : value.slice(0, 10);
}

function calendarDay(value: string): number {
  const [year, month, day] = calendarDate(value).split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function ruleStatus(remaining: number, soonThreshold: number): DueStatus {
  if (remaining <= 0) return 'overdue';
  if (remaining <= soonThreshold) return 'due_soon';
  return 'ok';
}

export function computeDueStatus(
  schedule: MaintenanceSchedule,
  equipment: Equipment,
  today: string,
): EquipmentDueStatus {
  let status: DueStatus = 'ok';
  let remainingReading: number | undefined;
  let remainingDays: number | undefined;

  if (schedule.intervalValue != null) {
    remainingReading = schedule.lastDoneReading == null
      ? schedule.intervalValue
      : schedule.lastDoneReading + schedule.intervalValue - equipment.currentReading;
    status = ruleStatus(remainingReading, schedule.intervalValue * 0.1);
  }

  if (schedule.intervalDays != null) {
    const baseline = schedule.lastDoneAt ?? schedule.createdAt;
    remainingDays = calendarDay(baseline) + schedule.intervalDays - calendarDay(today);
    const dayStatus = ruleStatus(remainingDays, Math.min(30, schedule.intervalDays * 0.1));
    if (STATUS_RANK[dayStatus] > STATUS_RANK[status]) status = dayStatus;
  }

  return { status, remainingReading, remainingDays };
}

function urgencyScore(result: EquipmentDueStatus, schedule: MaintenanceSchedule): number {
  const scores: number[] = [];
  if (result.remainingReading != null && schedule.intervalValue) {
    scores.push(result.remainingReading / schedule.intervalValue);
  }
  if (result.remainingDays != null && schedule.intervalDays) {
    scores.push(result.remainingDays / schedule.intervalDays);
  }
  return scores.length ? Math.min(...scores) : Number.POSITIVE_INFINITY;
}

export function summarizeEquipmentStatus(
  schedules: MaintenanceSchedule[],
  equipment: Equipment,
  today: string,
): { status: DueStatus; taskName?: string } {
  const active = schedules.filter(schedule => !schedule.deleted_at && schedule.equipmentId === equipment.id);
  if (active.length === 0) return { status: 'ok' };

  const ranked = active.map(schedule => {
    const result = computeDueStatus(schedule, equipment, today);
    return { schedule, result, urgency: urgencyScore(result, schedule) };
  }).sort((a, b) =>
    STATUS_RANK[b.result.status] - STATUS_RANK[a.result.status]
    || a.urgency - b.urgency
    || a.schedule.taskName.localeCompare(b.schedule.taskName));

  return { status: ranked[0].result.status, taskName: ranked[0].schedule.taskName };
}

function roundOne(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function convertMeterUnit(value: number, from: MeterUnit, to: MeterUnit): number | null {
  if (from === to) return roundOne(value);
  if (from === 'miles' && to === 'km') return roundOne(value * 1.609344);
  if (from === 'km' && to === 'miles') return roundOne(value / 1.609344);
  return null;
}

export type ReadingUpdateResult =
  | { status: 'applied'; equipment: Equipment }
  | { status: 'warning'; equipment: Equipment; requestedReading: number }
  | { status: 'invalid'; equipment: Equipment };

export function applyReadingUpdate(
  equipment: Equipment,
  newReading: number,
  options: { force: boolean },
): ReadingUpdateResult {
  if (!Number.isFinite(newReading) || newReading < 0) return { status: 'invalid', equipment };
  if (newReading < equipment.currentReading && !options.force) {
    return { status: 'warning', equipment, requestedReading: newReading };
  }
  return {
    status: 'applied',
    equipment: {
      ...equipment,
      currentReading: roundOne(newReading),
      readingUpdatedAt: new Date().toISOString(),
    },
  };
}

const BRAND_COLORS: readonly [readonly string[], string][] = [
  [['johndeere', 'deere'], '#367C2B'],
  [['caseih', 'case'], '#C8102E'],
  [['newholland'], '#1F4E9C'],
  [['kubota'], '#F58220'],
  [['masseyferguson', 'massey'], '#D2232A'],
  [['claas'], '#7DB928'],
  [['ford'], '#003478'],
];

export function resolveBrandColor(make: string | undefined): string | null {
  const normalized = make?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
  if (!normalized) return null;
  return BRAND_COLORS.find(([matches]) => matches.some(match => normalized.includes(match)))?.[1] ?? null;
}

export type EquipmentKindIcon = EquipmentKind;

export function getKindIcon(kind: EquipmentKind): EquipmentKindIcon {
  return kind;
}

export interface CostBucket {
  service: number;
  repair: number;
  total: number;
}

export interface EquipmentCostSummary {
  allTime: CostBucket;
  byYear: Record<number, CostBucket>;
}

function emptyBucket(): CostBucket {
  return { service: 0, repair: 0, total: 0 };
}

export function costTotals(logs: MaintenanceLog[]): Record<string, EquipmentCostSummary> {
  const totals: Record<string, EquipmentCostSummary> = {};
  for (const log of logs) {
    if (log.deleted_at) continue;
    const cost = roundOneHundredths((log.costParts ?? 0) + (log.costLabor ?? 0));
    const year = Number(log.performedOn.slice(0, 4));
    const summary = totals[log.equipmentId] ?? { allTime: emptyBucket(), byYear: {} };
    const yearly = summary.byYear[year] ?? emptyBucket();
    summary.allTime[log.kind] = roundOneHundredths(summary.allTime[log.kind] + cost);
    summary.allTime.total = roundOneHundredths(summary.allTime.total + cost);
    yearly[log.kind] = roundOneHundredths(yearly[log.kind] + cost);
    yearly.total = roundOneHundredths(yearly.total + cost);
    summary.byYear[year] = yearly;
    totals[log.equipmentId] = summary;
  }
  return totals;
}

function roundOneHundredths(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
