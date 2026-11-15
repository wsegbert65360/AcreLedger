import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  CATTLE_CLASSES, CATTLE_CLASS_LABELS, duplicateGroupNameMessage, findDuplicateGroupName, parseHeadCount,
} from '@/lib/cattle/ui';
import { useFarm } from '@/store/farmStore';
import type { CattleClass, CattleGroup } from '@/types/cattle';

interface Props {
  /** Leave out to add a new group. */
  group?: CattleGroup;
  onClose: () => void;
  onSaved?: (id: string | undefined) => void;
}

/** Add a group, or rename / re-class / change the head count of an existing one. */
export default function CattleGroupDialog({ group, onClose, onSaved }: Props) {
  const { cattleGroups, addCattleGroup, updateCattleGroup } = useFarm();
  const [name, setName] = useState(group?.name ?? '');
  const [cattleClass, setCattleClass] = useState<CattleClass>(group?.class ?? 'cows');
  const [head, setHead] = useState(group ? String(group.headCount) : '');
  const [notes, setNotes] = useState(group?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) return setError('Give the group a name.');
    const count = parseHeadCount(head);
    if (count === null) return setError('Head count must be a whole number, zero or more.');
    if (findDuplicateGroupName(cattleGroups, trimmed, group?.id)) return setError(duplicateGroupNameMessage(trimmed));
    setError(null);
    setSaving(true);
    try {
      const cleanNotes = notes.trim();
      let ok: boolean;
      if (group) {
        ok = await updateCattleGroup(group.id, {
          name: trimmed, class: cattleClass, notes: cleanNotes || undefined,
          // The store only sends head_count when this differs from what is saved.
          headCount: count,
        });
      } else {
        ok = await addCattleGroup({ name: trimmed, class: cattleClass, headCount: count, notes: cleanNotes || undefined });
      }
      if (!ok) return toast.error('Could not save the group.');
      onSaved?.(group?.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{group ? 'Edit group' : 'Add a group'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cattle-name">Group name</Label>
            <Input id="cattle-name" value={name} onChange={event => setName(event.target.value)} className="h-11" autoFocus placeholder="Spring cows" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cattle-class">Type</Label>
            <Select value={cattleClass} onValueChange={value => setCattleClass(value as CattleClass)}>
              <SelectTrigger id="cattle-class" className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATTLE_CLASSES.map(item => <SelectItem key={item} value={item}>{CATTLE_CLASS_LABELS[item]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cattle-head">Head count</Label>
            <Input id="cattle-head" value={head} onChange={event => setHead(event.target.value)} className="h-11" inputMode="numeric" placeholder="0" />
          </div>
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
