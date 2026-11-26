import { useMemo } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { emptyCounts } from '@/lib/cattle/counts';
import { CATTLE_CLASSES, CATTLE_CLASS_LABELS, duplicateGroupNameMessage, findDuplicateGroupName } from '@/lib/cattle/ui';
import type { CattleClass, CattleGroup } from '@/types/cattle';
import LocationPicker, { OFF_LOCATION, needsLocationConfirm, useLocationOptions } from './LocationPicker';

const NEW_HERD = '__new_herd__';

/** Where head go: an existing herd, or a new herd with its own name, type and location. */
export interface Destination {
  /** An existing herd's id, or NEW_HERD. */
  target: string;
  name: string;
  herdClass: CattleClass;
  fieldId: string;
  confirmed: boolean;
}

export function emptyDestination(herdClass: CattleClass = 'stockers'): Destination {
  return { target: '', name: '', herdClass, fieldId: '', confirmed: false };
}

export const isNewHerd = (dest: Destination) => dest.target === NEW_HERD;

/** The first problem with a destination, or null. */
export function destinationError(
  dest: Destination,
  groups: Pick<CattleGroup, 'id' | 'name' | 'deleted_at'>[],
  needsConfirm: boolean,
): string | null {
  if (!dest.target) return 'Pick the herd the head are going to.';
  if (!isNewHerd(dest)) return null;
  const name = dest.name.trim();
  if (!name) return 'Give the new herd a name.';
  if (findDuplicateGroupName(groups as CattleGroup[], name)) return duplicateGroupNameMessage(name);
  if (!dest.fieldId) return 'Pick where the new herd will be.';
  if (needsConfirm) return 'Confirm the crop has not been harvested, or pick another field.';
  return null;
}

export function newHerdInput(dest: Destination, id: string) {
  return { id, name: dest.name.trim(), class: dest.herdClass, counts: emptyCounts() };
}

export function newHerdFieldId(dest: Destination): string | undefined {
  return dest.fieldId === OFF_LOCATION ? undefined : dest.fieldId;
}

interface Props {
  idPrefix: string;
  dest: Destination;
  onChange: (dest: Destination) => void;
  others: CattleGroup[];
  label?: string;
}

export default function HerdDestination({ idPrefix, dest, onChange, others, label = 'Move to herd' }: Props) {
  const sorted = useMemo(() => [...others].sort((a, b) => a.name.localeCompare(b.name)), [others]);
  const set = (patch: Partial<Destination>) => onChange({ ...dest, ...patch });
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-target`}>{label}</Label>
        <Select value={dest.target} onValueChange={target => set({ target })}>
          <SelectTrigger id={`${idPrefix}-target`} className="h-11"><SelectValue placeholder="Choose a herd" /></SelectTrigger>
          <SelectContent>
            {sorted.map(item => <SelectItem key={item.id} value={item.id} className="min-h-11">{item.name}</SelectItem>)}
            <SelectItem value={NEW_HERD} className="min-h-11">Start a new herd…</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isNewHerd(dest) && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-name`}>New herd name</Label>
            <Input id={`${idPrefix}-name`} value={dest.name} onChange={event => set({ name: event.target.value })} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-type`}>Herd type</Label>
            <Select value={dest.herdClass} onValueChange={value => set({ herdClass: value as CattleClass })}>
              <SelectTrigger id={`${idPrefix}-type`} className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATTLE_CLASSES.map(item => <SelectItem key={item} value={item} className="min-h-11">{CATTLE_CLASS_LABELS[item]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <LocationPicker
            id={`${idPrefix}-location`} label="Location" value={dest.fieldId}
            onChange={fieldId => set({ fieldId, confirmed: false })} confirmed={dest.confirmed} onConfirmChange={confirmed => set({ confirmed })}
          />
        </div>
      )}
    </div>
  );
}

/** Whether the new-herd location still needs the unharvested-crop confirmation. */
export function useDestinationNeedsConfirm(dest: Destination): boolean {
  const options = useLocationOptions();
  return isNewHerd(dest) && needsLocationConfirm(options, dest.fieldId, dest.confirmed);
}
