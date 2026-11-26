import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { isFutureDate } from '@/lib/cattle/ui';
import { localTodayIso } from '@/lib/equipment';
import { useFarm } from '@/store/farmStore';
import type { CattleGroup } from '@/types/cattle';
import LocationPicker, { OFF_LOCATION, needsLocationConfirm, useLocationOptions } from './LocationPicker';

/** Move a group to a pasture, hay field or (in fall and winter) crop field; the date starts at today. */
export default function CattleMoveDialog({ group, onClose }: { group: CattleGroup; onClose: () => void }) {
  const { moveCattleGroup } = useFarm();
  const today = localTodayIso();
  const options = useLocationOptions();
  const [fieldId, setFieldId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!fieldId) return setError('Pick where the group is going.');
    if (needsLocationConfirm(options, fieldId, confirmed)) return setError('Confirm the crop has not been harvested, or pick another field.');
    if (!date) return setError('Pick the date of the move.');
    if (isFutureDate(date, localTodayIso())) return setError('The move date cannot be in the future.');
    setError(null);
    setSaving(true);
    try {
      const ok = await moveCattleGroup({
        groupId: group.id, fieldId: fieldId === OFF_LOCATION ? undefined : fieldId, movedOn: date, notes: notes.trim() || undefined,
      });
      if (!ok) return toast.error('Could not save the move.');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Move {group.name}</DialogTitle>
          <DialogDescription>{group.headCount} head</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <LocationPicker id="move-field" label="Moving to" value={fieldId} onChange={value => { setFieldId(value); setConfirmed(false); }} confirmed={confirmed} onConfirmChange={setConfirmed} />
          <div className="space-y-1.5">
            <Label htmlFor="move-date">Date</Label>
            <Input id="move-date" type="date" value={date} max={today} onChange={event => setDate(event.target.value)} className="h-12" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="move-notes">Notes (optional)</Label>
            <Textarea id="move-notes" value={notes} onChange={event => setNotes(event.target.value)} rows={2} />
          </div>
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="h-11" disabled={saving}>Move</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
