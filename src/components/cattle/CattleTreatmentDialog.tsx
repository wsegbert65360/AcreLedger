import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ENTITLEMENT_COPY } from '@/copy/entitlements';
import { COUNT_CLASSES, COUNT_TITLES, countsSummary, groupCounts } from '@/lib/cattle/counts';
import {
  DOSE_BASES, DOSE_BASIS_LABELS, DOSE_UNITS, MAX_WITHDRAWAL_DAYS, ROUTE_LABELS, TREATMENT_KINDS,
  TREATMENT_KIND_LABELS, TREATMENT_ROUTES, productMemory, treatmentWithdrawalUntil,
} from '@/lib/cattle/health';
import { isFutureDate, parseHeadCount } from '@/lib/cattle/ui';
import { localTodayIso } from '@/lib/equipment';
import { formatIsoDate } from '@/utils/dates';
import { useFarm } from '@/store/farmStore';
import type { CattleGroup, CountClass, DoseBasis, DoseUnit, TreatmentKind, TreatmentRoute } from '@/types/cattle';

const WHOLE_HERD = 'all';

/** A positive number with at most two decimals, or null. */
function parseDose(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value > 0 && value <= 999999 ? value : null;
}

/**
 * Record a vaccine or treatment given to a herd (or one class in it). The product's
 * dose, route and withdrawal days are remembered, so a repeat is a few taps.
 */
