import { useMemo, useState } from 'react';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildLocationOptions, locationOptionLabel, type LocationOption } from '@/lib/cattle/locations';
import { OFF_PASTURE_LABEL } from '@/lib/cattle/ui';
import { localTodayIso } from '@/lib/equipment';
import { useFarm } from '@/store/farmStore';

export const OFF_LOCATION = '__off_pasture__';

/** The farm's fields as herd locations: pasture, hay fields, and (in fall and winter) crop fields. */
export function useLocationOptions(): LocationOption[] {
  const { fields, plantRecords, harvestRecords, hayHarvestRecords, cattleMoves, activeSeason } = useFarm();
  return useMemo(
    () => buildLocationOptions([...fields], {
      plantings: plantRecords, harvests: harvestRecords, hay: hayHarvestRecords, moves: cattleMoves,
      today: localTodayIso(), season: Number(activeSeason),
    }),
    [fields, plantRecords, harvestRecords, hayHarvestRecords, cattleMoves, activeSeason],
  );
}

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Whether the picked unharvested crop field has been confirmed. */
  confirmed: boolean;
  onConfirmChange: (confirmed: boolean) => void;
  label?: string;
  allowOff?: boolean;
}

export default function LocationPicker({ id, value, onChange, confirmed, onConfirmChange, label = 'Location', allowOff = true }: Props) {
  const options = useLocationOptions();
  const [showAll, setShowAll] = useState(false);
  const visible = options.filter(option => showAll || option.suggested || option.id === value);
  const selected = options.find(option => option.id === value);
  const hiddenCount = options.length - options.filter(option => option.suggested).length;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-12"><SelectValue placeholder="Choose a pasture or field" /></SelectTrigger>
        <SelectContent>
          {visible.map(option => (
            <SelectItem key={option.id} value={option.id} className="min-h-11">{locationOptionLabel(option)}</SelectItem>
          ))}
          {allowOff && <SelectItem value={OFF_LOCATION} className="min-h-11">{OFF_PASTURE_LABEL}</SelectItem>}
        </SelectContent>
      </Select>
      {hiddenCount > 0 && !showAll && (
        <button type="button" className="text-sm font-medium text-primary underline" onClick={() => setShowAll(true)}>
          Show all fields
        </button>
      )}
      {selected?.unharvested && (
        <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          <input
            type="checkbox" className="mt-1 h-4 w-4" checked={confirmed}
            onChange={event => onConfirmChange(event.target.checked)}
          />
          <span>{selected.name} still has {selected.detail.split(' · ')[0].toLowerCase()} that has not been harvested. Cattle will be turned in on a standing crop.</span>
        </label>
      )}
    </div>
  );
}

/** True when the picked field is an unharvested crop field the user has not confirmed. */
export function needsLocationConfirm(options: LocationOption[], value: string, confirmed: boolean): boolean {
  return !confirmed && options.some(option => option.id === value && option.unharvested);
}
