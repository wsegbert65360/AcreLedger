import { useMemo, useState } from 'react';
import { MapPinned } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { activeRows, deriveCountyStatus } from '@/lib/county/allocation';
import { compareCountyToNotes, parseNotesCountyHints, tractCountySubjects, type SubjectAction } from '@/lib/county/plan';
import { subjectIndexKey } from '@/lib/county/resolve';
import { roundTo } from '@/utils/numbers';
import { useFarm } from '@/store/farmStore';
import type { CountyPlanResult } from '@/store/useCountyAssignments';
import CountyPanel from './CountyPanel';

const ACTION_LABELS: Record<SubjectAction, string> = {
  create: 'New', update: 'Updated', unchanged: 'Unchanged', 'preserve-manual': 'Manual kept',
  'flag-review': 'Flagged for review', unresolved: 'Unresolved', deferred: 'Waiting for boundaries', remove: 'Retired',
};

/**
 * Backfill: shows exactly what identifying counties will change, then applies it on request.
 * The preview and the apply use the same plan, so nothing happens that was not shown.
 */
export default function CountyIdentificationCard() {
  const { fields, fsaTracts, countyAssignments, previewCounties, applyCountyPlan } = useFarm();
  const [preview, setPreview] = useState<CountyPlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTracts, setShowTracts] = useState(false);
  const hasRows = countyAssignments.some(r => !r.deletedAt);

  const run = async (mode: 'sync' | 'recalculate') => {
    setLoading(true);
    try { setPreview(await previewCounties(mode)); } finally { setLoading(false); }
  };

  const plan = preview?.plan ?? null;
  const changed = useMemo(() => plan?.plans.filter(p => p.upserts.length > 0 || p.softDeletes.length > 0) ?? [], [plan]);
  const fieldNotes = useMemo(() => new Map(fields.map(f => [f.id, f.notes])), [fields]);

  const notesDifferences = useMemo(() => {
    if (!plan) return [] as { label: string; differences: string[] }[];
    const known = countyAssignments.map(r => r.countyName ?? '').filter(Boolean);
    return plan.plans.flatMap(p => {
      if (p.subject.type !== 'field' || !p.subject.fieldId) return [];
      const hints = parseNotesCountyHints(fieldNotes.get(p.subject.fieldId));
      if (hints.length === 0) return [];
      const rows = p.upserts.length > 0 ? p.upserts : activeRows(countyAssignments.filter(r => subjectIndexKey(r.subjectType, r.subjectKey) === subjectIndexKey(p.subject.type, p.subject.key)));
      const measured = rows.filter(r => r.countyFips).map(r => ({
        countyName: r.countyName, acres: r.manualAcres ?? r.mappedAcres ?? (r.proportion != null ? r.proportion * p.subject.recordedAcres : 0),
      }));
      const differences = compareCountyToNotes(hints, measured, known).differences;
      return differences.length > 0 ? [{ label: p.subject.label, differences }] : [];
    });
  }, [plan, countyAssignments, fieldNotes]);

  const apply = async () => {
    if (!plan) return;
    setLoading(true);
    try {
      const ok = await applyCountyPlan(plan);
      if (ok) {
        toast.success('Counties saved');
        setPreview(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const flagged = useMemo(() => {
    const keys = new Set(countyAssignments.filter(r => !r.deletedAt).map(r => subjectIndexKey(r.subjectType, r.subjectKey)));
    let count = 0;
    for (const key of keys) {
      const rows = activeRows(countyAssignments.filter(r => subjectIndexKey(r.subjectType, r.subjectKey) === key));
      if (deriveCountyStatus(rows, null).status === 'needs_review') count += 1;
    }
    return count;
  }, [countyAssignments]);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-foreground text-lg"><MapPinned size={18} /> Counties</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Counties come from where each field and CLU boundary physically lies, not from the FSA office. {hasRows
            ? `${countyAssignments.filter(r => !r.deletedAt).length} saved county rows${flagged ? `, ${flagged} need review` : ''}.`
            : 'No counties have been identified for this farm yet.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={loading} onClick={() => run('sync')}>
            Preview {hasRows ? 'new and changed' : 'county identification'}
          </Button>
          {hasRows && (
            <Button variant="ghost" disabled={loading} onClick={() => run('recalculate')}>Preview full recalculation</Button>
          )}
          {fsaTracts.length > 0 && (
            <Button variant="ghost" onClick={() => setShowTracts(v => !v)}>{showTracts ? 'Hide' : 'Show'} tract counties</Button>
          )}
        </div>

        {preview?.unavailableReason && (
          <p className="text-sm text-amber-700 dark:text-amber-400" role="status">{preview.unavailableReason}</p>
        )}

        {plan && (
          <div className="space-y-2 rounded-lg border border-border p-3" data-testid="county-preview">
            <p className="text-sm font-semibold">Preview: {plan.upserts.length} to save, {plan.softDeletes.length} to retire. Nothing has changed yet.</p>
            <ul className="text-xs text-muted-foreground">
              {(Object.keys(plan.counts) as SubjectAction[]).filter(k => plan.counts[k] > 0).map(k => (
                <li key={k}>{ACTION_LABELS[k]}: {plan.counts[k]}</li>
              ))}
            </ul>
            {changed.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                {changed.map(p => (
                  <li key={`${p.subject.type}-${p.subject.key}`}>
                    <span className="font-medium">{p.subject.label}</span> — {ACTION_LABELS[p.action]}
                    {p.upserts.some(r => r.countyFips) && `: ${p.upserts.filter(r => r.countyFips).map(r => `${r.countyName} ${r.mappedAcres != null ? `${roundTo(r.mappedAcres, 1)} ac` : ''}`.trim()).join(', ')}`}
                    {p.reason ? ` (${p.reason})` : ''}
                  </li>
                ))}
              </ul>
            )}
            {notesDifferences.length > 0 && (
              <div className="rounded-md border border-amber-500/30 p-2 text-xs" data-testid="county-preview-notes">
                <p className="font-semibold">Differs from field notes (reference only, notes are never used)</p>
                <ul className="list-disc pl-4">
                  {notesDifferences.map(d => d.differences.map(line => <li key={`${d.label}-${line}`}>{d.label}: {line}</li>))}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              <Button disabled={loading || (plan.upserts.length === 0 && plan.softDeletes.length === 0)} onClick={apply}>
                Apply {plan.upserts.length + plan.softDeletes.length} change{plan.upserts.length + plan.softDeletes.length === 1 ? '' : 's'}
              </Button>
              <Button variant="ghost" onClick={() => setPreview(null)}>Discard preview</Button>
            </div>
          </div>
        )}

        {showTracts && (
          <div className="space-y-3">
            {fsaTracts.filter(t => !t.deletedAt).map(tract => (
              <div key={tract.id} className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-sm font-semibold">Tract {tract.tractKey}</p>
                {tractCountySubjects(tract.tractKey, tract.geojson).map(subject => (
                  <CountyPanel key={subject.key} subject={subject} compact />
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
