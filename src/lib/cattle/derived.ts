import type { CattleGroup, CattleMove } from '@/types/cattle';

const DAY_MS = 86_400_000;

function dayNumber(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS;
}

function elapsedDays(from: string, through: string): number {
  const start = dayNumber(from);
  const end = dayNumber(through);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
}

export function daysOnCurrentPasture(
  group: Pick<CattleGroup, 'currentFieldId' | 'currentSince'>,
  through: string,
): number {
  return group.currentFieldId && group.currentSince ? elapsedDays(group.currentSince, through) : 0;
}

export interface FieldGrazingTotals {
  grazingDays: number;
  headDays: number;
}

export function grazingTotalsByField(
  moves: CattleMove[],
  through: string,
): Record<string, FieldGrazingTotals> {
  const totals: Record<string, FieldGrazingTotals> = {};
  const byGroup = new Map<string, CattleMove[]>();
  for (const move of moves.filter(item => !item.deleted_at)) {
    const groupMoves = byGroup.get(move.groupId) ?? [];
    groupMoves.push(move);
    byGroup.set(move.groupId, groupMoves);
  }

  for (const groupMoves of byGroup.values()) {
    groupMoves.sort((a, b) => a.movedOn.localeCompare(b.movedOn) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    for (let index = 0; index < groupMoves.length; index += 1) {
      const move = groupMoves[index];
      if (!move.fieldId) continue;
      const nextDate = groupMoves[index + 1]?.movedOn ?? through;
      const days = elapsedDays(move.movedOn, nextDate > through ? through : nextDate);
      const current = totals[move.fieldId] ?? { grazingDays: 0, headDays: 0 };
      current.grazingDays += days;
      current.headDays += days * move.headCount;
      totals[move.fieldId] = current;
    }
  }
  return totals;
}

export function restDaysSinceLastGrazed(
  fieldId: string,
  moves: CattleMove[],
  through: string,
): number | null {
  const byGroup = new Map<string, CattleMove[]>();
  for (const move of moves.filter(item => !item.deleted_at)) {
    const groupMoves = byGroup.get(move.groupId) ?? [];
    groupMoves.push(move);
    byGroup.set(move.groupId, groupMoves);
  }

  let lastExit: string | null = null;
  for (const groupMoves of byGroup.values()) {
    groupMoves.sort((a, b) => a.movedOn.localeCompare(b.movedOn) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    for (let index = 0; index < groupMoves.length; index += 1) {
      const move = groupMoves[index];
      if (move.fieldId !== fieldId) continue;
      const next = groupMoves[index + 1];
      if (!next || next.movedOn > through) return 0;
      if (!lastExit || next.movedOn > lastExit) lastExit = next.movedOn;
    }
  }
  return lastExit ? elapsedDays(lastExit, through) : null;
}
