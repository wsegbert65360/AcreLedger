export type CattleClass =
  | 'cows'
  | 'bulls'
  | 'calves'
  | 'replacement_heifers'
  | 'stockers'
  | 'mixed';

export type CattleEventType =
  | 'calving'
  | 'weaning'
  | 'working'
  | 'preg_check'
  | 'death'
  | 'head_added'
  | 'head_removed';

export type CattleRemovalReason = 'shipped' | 'died' | 'moved_to_another_group';

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
  headCount: number;
  currentFieldId?: string;
  currentSince?: string;
  notes?: string;
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
  notes?: string;
}

export interface CattleGroupRow {
  id: string;
  farm_id: string;
  name: string;
  class: CattleClass;
  head_count: number;
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
  notes?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}
