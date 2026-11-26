import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ENTITLEMENT_COPY } from '@/copy/entitlements';
import { COUNT_CLASSES, COUNT_LABELS, COUNT_TITLES, countsSummary, groupCounts, herdTypeClass } from '@/lib/cattle/counts';
import {
  CALF_SEX_LABELS, CATTLE_EVENT_HEAD_RULE, CATTLE_EVENT_LABELS, CATTLE_EVENT_TYPES, CATTLE_REMOVAL_LABELS,
  isFutureDate, parseHeadCount,
} from '@/lib/cattle/ui';
import { withdrawalConflicts } from '@/lib/cattle/health';
import { localTodayIso } from '@/lib/equipment';
import { formatIsoDate } from '@/utils/dates';
import { useFarm } from '@/store/farmStore';
import type { CalfSex, CattleEventType, CattleGroup, CattleRemovalReason, CountClass } from '@/types/cattle';

const HEAD_LABEL: Partial<Record<CattleEventType, string>> = {
  calving: 'Calves born',
  head_added: 'Head added',
  death: 'Head lost',
  head_removed: 'Head removed',
};

const MIXED_SEX = 'mixed';

/** Log one event for a herd. Moving head to another herd is one queued transfer, not two writes. */
export default function CattleEventDialog({ group, onClose }: { group: CattleGroup; onClose: () => void }) {
  const { cattleGroups, cattleTreatments, logCattleEvent, transferCattleHead } = useFarm();
  const today = localTodayIso();
  const counts = groupCounts(group);
  const ownClass = herdTypeClass(group.class);
  const firstWithHead = COUNT_CLASSES.find(item => counts[item] > 0) ?? ownClass;
  const [type, setType] = useState<CattleEventType>('calving');
  const [date, setDate] = useState(today);
  const [head, setHead] = useState('');
  const [cattleClass, setCattleClass] = useState<CountClass>(counts[ownClass] > 0 ? ownClass : firstWithHead);
  const [toClass, setToClass] = useState<CountClass>('heifers');
  const [calfSex, setCalfSex] = useState<CalfSex | typeof MIXED_SEX>(MIXED_SEX);
  const [reason, setReason] = useState<CattleRemovalReason | ''>('');
  const [toGroupId, setToGroupId] = useState('');
  const [weanHead, setWeanHead] = useState('');
  const females = counts.cows + counts.heifers;
  const [bred, setBred] = useState('');
  const [open, setOpen] = useState('');
  const [exposed, setExposed] = useState(females > 0 ? String(females) : '');
  const [headWeaned, setHeadWeaned] = useState('');
  const [avgWeight, setAvgWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const others = useMemo(
    () => cattleGroups.filter(item => !item.deleted_at && item.id !== group.id).sort((a, b) => a.name.localeCompare(b.name)),
    [cattleGroups, group.id],
  );
  const rule = CATTLE_EVENT_HEAD_RULE[type];
  const isTransfer = type === 'head_removed' && reason === 'moved_to_another_group';
  const isReclass = type === 'reclass';
  const picksClass = type === 'head_added' || type === 'death' || type === 'head_removed' || isReclass;
  const classWord = (item: CountClass, n: number) => (n === 1 ? COUNT_LABELS[item].one : COUNT_LABELS[item].many);

  const fail = (message: string) => { setError(message); return undefined; };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!date) return fail('Pick the date of the event.');
    if (isFutureDate(date, localTodayIso())) return fail('The event date cannot be in the future.');
    const cleanNotes = notes.trim() || undefined;

    let count = 0;
    if (rule !== 'none' || isReclass) {
      const parsed = parseHeadCount(head);
      if (parsed === null || parsed < 1) return fail('Head must be a whole number, at least 1.');
      count = parsed;
      if ((rule === 'negative' || isReclass) && count > counts[cattleClass]) {
        return fail(`${group.name} only has ${counts[cattleClass]} ${classWord(cattleClass, counts[cattleClass])}.`);
      }
    }
    if (isReclass && toClass === cattleClass) return fail('Pick a different class to change them to.');
    if (type === 'head_removed' && !reason) return fail('Say why the head were removed.');
    if (isTransfer && !toGroupId) return fail('Pick the herd the head are moving to.');

    let weanCount = 0;
    if (type === 'weaning' && weanHead.trim()) {
      const parsed = parseHeadCount(weanHead);
      if (parsed === null || parsed < 1) return fail('Calves to move must be a whole number, at least 1.');
      if (parsed > counts.calves) return fail(`${group.name} only has ${counts.calves} ${classWord('calves', counts.calves)}.`);
      if (!toGroupId) return fail('Pick the herd the weaned calves are moving to.');
      weanCount = parsed;
    }

    // Preg check: results are optional, but blanks count as zero once either is filled in.
    let pregResult: { bred: number; open: number; notChecked: number } | undefined;
    if (type === 'preg_check' && (bred.trim() || open.trim())) {
      const bredCount = bred.trim() ? parseHeadCount(bred) : 0;
      const openCount = open.trim() ? parseHeadCount(open) : 0;
      if (bredCount === null || openCount === null) return fail('Bred and open must be whole numbers.');
      if (bredCount + openCount < 1) return fail('Enter how many were bred or open.');
      if (females > 0 && bredCount + openCount > females) {
        return fail(`${group.name} only has ${females} cows and heifers.`);
      }
      pregResult = { bred: bredCount, open: openCount, notChecked: Math.max(0, females - bredCount - openCount) };
    }

    let exposedCount: number | undefined;
    if (type === 'bull_in') {
      const parsed = parseHeadCount(exposed);
      if (parsed === null || parsed < 1) return fail('Enter how many cows and heifers are with the bulls.');
      exposedCount = parsed;
    }

    let weanedCount: number | undefined;
    let weanedWeight: number | undefined;
    if (type === 'weaning') {
      if (headWeaned.trim()) {
        const parsed = parseHeadCount(headWeaned);
        if (parsed === null || parsed < 1) return fail('Calves weaned must be a whole number, at least 1.');
        weanedCount = parsed;
      }
      if (avgWeight.trim()) {
        if (!weanedCount) return fail('Enter how many calves were weaned to record a weight.');
        const weight = Number(avgWeight.trim());
        if (!/^\d+(\.\d)?$/.test(avgWeight.trim()) || !(weight > 0) || weight > 9999) {
          return fail('Average weight must be a number, like 540 or 540.5.');
        }
        weanedWeight = weight;
      }
    }

    // Shipping cattle that are still in a withdrawal period needs a second look.
    if (type === 'head_removed' && reason === 'shipped') {
      const held = withdrawalConflicts(cattleTreatments, group.id, date, cattleClass);
      if (held.length > 0) {
        const worst = held[0];
        const proceed = window.confirm(
          `${worst.product} is still in withdrawal until ${formatIsoDate(worst.withdrawalUntil)}. Ship these head anyway?`,
        );
        if (!proceed) return undefined;
      }
    }

    setError(null);
    setSaving(true);
    // Set when the server refuses the save for plan reasons, so the message says so.
    let premiumRequired = false;
    const saveOptions = { onPremiumRequired: () => { premiumRequired = true; } };
    try {
      if (isTransfer) {
        const ok = await transferCattleHead({
          fromGroupId: group.id, toGroupId, head: count, eventDate: date, notes: cleanNotes, cattleClass,
        }, saveOptions);
        if (!ok) return void toast.error(premiumRequired ? ENTITLEMENT_COPY.cattleEventsLockedTitle : 'Could not save the move.');
      } else {
        const ok = await logCattleEvent({
          groupId: group.id, eventType: type, eventDate: date,
          headDelta: rule === 'positive' ? count : rule === 'negative' ? -count : 0,
          reason: type === 'head_removed' && reason ? reason : undefined,
          cattleClass: picksClass ? cattleClass : undefined,
          toClass: isReclass ? toClass : undefined,
          classHead: isReclass ? count : undefined,
          calfSex: type === 'calving' && calfSex !== MIXED_SEX ? calfSex : undefined,
          bredCount: pregResult?.bred, openCount: pregResult?.open, notCheckedCount: pregResult?.notChecked,
          exposedCount,
          headWeaned: weanedCount, avgWeight: weanedWeight,
          notes: cleanNotes,
        }, saveOptions);
        if (!ok) return void toast.error(premiumRequired ? ENTITLEMENT_COPY.cattleEventsLockedTitle : 'Could not save the event.');
        if (weanCount > 0) {
          const moved = await transferCattleHead({
            fromGroupId: group.id, toGroupId, head: weanCount, eventDate: date, notes: cleanNotes ?? 'Weaning', cattleClass: 'calves',
          }, saveOptions);
          if (!moved) {
            toast.error('Weaning was saved, but moving the calves did not save. Try the move again.');
            return onClose();
          }
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const classPicker = (id: string, label: string, value: CountClass, onChange: (value: CountClass) => void, showCounts: boolean) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={next => onChange(next as CountClass)}>
        <SelectTrigger id={id} className="h-11"><SelectValue /></SelectTrigger>
        <SelectContent>
          {COUNT_CLASSES.map(item => (
            <SelectItem key={item} value={item} className="min-h-11">
              {COUNT_TITLES[item]}{showCounts ? ` (${counts[item]})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const destinationPicker = (
    <div className="space-y-1.5">
      <Label htmlFor="event-to-group">Move to herd</Label>
      <Select value={toGroupId} onValueChange={setToGroupId}>
        <SelectTrigger id="event-to-group" className="h-11"><SelectValue placeholder="Choose a herd" /></SelectTrigger>
        <SelectContent>
          {others.map(item => <SelectItem key={item.id} value={item.id} className="min-h-11">{item.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {others.length === 0 && <p className="text-xs text-muted-foreground">Add another herd first.</p>}
    </div>
  );

  return (
    <Dialog open onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log an event</DialogTitle>
          <DialogDescription>{group.name} · {countsSummary(counts)}</DialogDescription>
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
          {picksClass && classPicker('event-class', isReclass ? 'From' : 'Which cattle', cattleClass, setCattleClass, rule === 'negative' || isReclass)}
          {isReclass && classPicker('event-to-class', 'Change them to', toClass, setToClass, false)}
          {(rule !== 'none' || isReclass) && (
            <div className="space-y-1.5">
              <Label htmlFor="event-head">{isReclass ? 'How many head' : HEAD_LABEL[type]}</Label>
              <Input id="event-head" value={head} onChange={event => setHead(event.target.value)} className="h-11" inputMode="numeric" placeholder="0" />
            </div>
          )}
          {isReclass && <p className="text-xs text-muted-foreground">For example, calves kept back as replacement heifers, or a heifer that calved becoming a cow.</p>}
          {type === 'calving' && (
            <div className="space-y-1.5">
              <Label htmlFor="event-calf-sex">Calves (optional)</Label>
              <Select value={calfSex} onValueChange={value => setCalfSex(value as CalfSex | typeof MIXED_SEX)}>
                <SelectTrigger id="event-calf-sex" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={MIXED_SEX} className="min-h-11">Mixed or not recorded</SelectItem>
                  {(Object.keys(CALF_SEX_LABELS) as CalfSex[]).map(item => (
                    <SelectItem key={item} value={item} className="min-h-11">{CALF_SEX_LABELS[item]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          {type === 'preg_check' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="event-bred">Bred</Label>
                  <Input id="event-bred" value={bred} onChange={event => setBred(event.target.value)} className="h-11" inputMode="numeric" placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="event-open">Open</Label>
                  <Input id="event-open" value={open} onChange={event => setOpen(event.target.value)} className="h-11" inputMode="numeric" placeholder="0" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground" data-testid="preg-not-checked">
                {females > 0
                  ? `${Math.max(0, females - (Number(bred) || 0) - (Number(open) || 0))} of ${females} cows and heifers not checked. `
                  : ''}
                Leave both blank to just record that a preg check was done.
              </p>
            </>
          )}
          {type === 'bull_in' && (
            <div className="space-y-1.5">
              <Label htmlFor="event-exposed">Cows and heifers with the bulls</Label>
              <Input id="event-exposed" value={exposed} onChange={event => setExposed(event.target.value)} className="h-11" inputMode="numeric" placeholder="0" />
              <p className="text-xs text-muted-foreground">Calving and weaning percentages divide by this number.</p>
            </div>
          )}
          {type === 'weaning' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="event-head-weaned">Calves weaned (optional)</Label>
                  <Input id="event-head-weaned" value={headWeaned} onChange={event => setHeadWeaned(event.target.value)} className="h-11" inputMode="numeric" placeholder={counts.calves > 0 ? String(counts.calves) : '0'} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="event-avg-weight">Average weight, lb (optional)</Label>
                  <Input id="event-avg-weight" value={avgWeight} onChange={event => setAvgWeight(event.target.value)} className="h-11" inputMode="decimal" placeholder="540" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="event-wean-head">Move weaned calves to another herd (optional)</Label>
                <Input id="event-wean-head" value={weanHead} onChange={event => setWeanHead(event.target.value)} className="h-11" inputMode="numeric" placeholder="How many calves" />
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
