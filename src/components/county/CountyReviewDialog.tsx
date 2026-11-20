import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { validateManualSplit } from '@/lib/county/allocation';
import type { CountySubject } from '@/lib/county/plan';
import type { CountyAssignment, CountyBoundary } from '@/lib/county/types';
import { roundTo } from '@/utils/numbers';

type CountyPick = Pick<CountyBoundary, 'fips' | 'name' | 'stateAbbr' | 'datasetSource' | 'datasetVersion'>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: CountySubject;
  rows: CountyAssignment[];
  /** Counties this farm already has, offered as quick picks. */
  knownCounties: CountyPick[];
  onSave: (split: { county: CountyPick; acres: number }[]) => Promise<{ ok: boolean; errors: string[] }>;
}

interface Line { fips: string; name: string; state: string; acres: string }

/** Manual county split. It must add up to the recorded acreage, and it survives recalculation. */
export default function CountyReviewDialog({ open, onOpenChange, subject, rows, knownCounties, onSave }: Props) {
  const initial = useMemo<Line[]>(() => {
    const withCounty = rows.filter(r => r.countyFips);
    return withCounty.map(r => ({
      fips: r.countyFips as string,
      name: r.countyName ?? '',
      state: r.stateAbbr ?? '',
      acres: String(roundTo(r.manualAcres ?? (r.proportion != null ? r.proportion * subject.recordedAcres : r.mappedAcres ?? 0), 2)),
    }));
  }, [rows, subject.recordedAcres]);
  const [lines, setLines] = useState<Line[]>(initial);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const parsed = lines.map(l => ({ countyFips: l.fips.trim(), acres: Number(l.acres) }));
  const check = validateManualSplit(parsed, subject.recordedAcres);
  const dataset = rows.find(r => r.datasetVersion) ?? null;

  const update = (index: number, patch: Partial<Line>) =>
    setLines(prev => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const submit = async () => {
    setSaving(true);
    try {
      const split = lines.map(l => {
        const known = knownCounties.find(c => c.fips === l.fips.trim());
        return {
          county: known ?? {
            fips: l.fips.trim(), name: l.name.trim(), stateAbbr: l.state.trim().toUpperCase(),
            datasetSource: dataset?.datasetSource ?? 'Manual entry', datasetVersion: dataset?.datasetVersion ?? 'manual',
          },
          acres: Number(l.acres),
        };
      });
      const result = await onSave(split);
      if (result.ok) onOpenChange(false);
      else setServerErrors(result.errors);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Correct counties</DialogTitle>
          <DialogDescription>
            {subject.label}: {roundTo(subject.recordedAcres, 2)} ac recorded. The county acres must add up to it. Your correction is kept when counties are recalculated.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-[1fr_5rem_auto] items-end gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor={`county-fips-${index}`}>County FIPS</label>
                <Input id={`county-fips-${index}`} inputMode="numeric" maxLength={5} value={line.fips}
                  onChange={e => {
                    const fips = e.target.value;
                    const known = knownCounties.find(c => c.fips === fips.trim());
                    update(index, { fips, ...(known ? { name: known.name, state: known.stateAbbr } : {}) });
                  }} />
                {line.name && <p className="text-xs text-muted-foreground">{line.name}{line.state ? `, ${line.state}` : ''}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor={`county-acres-${index}`}>Acres</label>
                <Input id={`county-acres-${index}`} inputMode="decimal" value={line.acres} onChange={e => update(index, { acres: e.target.value })} />
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove county"
                onClick={() => setLines(prev => prev.filter((_, i) => i !== index))}><Trash2 size={16} /></Button>
            </div>
          ))}
          {lines.some(l => l.fips.trim().length === 5 && !l.name) && (
            <div className="space-y-2">
              {lines.map((line, index) => line.fips.trim().length === 5 && !line.name ? (
                <div key={index} className="grid grid-cols-[1fr_4rem] gap-2">
                  <Input aria-label={`County name for ${line.fips}`} placeholder="County name" value={line.name} onChange={e => update(index, { name: e.target.value })} />
                  <Input aria-label={`State for ${line.fips}`} placeholder="ST" maxLength={2} value={line.state} onChange={e => update(index, { state: e.target.value })} />
                </div>
              ) : null)}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {knownCounties.filter(c => !lines.some(l => l.fips === c.fips)).map(c => (
              <Button key={c.fips} type="button" variant="outline" size="sm"
                onClick={() => setLines(prev => [...prev, { fips: c.fips, name: c.name, state: c.stateAbbr, acres: '' }])}>
                + {c.name}, {c.stateAbbr}
              </Button>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines(prev => [...prev, { fips: '', name: '', state: '', acres: '' }])}>
              + Other county
            </Button>
          </div>
          <p className="font-mono text-sm" data-testid="county-split-total">
            Total {check.totalAcres} of {roundTo(subject.recordedAcres, 2)} ac
          </p>
          {[...check.errors, ...serverErrors].length > 0 && (
            <ul className="space-y-1 text-xs text-red-600 dark:text-red-400" role="alert">
              {[...new Set([...check.errors, ...serverErrors])].map(error => <li key={error}>{error}</li>)}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" disabled={!check.valid || saving} onClick={submit}>Save correction</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