export default function CattleTreatmentDialog({ group, onClose }: { group: CattleGroup; onClose: () => void }) {
  const { cattleTreatments, logCattleTreatment } = useFarm();
  const today = localTodayIso();
  const counts = groupCounts(group);
  const memory = useMemo(() => productMemory(cattleTreatments.filter(item => item.groupId === group.id).concat(
    cattleTreatments.filter(item => item.groupId !== group.id),
  )), [cattleTreatments, group.id]);

  const [product, setProduct] = useState('');
  const [kind, setKind] = useState<TreatmentKind>('vaccine');
  const [date, setDate] = useState(today);
  const [which, setWhich] = useState<CountClass | typeof WHOLE_HERD>(WHOLE_HERD);
  const [head, setHead] = useState(String(group.headCount));
  const [dose, setDose] = useState('');
  const [doseUnit, setDoseUnit] = useState<DoseUnit>('mL');
  const [doseBasis, setDoseBasis] = useState<DoseBasis>('per_head');
  const [route, setRoute] = useState<TreatmentRoute>('SQ');
  const [withdrawal, setWithdrawal] = useState('0');
  const [lot, setLot] = useState('');
  const [givenBy, setGivenBy] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const available = which === WHOLE_HERD ? group.headCount : counts[which];
  const withdrawalDays = /^\d+$/.test(withdrawal.trim()) ? Number(withdrawal.trim()) : null;
  const holdUntil = withdrawalDays !== null && withdrawalDays > 0 && date
    ? treatmentWithdrawalUntil(date, withdrawalDays)
    : null;

  const applyMemory = (name: string) => {
    const found = memory.find(item => item.product.trim().toLowerCase() === name.trim().toLowerCase());
    if (!found) return;
    setKind(found.kind);
    setDose(String(found.dose));
    setDoseUnit(found.doseUnit);
    setDoseBasis(found.doseBasis);
    setRoute(found.route);
    setWithdrawal(String(found.withdrawalDays));
    if (found.lotNumber) setLot(found.lotNumber);
  };

  const pickWhich = (value: string) => {
    const next = value as CountClass | typeof WHOLE_HERD;
    setWhich(next);
    setHead(String(next === WHOLE_HERD ? group.headCount : counts[next]));
  };

  const fail = (message: string) => { setError(message); return false; };

  const save = async (addAnother: boolean) => {
    if (saving) return;
    const name = product.trim();
    if (!name) return void fail('Enter the product name.');
    if (name.length > 120) return void fail('The product name is too long.');
    if (!date) return void fail('Pick the date it was given.');
    if (isFutureDate(date, localTodayIso())) return void fail('The date cannot be in the future.');
    const headTreated = parseHeadCount(head);
    if (headTreated === null || headTreated < 1) return void fail('Head treated must be a whole number, at least 1.');
    if (headTreated > available) {
      return void fail(`${group.name} only has ${available} ${which === WHOLE_HERD ? 'head' : COUNT_TITLES[which].toLowerCase()}.`);
    }
    const doseValue = parseDose(dose);
    if (doseValue === null) return void fail('Enter the dose, like 2 or 2.5.');
    if (withdrawalDays === null || withdrawalDays > MAX_WITHDRAWAL_DAYS) {
      return void fail(`Withdrawal days must be a whole number from 0 to ${MAX_WITHDRAWAL_DAYS}.`);
    }

    setError(null);
    setSaving(true);
    let premiumRequired = false;
    try {
      const ok = await logCattleTreatment({
        groupId: group.id, treatedOn: date, product: name, kind,
        cattleClass: which === WHOLE_HERD ? undefined : which,
        headTreated, dose: doseValue, doseUnit, doseBasis, route, withdrawalDays,
        lotNumber: lot.trim() || undefined, givenBy: givenBy.trim() || undefined, notes: notes.trim() || undefined,
      }, { onPremiumRequired: () => { premiumRequired = true; } });
      if (!ok) {
        toast.error(premiumRequired ? ENTITLEMENT_COPY.cattleEventsLockedTitle : 'Could not save the treatment.');
        return;
      }
      if (addAnother) {
        // Same herd, date and head; clear what changes from one product to the next.
        setSavedCount(count => count + 1);
        setProduct(''); setDose(''); setLot(''); setNotes(''); setWithdrawal('0');
        toast.success(`${name} saved. Add the next one.`);
      } else {
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: FormEvent) => { event.preventDefault(); void save(false); };

  return (
    <Dialog open onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Treat or vaccinate</DialogTitle>
          <DialogDescription>
            {group.name} · {countsSummary(counts)}
            {savedCount > 0 ? ` · ${savedCount} saved this visit` : ''}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="treat-product">Product</Label>
            <Input
              id="treat-product" list="treat-products" value={product} className="h-11" maxLength={120}
              autoComplete="off" placeholder="Vaccine or drug name"
              onChange={event => { setProduct(event.target.value); applyMemory(event.target.value); }}
            />
            <datalist id="treat-products">
              {memory.map(item => <option key={item.product} value={item.product} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="treat-kind">Type</Label>
              <Select value={kind} onValueChange={value => setKind(value as TreatmentKind)}>
                <SelectTrigger id="treat-kind" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TREATMENT_KINDS.map(item => <SelectItem key={item} value={item} className="min-h-11">{TREATMENT_KIND_LABELS[item]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="treat-date">Date</Label>
              <Input id="treat-date" type="date" value={date} max={today} onChange={event => setDate(event.target.value)} className="h-11" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="treat-which">Which cattle</Label>
              <Select value={which} onValueChange={pickWhich}>
                <SelectTrigger id="treat-which" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={WHOLE_HERD} className="min-h-11">Whole herd ({group.headCount})</SelectItem>
                  {COUNT_CLASSES.filter(item => counts[item] > 0).map(item => (
                    <SelectItem key={item} value={item} className="min-h-11">{COUNT_TITLES[item]} ({counts[item]})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="treat-head">Head treated</Label>
              <Input id="treat-head" value={head} onChange={event => setHead(event.target.value)} className="h-11" inputMode="numeric" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="treat-dose">Dose</Label>
              <Input id="treat-dose" value={dose} onChange={event => setDose(event.target.value)} className="h-11" inputMode="decimal" placeholder="2" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="treat-unit">Unit</Label>
              <Select value={doseUnit} onValueChange={value => setDoseUnit(value as DoseUnit)}>
                <SelectTrigger id="treat-unit" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOSE_UNITS.map(item => <SelectItem key={item} value={item} className="min-h-11">{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="treat-basis">Per</Label>
              <Select value={doseBasis} onValueChange={value => setDoseBasis(value as DoseBasis)}>
                <SelectTrigger id="treat-basis" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOSE_BASES.map(item => <SelectItem key={item} value={item} className="min-h-11">{DOSE_BASIS_LABELS[item]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="treat-route">How given</Label>
              <Select value={route} onValueChange={value => setRoute(value as TreatmentRoute)}>
                <SelectTrigger id="treat-route" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TREATMENT_ROUTES.map(item => <SelectItem key={item} value={item} className="min-h-11">{ROUTE_LABELS[item]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="treat-withdrawal">Withdrawal days</Label>
              <Input id="treat-withdrawal" value={withdrawal} onChange={event => setWithdrawal(event.target.value)} className="h-11" inputMode="numeric" />
            </div>
          </div>
          {holdUntil && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium" data-testid="treat-hold-until">
              Do not ship before {formatIsoDate(holdUntil)}.
            </p>
          )}
          <p className="text-xs text-muted-foreground">Take withdrawal days from the product label. They are remembered for next time.</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="treat-lot">Lot number (optional)</Label>
              <Input id="treat-lot" value={lot} onChange={event => setLot(event.target.value)} className="h-11" maxLength={60} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="treat-by">Given by (optional)</Label>
              <Input id="treat-by" value={givenBy} onChange={event => setGivenBy(event.target.value)} className="h-11" maxLength={80} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="treat-notes">Notes (optional)</Label>
            <Textarea id="treat-notes" value={notes} onChange={event => setNotes(event.target.value)} rows={2} />
          </div>
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:flex-wrap">
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>{savedCount > 0 ? 'Done' : 'Cancel'}</Button>
            <Button type="button" variant="outline" className="h-11" disabled={saving} onClick={() => void save(true)}>Save and add another</Button>
            <Button type="submit" className="h-11" disabled={saving}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
