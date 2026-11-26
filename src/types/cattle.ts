/** The herd type. It picks the label and the class an older client's head change lands on. */
export type CattleClass =
  | 'cows'
  | 'bulls'
  | 'calves'
  | 'replacement_heifers'
  | 'stockers'
  | 'mixed';

/** The classes a herd counts. A cow-calf herd holds several at once. */
export type CountClass = 'cows' | 'heifers' | 'bulls' | 'calves' | 'steers' | 'stockers';
export type CattleCounts = Record<CountClass, number>;

export type CattleEventType =
  | 'calving'
  | 'weaning'
  | 'working'
  | 'preg_check'
  | 'death'
  | 'head_added'
  | 'head_removed'
  | 'reclass';

/** A death is logged with the death event, not as a removal reason. */
export type CattleRemovalReason = 'shipped' | 'moved_to_another_group';

export type CalfSex = 'heifer' | 'steer' | 'bull';

interface CattleRowBase {
  id: string;
  farm_id: string;
  createdAt: string;
  updatedAt: string;
  deleted_at: string | null;
}

export interface CattleGroup extends CattleRowBase {
  name: string;
  class: CattleClass;
  /** Total head; always the sum of counts. */
  headCount: number;
  counts: CattleCounts;
  currentFieldId?: string;
  currentSince?: string;
  notes?: string;
}

/**
 * A partial group edit. counts is optional on purpose: leave it out unless the
 * user changed a count, so events and transfers keep ownership of the counts.
 */
export interface CattleGroupEdit {
  name?: string;
  class?: CattleClass;
  notes?: string;
  counts?: CattleCounts;
}

export interface CattleMove extends CattleRowBase {
  groupId: string;
  fieldId?: string;
  movedOn: string;
  headCount: number;
  notes?: string;
}

export interface CattleEvent extends CattleRowBase {
  groupId: string;
  eventType: CattleEventType;
  eventDate: string;
  headDelta: number;
  reason?: CattleRemovalReason;
  /** Shared by both halves of a head transfer; deleting either half reverses both. */
  transferId?: string;
  /** The class the head change hit (the from-class for a reclass). */
  cattleClass?: CountClass;
  /** Reclass only: the class the head moved to, and how many. */
  toClass?: CountClass;
  classHead?: number;
  /** Calving only, when every calf born was one sex. */
  calfSex?: CalfSex;
  notes?: string;
}

export interface CattleGroupRow {
  id: string;
  farm_id: string;
  name: string;
  class: CattleClass;
  head_count: number;
  cows?: number | null;
  heifers?: number | null;
  bulls?: number | null;
  calves?: number | null;
  steers?: number | null;
  stockers?: number | null;
  current_field_id?: string | null;
  current_since?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface CattleMoveRow {
  id: string;
  farm_id: string;
  group_id: string;
  field_id?: string | null;
  moved_on: string;
  head_count: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface CattleEventRow {
  id: string;
  farm_id: string;
  group_id: string;
  event_type: CattleEventType;
  event_date: string;
  head_delta: number;
  reason?: CattleRemovalReason | null;
  transfer_id?: string | null;
  cattle_class?: CountClass | null;
  to_class?: CountClass | null;
  class_head?: number | null;
  calf_sex?: CalfSex | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}
