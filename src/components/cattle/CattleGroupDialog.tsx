import { useState, type FormEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { COUNT_CLASSES, COUNT_TITLES, countsTotal, emptyCounts, groupCounts } from '@/lib/cattle/counts';
import {
  CATTLE_CLASSES, CATTLE_CLASS_LABELS, duplicateGroupNameMessage, findDuplicateGroupName, parseHeadCount,
} from '@/lib/cattle/ui';
import { useFarm } from '@/store/farmStore';
import type { CattleClass, CattleGroup, CountClass } from '@/types/cattle';

interface Props {
  /** Leave out to add a new herd. */
  group?: CattleGroup;
  onClose: () => void;
  onSaved?: (id: string | undefined) => void;
}

type CountText = Record<CountClass, string>;

function toText(group?: CattleGroup): CountText {
  const counts = group ? groupCounts(group) : emptyCounts();
  return Object.fromEntries(COUNT_CLASSES.map(item => [item, counts[item] ? String(counts[item]) : ''])) as CountText;
}

/**
 * Add a herd, or edit one. A herd holds a count per class (cows, heifers, bulls,
 * calves, steers, stockers), so adding bulls to a cow herd never clears the cows.
 */
export default function CattleGroupDialog({ group, onClose, onSaved }: Props) {
  const { cattleGroups, addCattleGroup, updateCattleGroup } = useFarm();
  const [name, setName] = useState(group?.name ?? '');
  const [cattleClass, setCattleClass] = useState<CattleClass>(group?.class ?? 'mixed');
  const [countText, setCountText] = useState<CountText>(() => toText(group));
  const [notes, setNotes] = useState(group?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = Object.fromEntries(COUNT_CLASSES.map(item => [
    item, countText[item].trim() === '' ? 0 : parseHeadCount(countText[item]),
  ])) as Record<CountClass, number | null>;
  const valid = COUNT_CLASSES.every(item => parsed[item] !== null);
  const total = valid ? countsTotal(parsed as Record<CountClass, number>) : null;

  const step = (item: CountClass, by: number) => {
    const current = parsed[item] ?? 0;
    const next = Math.max(0, current + by);
    setCountText(text => ({ ...text, [item]: next === 0 ? '' : String(next) }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) return setError('Give the herd a name.');
    const bad = COUNT_CLASSES.find(item => parsed[item] === null);
    if (bad) return setError(`${COUNT_TITLES[bad]} must be a whole number, zero or more.`);
    if (findDuplicateGroupName(cattleGroups, trimmed, group?.id)) return setError(duplicateGroupNameMessage(trimmed));
    setError(null);
    setSaving(true);
    try {
      const cleanNotes = notes.trim();
      const counts = parsed as Record<CountClass, number>;
      let ok: boolean;
      if (group) {
        // The store only sends the counts when one differs from what is saved.
        ok = await updateCattleGroup(group.id, {
          name: trimmed, class: cattleClass, notes: cleanNotes || undefined, counts,
        });
      } else {
        ok = await addCattleGroup({ name: trimmed, class: cattleClass, counts, notes: cleanNotes || undefined });
      }
      if (!ok) return toast.error('Could not save the herd.');
      onSaved?.(group?.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{group ? 'Edit herd' : 'Add a herd'}</DialogTitle>
          <DialogDescription>Count every class that runs together on one pasture.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cattle-name">Herd name</Label>
            <Input id="cattle-name" value={name} onChange={event => setName(event.target.value)} className="h-11" autoFocus placeholder="Spring cows" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cattle-class">Herd type</Label>
            <Select value={cattleClass} onValueChange={value => setCattleClass(value as CattleClass)}>
              <SelectTrigger id="cattle-class" className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATTLE_CLASSES.map(item => <SelectItem key={item} value={item} className="min-h-11">{CATTLE_CLASS_LABELS[item]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Head in this herd</legend>
            {COUNT_CLASSES.map(item => (
              <div key={item} className="flex items-center gap-2">
                <Label htmlFor={`cattle-count-${item}`} className="w-20 shrink-0">{COUNT_TITLES[item]}</Label>
                <Button
                  type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0"
                  aria-label={`One fewer ${COUNT_TITLES[item].toLowerCase()}`} onClick={() => step(item, -1)}
                ><Minus className="h-4 w-4" /></Button>
                <Input
                  id={`cattle-count-${item}`} value={countText[item]} inputMode="numeric" placeholder="0"
                  onChange={event => setCountText(text => ({ ...text, [item]: event.target.value }))}
                  className="h-11 min-w-0 flex-1 text-center"
                />
                <Button
                  type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0"
                  aria-label={`One more ${COUNT_TITLES[item].toLowerCase()}`} onClick={() => step(item, 1)}
                ><Plus className="h-4 w-4" /></Button>
              </div>
            ))}
            <p className="text-sm font-semibold" data-testid="cattle-total">
              {total === null ? 'Total: check the counts' : `Total: ${total} head`}
            </p>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="cattle-notes">Notes (optional)</Label>
            <Textarea id="cattle-notes" value={notes} onChange={event => setNotes(event.target.value)} rows={2} />
          </div>
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="h-11" disabled={saving}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
