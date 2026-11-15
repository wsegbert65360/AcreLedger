import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { OFF_PASTURE_LABEL, isFutureDate, isPastureField, orderFieldsForPicker } from '@/lib/cattle/ui';
import { localTodayIso } from '@/lib/equipment';
import { useFarm } from '@/store/farmStore';
import type { CattleGroup } from '@/types/cattle';

const OFF = '__off_pasture__';

/** Move a group to a pasture. Pasture and hay fields are listed first; the date starts at today. */
export default function CattleMoveDialog({ group, onClose }: { group: CattleGroup; onClose: () => void }) {
  const { fields, moveCattleGroup } = useFarm();
  const today = localTodayIso();
  const [fieldId, setFieldId] = useState('');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const options = useMemo(() => orderFieldsForPicker([...fields]), [fields]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!fieldId) return setError('Pick where the group is going.');
    if (!date) return setError('Pick the date of the move.');
    if (isFutureDate(date, localTodayIso())) return setError('The move date cannot be in the future.');
    setError(null);
    setSaving(true);
    try {
      const ok = await moveCattleGroup({
        groupId: group.id, fieldId: fieldId === OFF ? undefined : fieldId, movedOn: date, notes: notes.trim() || undefined,
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
          <div className="space-y-1.5">
            <Label htmlFor="move-field">Moving to</Label>
            <Select value={fieldId} onValueChange={setFieldId}>
              <SelectTrigger id="move-field" className="h-12"><SelectValue placeholder="Choose a pasture" /></SelectTrigger>
              <SelectContent>
                {options.map(field => (
                  <SelectItem key={field.id} value={field.id} className="min-h-11">
                    {field.name}{isPastureField(field) ? '' : ' (not pasture)'}
                  </SelectItem>
                ))}
                <SelectItem value={OFF} className="min-h-11">{OFF_PASTURE_LABEL}</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
