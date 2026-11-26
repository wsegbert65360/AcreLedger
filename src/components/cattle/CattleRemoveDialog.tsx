import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ENTITLEMENT_COPY } from '@/copy/entitlements';
import { groupCounts } from '@/lib/cattle/counts';
import { withdrawalConflicts } from '@/lib/cattle/health';
import { emptyClassText, parseClassLines } from '@/lib/cattle/lines';
import { CATTLE_DEATH_CAUSE_LABELS, isFutureDate } from '@/lib/cattle/ui';
import { localTodayIso } from '@/lib/equipment';
import { useFarm } from '@/store/farmStore';
import { formatIsoDate } from '@/utils/dates';
import type { CattleDeathCause, CattleGroup } from '@/types/cattle';
import ClassLinesEditor from './ClassLinesEditor';
import HerdDestination, {
  destinationError, emptyDestination, isNewHerd, newHerdFieldId, newHerdInput, useDestinationNeedsConfirm,
} from './HerdDestination';

export type RemoveMode = 'sell' | 'death' | 'transfer';

const COPY: Record<RemoveMode, { title: string; verb: string; button: string }> = {
  sell: { title: 'Sell', verb: 'sold', button: 'Save sale' },
  death: { title: 'Record death', verb: 'lost', button: 'Save death' },
  transfer: { title: 'Transfer', verb: 'moved', button: 'Transfer' },
};

const NO_CAUSE = '__none__';

/** Sell, record deaths, or transfer head out of a herd, several classes in one save. */
export default function CattleRemoveDialog({ group, mode, onClose }: { group: CattleGroup; mode: RemoveMode; onClose: () => void }) {
  const { cattleGroups, cattleEvents, cattleTreatments, logCattleEvent, transferCattleHead, addCattleGroup, moveCattleGroup } = useFarm();
  const today = localTodayIso();
  const counts = groupCounts(group);
  const [date, setDate] = useState(today);
  const [text, setText] = useState(emptyClassText());
  const [avgWeight, setAvgWeight] = useState('');
  const [cause, setCause] = useState<CattleDeathCause | typeof NO_CAUSE>(NO_CAUSE);
  const [dest, setDest] = useState(emptyDestination());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const others = useMemo(() => cattleGroups.filter(item => !item.deleted_at && item.id !== group.id), [cattleGroups, group.id]);
  const needsConfirm = useDestinationNeedsConfirm(dest);
  const copy = COPY[mode];

  const fail = (message: string) => { setError(message); return undefined; };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!date) return fail('Pick the date.');
    if (isFutureDate(date, localTodayIso())) return fail('The date cannot be in the future.');
    const parsed = parseClassLines(text, counts, group.name);
    if (parsed.error !== undefined) return fail(parsed.error);
    const lines = parsed.lines;

    let weight: number | undefined;
    if (mode === 'sell' && avgWeight.trim()) {
      const value = Number(avgWeight.trim());
      if (!/^\d+(\.\d)?$/.test(avgWeight.trim()) || !(value > 0) || value > 9999) return fail('Average weight must be a number, like 1250 or 1250.5.');
      // One weight cannot describe two classes (cows and calves, say).
      if (lines.length > 1) return fail('An average weight covers one class. Clear it, or sell each class separately.');
      weight = value;
    }
    if (mode === 'transfer') {
      const problem = destinationError(dest, cattleGroups, needsConfirm);
      if (problem) return fail(problem);
    }
    if (mode === 'sell') {
      for (const line of lines) {
        const held = withdrawalConflicts(cattleTreatments, cattleEvents, group.id, date, line.cls);
        if (held.length > 0) {
          const worst = held[0];
          if (!window.confirm(`${worst.product} is still in withdrawal until ${formatIsoDate(worst.withdrawalUntil)}. Sell these head anyway?`)) return undefined;
          break;
        }
      }
    }

    setError(null);
    setSaving(true);
    let premiumRequired = false;
    const saveOptions = { onPremiumRequired: () => { premiumRequired = true; } };
    const cleanNotes = notes.trim() || undefined;
    let saved = 0;
    try {
      let toGroupId = dest.target;
      if (mode === 'transfer' && isNewHerd(dest)) {
        toGroupId = crypto.randomUUID();
        const created = await addCattleGroup(newHerdInput(dest, toGroupId));
        if (!created) return void toast.error('Could not start the new herd.');
      }
      for (const line of lines) {
        let ok: boolean;
        if (mode === 'transfer') {
          ok = await transferCattleHead({
            fromGroupId: group.id, toGroupId, head: line.head, eventDate: date, notes: cleanNotes, cattleClass: line.cls,
          }, saveOptions);
        } else {
          ok = await logCattleEvent({
            groupId: group.id, eventType: mode === 'sell' ? 'head_removed' : 'death', eventDate: date,
            headDelta: -line.head, cattleClass: line.cls,
            reason: mode === 'sell' ? 'shipped' : cause === NO_CAUSE ? undefined : cause,
            avgWeight: weight, notes: cleanNotes,
          }, saveOptions);
        }
        if (!ok) {
          toast.error(premiumRequired
            ? ENTITLEMENT_COPY.cattleEventsLockedTitle
            : saved > 0 ? `${saved} of ${lines.length} saved. Check the herd, then enter the rest.` : 'Could not save.');
          return saved > 0 ? onClose() : undefined;
        }
        saved += 1;
      }
      if (mode === 'transfer' && isNewHerd(dest)) {
        // Let the transfers land in state so the move records the herd's real head count.
        await new Promise(resolve => setTimeout(resolve, 0));
        const moved = await moveCattleGroup({ groupId: toGroupId, fieldId: newHerdFieldId(dest), movedOn: date });
        if (!moved) toast.error('Head were moved, but the new herd’s location did not save. Move it from the herd page.');
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
          <DialogTitle>{copy.title} — {group.name}</DialogTitle>
          <DialogDescription>Enter head for each class that was {copy.verb}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="remove-date">Date</Label>
            <Input id="remove-date" type="date" value={date} max={today} onChange={event => setDate(event.target.value)} className="h-12" />
          </div>
          <ClassLinesEditor idPrefix="remove" counts={counts} text={text} onChange={setText} />
          {mode === 'sell' && (
            <div className="space-y-1.5">
              <Label htmlFor="remove-weight">Average weight, lb (optional)</Label>
              <Input id="remove-weight" inputMode="decimal" value={avgWeight} onChange={event => setAvgWeight(event.target.value)} className="h-11" />
            </div>
          )}
          {mode === 'death' && (
            <div className="space-y-1.5">
              <Label htmlFor="remove-cause">Cause (optional)</Label>
              <Select value={cause} onValueChange={value => setCause(value as CattleDeathCause | typeof NO_CAUSE)}>
                <SelectTrigger id="remove-cause" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CAUSE} className="min-h-11">Not recorded</SelectItem>
                  {(Object.keys(CATTLE_DEATH_CAUSE_LABELS) as CattleDeathCause[]).map(item => (
                    <SelectItem key={item} value={item} className="min-h-11">{CATTLE_DEATH_CAUSE_LABELS[item]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {mode === 'transfer' && <HerdDestination idPrefix="remove-dest" dest={dest} onChange={setDest} others={others} />}
          <div className="space-y-1.5">
            <Label htmlFor="remove-notes">{mode === 'sell' ? 'Buyer or hauler (optional)' : 'Notes (optional)'}</Label>
            <Textarea id="remove-notes" value={notes} onChange={event => setNotes(event.target.value)} rows={2} />
          </div>
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="h-11" disabled={saving}>{copy.button}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
