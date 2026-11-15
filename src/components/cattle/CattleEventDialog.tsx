import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ENTITLEMENT_COPY } from '@/copy/entitlements';
import {
  CATTLE_EVENT_HEAD_RULE, CATTLE_EVENT_LABELS, CATTLE_EVENT_TYPES, CATTLE_REMOVAL_LABELS, isFutureDate, parseHeadCount,
} from '@/lib/cattle/ui';
import { localTodayIso } from '@/lib/equipment';
import { useFarm } from '@/store/farmStore';
import type { CattleEventType, CattleGroup, CattleRemovalReason } from '@/types/cattle';

const HEAD_LABEL: Partial<Record<CattleEventType, string>> = {
  calving: 'Calves born',
  head_added: 'Head added',
  death: 'Head lost',
  head_removed: 'Head removed',
};

/** Log one event for a group. Moving head to another group is one queued transfer, not two writes. */
export default function CattleEventDialog({ group, onClose }: { group: CattleGroup; onClose: () => void }) {
  const { cattleGroups, logCattleEvent, transferCattleHead } = useFarm();
  const today = localTodayIso();
  const [type, setType] = useState<CattleEventType>('calving');
  const [date, setDate] = useState(today);
  const [head, setHead] = useState('');
  const [reason, setReason] = useState<CattleRemovalReason | ''>('');
  const [toGroupId, setToGroupId] = useState('');
  const [weanHead, setWeanHead] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const others = useMemo(
    () => cattleGroups.filter(item => !item.deleted_at && item.id !== group.id).sort((a, b) => a.name.localeCompare(b.name)),
    [cattleGroups, group.id],
  );
  const rule = CATTLE_EVENT_HEAD_RULE[type];
  const isTransfer = type === 'head_removed' && reason === 'moved_to_another_group';

  const fail = (message: string) => { setError(message); return undefined; };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!date) return fail('Pick the date of the event.');
    if (isFutureDate(date, localTodayIso())) return fail('The event date cannot be in the future.');
    const cleanNotes = notes.trim() || undefined;

    let count = 0;
    if (rule !== 'none') {
      const parsed = parseHeadCount(head);
      if (parsed === null || parsed < 1) return fail('Head must be a whole number, at least 1.');
      count = parsed;
      if (rule === 'negative' && count > group.headCount) {
        return fail(`${group.name} only has ${group.headCount} head.`);
      }
    }
    if (type === 'head_removed' && !reason) return fail('Say why the head were removed.');
    if (isTransfer && !toGroupId) return fail('Pick the group the head are moving to.');

    let weanCount = 0;
    if (type === 'weaning' && weanHead.trim()) {
      const parsed = parseHeadCount(weanHead);
      if (parsed === null || parsed < 1) return fail('Head to move must be a whole number, at least 1.');
      if (parsed > group.headCount) return fail(`${group.name} only has ${group.headCount} head.`);
      if (!toGroupId) return fail('Pick the group the weaned head are moving to.');
      weanCount = parsed;
    }

    setError(null);
    setSaving(true);
    // Set when the server refuses the save for plan reasons, so the message says so.
    let premiumRequired = false;
    const saveOptions = { onPremiumRequired: () => { premiumRequired = true; } };
    try {
      if (isTransfer) {
        const ok = await transferCattleHead({ fromGroupId: group.id, toGroupId, head: count, eventDate: date, notes: cleanNotes }, saveOptions);
        if (!ok) return void toast.error(premiumRequired ? ENTITLEMENT_COPY.cattleEventsLockedTitle : 'Could not save the move.');
      } else {
        const ok = await logCattleEvent({
          groupId: group.id, eventType: type, eventDate: date,
          headDelta: rule === 'positive' ? count : rule === 'negative' ? -count : 0,
          reason: type === 'head_removed' && reason ? reason : undefined,
          notes: cleanNotes,
        }, saveOptions);
        if (!ok) return void toast.error(premiumRequired ? ENTITLEMENT_COPY.cattleEventsLockedTitle : 'Could not save the event.');
        if (weanCount > 0) {
          const moved = await transferCattleHead({
            fromGroupId: group.id, toGroupId, head: weanCount, eventDate: date, notes: cleanNotes ?? 'Weaning',
          }, saveOptions);
          if (!moved) {
            toast.error('Weaning was saved, but moving the head did not save. Try the move again.');
            return onClose();
          }
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const destinationPicker = (
    <div className="space-y-1.5">
      <Label htmlFor="event-to-group">Move to group</Label>
      <Select value={toGroupId} onValueChange={setToGroupId}>
        <SelectTrigger id="event-to-group" className="h-11"><SelectValue placeholder="Choose a group" /></SelectTrigger>
        <SelectContent>
          {others.map(item => <SelectItem key={item.id} value={item.id} className="min-h-11">{item.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {others.length === 0 && <p className="text-xs text-muted-foreground">Add another group first.</p>}
    </div>
  );

  return (
    <Dialog open onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log an event</DialogTitle>
          <DialogDescription>{group.name} · {group.headCount} head</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="event-type">What happened</Label>
            <Select value={type} onValueChange={value => { setType(value as CattleEventType); setReason(''); setError(null); }}>
              <SelectTrigger id="event-type" className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATTLE_EVENT_TYPES.map(item => <SelectItem key={item} value={item} className="min-h-11">{CATTLE_EVENT_LABELS[item]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="event-date">Date</Label>
            <Input id="event-date" type="date" value={date} max={today} onChange={event => setDate(event.target.value)} className="h-11" />
          </div>
          {rule !== 'none' && (
            <div className="space-y-1.5">
              <Label htmlFor="event-head">{HEAD_LABEL[type]}</Label>
              <Input id="event-head" value={head} onChange={event => setHead(event.target.value)} className="h-11" inputMode="numeric" placeholder="0" />
            </div>
          )}
          {type === 'head_removed' && (
            <div className="space-y-1.5">
              <Label htmlFor="event-reason">Why</Label>
              <Select value={reason} onValueChange={value => setReason(value as CattleRemovalReason)}>
                <SelectTrigger id="event-reason" className="h-11"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATTLE_REMOVAL_LABELS) as CattleRemovalReason[]).map(item => (
                    <SelectItem key={item} value={item} className="min-h-11">{CATTLE_REMOVAL_LABELS[item]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {isTransfer && destinationPicker}
          {type === 'weaning' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="event-wean-head">Move weaned head to another group (optional)</Label>
                <Input id="event-wean-head" value={weanHead} onChange={event => setWeanHead(event.target.value)} className="h-11" inputMode="numeric" placeholder="How many head" />
              </div>
              {weanHead.trim() !== '' && destinationPicker}
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="event-notes">Notes (optional)</Label>
            <Textarea id="event-notes" value={notes} onChange={event => setNotes(event.target.value)} rows={2} />
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
