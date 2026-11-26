import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ENTITLEMENT_COPY } from '@/copy/entitlements';
import { groupCounts } from '@/lib/cattle/counts';
import { calvesBornBySex, weaningSplitDefaults } from '@/lib/cattle/lines';
import { isFutureDate, parseHeadCount } from '@/lib/cattle/ui';
import { localTodayIso } from '@/lib/equipment';
import { useFarm } from '@/store/farmStore';
import type { CattleGroup, CountClass } from '@/types/cattle';
import HerdDestination, {
  destinationError, emptyDestination, isNewHerd, newHerdFieldId, newHerdInput, useDestinationNeedsConfirm,
} from './HerdDestination';

/** Wean calves in one guided save: the weaning, heifer / steer classes, and where they go. */
export default function CattleWeanDialog({ group, onClose }: { group: CattleGroup; onClose: () => void }) {
  const { cattleGroups, cattleEvents, logCattleEvent, transferCattleHead, addCattleGroup, moveCattleGroup } = useFarm();
  const today = localTodayIso();
  const counts = groupCounts(group);
  const [date, setDate] = useState(today);
  const [weaned, setWeaned] = useState(counts.calves > 0 ? String(counts.calves) : '');
  const [heifers, setHeifers] = useState('');
  const [avgWeight, setAvgWeight] = useState('');
  const [moveOut, setMoveOut] = useState(false);
  const [dest, setDest] = useState(emptyDestination('stockers'));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const others = useMemo(() => cattleGroups.filter(item => !item.deleted_at && item.id !== group.id), [cattleGroups, group.id]);
  const needsConfirm = useDestinationNeedsConfirm(dest);
  const born = useMemo(() => calvesBornBySex(cattleEvents, group.id, date.slice(0, 4)), [cattleEvents, group.id, date]);
  const weanCount = parseHeadCount(weaned);
  const suggested = weanCount ? weaningSplitDefaults(born, weanCount) : null;

  const fail = (message: string) => { setError(message); return undefined; };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!date) return fail('Pick the weaning date.');
    if (isFutureDate(date, localTodayIso())) return fail('The weaning date cannot be in the future.');
    if (weanCount === null || weanCount < 1) return fail('Calves weaned must be a whole number, at least 1.');
    if (weanCount > counts.calves) return fail(`${group.name} only has ${counts.calves} ${counts.calves === 1 ? 'calf' : 'calves'}.`);
    let weight: number | undefined;
    if (avgWeight.trim()) {
      const value = Number(avgWeight.trim());
      if (!/^\d+(\.\d)?$/.test(avgWeight.trim()) || !(value > 0) || value > 9999) return fail('Average weight must be a number, like 540 or 540.5.');
      weight = value;
    }
    let split: { heifers: number; steers: number } | null = null;
    if (heifers.trim()) {
      const h = parseHeadCount(heifers);
      if (h === null || h > weanCount) return fail(`Heifer calves must be a whole number from 0 to ${weanCount}.`);
      split = { heifers: h, steers: weanCount - h };
    } else if (suggested) {
      split = suggested;
    }
    if (moveOut) {
      const problem = destinationError(dest, cattleGroups, needsConfirm);
      if (problem) return fail(problem);
    }

    setError(null);
    setSaving(true);
    let premiumRequired = false;
    const saveOptions = { onPremiumRequired: () => { premiumRequired = true; } };
    const cleanNotes = notes.trim() || undefined;
    try {
      const weaning = await logCattleEvent({
        groupId: group.id, eventType: 'weaning', eventDate: date, headDelta: 0, cattleClass: 'calves',
        headWeaned: weanCount, avgWeight: weight, notes: cleanNotes,
      }, saveOptions);
      if (!weaning) return void toast.error(premiumRequired ? ENTITLEMENT_COPY.cattleEventsLockedTitle : 'Could not save the weaning.');

      // Each step is its own queued save; a failure after the weaning is reported, not rolled back.
      const afterWean: { cls: CountClass; head: number }[] = [];
      const steps: (() => Promise<boolean>)[] = [];
      if (split) {
        for (const [toClass, head] of [['heifers', split.heifers], ['steers', split.steers]] as const) {
          if (head < 1) continue;
          afterWean.push({ cls: toClass, head });
          steps.push(() => logCattleEvent({
            groupId: group.id, eventType: 'reclass', eventDate: date, headDelta: 0,
            cattleClass: 'calves', toClass, classHead: head,
          }, saveOptions));
        }
      } else {
        afterWean.push({ cls: 'calves', head: weanCount });
      }
      let toGroupId = dest.target;
      if (moveOut) {
        if (isNewHerd(dest)) {
          toGroupId = crypto.randomUUID();
          steps.unshift(() => addCattleGroup(newHerdInput(dest, toGroupId)));
        }
        for (const line of afterWean) {
          steps.push(() => transferCattleHead({
            fromGroupId: group.id, toGroupId, head: line.head, eventDate: date, notes: cleanNotes ?? 'Weaning', cattleClass: line.cls,
          }, saveOptions));
        }
      }
      for (const step of steps) {
        if (!(await step())) {
          toast.error('Weaning was saved, but a later step did not. Check the herd and finish it from the herd page.');
          return onClose();
        }
      }
      if (moveOut && isNewHerd(dest)) {
        await new Promise(resolve => setTimeout(resolve, 0));
        const moved = await moveCattleGroup({ groupId: toGroupId, fieldId: newHerdFieldId(dest), movedOn: date });
        if (!moved) toast.error('Calves were moved, but the new herd’s location did not save. Move it from the herd page.');
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Wean calves — {group.name}</DialogTitle>
          <DialogDescription>{counts.calves} {counts.calves === 1 ? 'calf' : 'calves'} on the herd.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wean-date">Weaning date</Label>
            <Input id="wean-date" type="date" value={date} max={today} onChange={event => setDate(event.target.value)} className="h-12" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wean-head">Calves weaned</Label>
              <Input id="wean-head" inputMode="numeric" value={weaned} onChange={event => setWeaned(event.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wean-weight">Avg weight, lb</Label>
              <Input id="wean-weight" inputMode="decimal" value={avgWeight} onChange={event => setAvgWeight(event.target.value)} className="h-11" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wean-heifers">Heifer calves (the rest become steers)</Label>
            <Input
              id="wean-heifers" inputMode="numeric" value={heifers} onChange={event => setHeifers(event.target.value)}
              className="h-11" placeholder={suggested ? String(suggested.heifers) : 'Leave blank to keep as calves'}
            />
            {suggested && <p className="text-xs text-muted-foreground">From this year’s calving records: {suggested.heifers} heifers, {suggested.steers} steers.</p>}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={moveOut} onChange={event => setMoveOut(event.target.checked)} />
            Move the weaned calves to another herd
          </label>
          {moveOut && <HerdDestination idPrefix="wean-dest" dest={dest} onChange={setDest} others={others} label="Weaned calves go to" />}
          <div className="space-y-1.5">
            <Label htmlFor="wean-notes">Notes (optional)</Label>
            <Textarea id="wean-notes" value={notes} onChange={event => setNotes(event.target.value)} rows={2} />
          </div>
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="h-11" disabled={saving}>Wean</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
