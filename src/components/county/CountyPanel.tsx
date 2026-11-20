import { useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { activeRows, deriveCountyStatus } from '@/lib/county/allocation';
import { compareCountyToNotes, parseNotesCountyHints, type CountySubject } from '@/lib/county/plan';
import { subjectIndexKey } from '@/lib/county/resolve';
import type { CountyAssignment, FieldCountyShares } from '@/lib/county/types';
import { countyLabel, fractionPercent } from '@/lib/county/resolve';
import { roundTo } from '@/utils/numbers';
import { useFarm } from '@/store/farmStore';
import CountyBadge from './CountyBadge';
import CountyReviewDialog from './CountyReviewDialog';

interface Props {
  subject: CountySubject;
  /** Free-form notes to compare against. Review reference only; never changes an assignment. */
  notes?: string | null;
  compact?: boolean;
  /** What reports use for this field when it has no county rows of its own (e.g. from its CLUs). */
  effective?: FieldCountyShares;
}

/** Saved counties for one field or CLU, with the review and correction workflow. */
export default function CountyPanel({ subject, notes, compact = false, effective }: Props) {
  const { countyAssignments, saveCountySplit, restoreCountyAutomatic, markCountyReviewed } = useFarm();
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () => activeRows(countyAssignments.filter(r => subjectIndexKey(r.subjectType, r.subjectKey) === subjectIndexKey(subject.type, subject.key))),
    [countyAssignments, subject.type, subject.key],
  );
  const status = useMemo(() => deriveCountyStatus(rows, subject.recordedAcres), [rows, subject.recordedAcres]);
  const knownCounties = useMemo(() => {
    const byFips = new Map<string, CountyAssignment>();
    for (const r of countyAssignments) if (r.countyFips && !r.deletedAt && !byFips.has(r.countyFips)) byFips.set(r.countyFips, r);
    return [...byFips.values()].map(r => ({
      fips: r.countyFips as string, name: r.countyName ?? '', stateAbbr: r.stateAbbr ?? '',
      datasetSource: r.datasetSource ?? 'Manual entry', datasetVersion: r.datasetVersion ?? 'manual',
    }));
  }, [countyAssignments]);

  const comparison = useMemo(() => {
    const hints = parseNotesCountyHints(notes);
    if (hints.length === 0) return [];
    const measured = rows.filter(r => r.countyFips).map(r => ({
      countyName: r.countyName,
      acres: r.manualAcres ?? r.mappedAcres ?? (r.proportion != null ? r.proportion * subject.recordedAcres : 0),
    }));
    return compareCountyToNotes(hints, measured, knownCounties.map(c => c.name)).differences;
  }, [notes, rows, knownCounties, subject.recordedAcres]);

  const isManual = rows.some(r => r.method === 'manual');
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2" data-testid="county-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <MapPin size={14} /> {compact ? subject.label : 'Counties'}
        </h3>
        <CountyBadge status={status.status} />
      </div>

      {rows.filter(r => r.countyFips).length > 0 ? (
        <ul className="space-y-0.5 text-sm">
          {rows.filter(r => r.countyFips).map(r => (
            <li key={r.id} className="flex justify-between gap-3">
              <span>{r.countyName}, {r.stateAbbr}</span>
              <span className="font-mono text-muted-foreground">
                {r.manualAcres != null ? `${roundTo(r.manualAcres, 2)} ac` : r.mappedAcres != null ? `${roundTo(r.mappedAcres, 2)} ac mapped` : ''}
                {r.proportion != null && rows.length > 1 ? ` · ${roundTo(r.proportion * 100, 1)}%` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">County unknown</p>
      )}

      {effective && effective.basis === 'clu-geometry' && effective.shares.some(s => s.countyFips) && (
        <p className="text-xs text-muted-foreground" data-testid="county-effective">
          Reports use CLU boundaries: {effective.shares.map(s => `${countyLabel(s)} ${fractionPercent(s.fraction)}%`).join(' · ')}
        </p>
      )}
      {status.estimated && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Estimated: acres and production are divided by mapped county share of the recorded acreage.
        </p>
      )}
      {status.reasons.map(reason => <p key={reason} className="text-xs text-muted-foreground">{reason}</p>)}
      {comparison.length > 0 && (
        <div className="rounded-md border border-amber-500/30 p-2 text-xs" data-testid="county-notes-differences">
          <p className="font-semibold">Differs from the notes (reference only)</p>
          <ul className="list-disc pl-4">{comparison.map(line => <li key={line}>{line}</li>)}</ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy || subject.recordedAcres <= 0} onClick={() => setReviewing(true)}>
          Correct counties
        </Button>
        {status.status === 'needs_review' && !isManual && rows.some(r => r.countyFips) && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => markCountyReviewed(subject))}>
            Mark reviewed
          </Button>
        )}
        {isManual && (
          <>
            {status.status === 'needs_review' && (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => markCountyReviewed(subject))}>
                Keep correction
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => run(() => restoreCountyAutomatic(subject))}>
              Restore automatic
            </Button>
          </>
        )}
      </div>

      {reviewing && (
        <CountyReviewDialog
          open={reviewing}
          onOpenChange={setReviewing}
          subject={subject}
          rows={rows}
          knownCounties={knownCounties}
          onSave={split => saveCountySplit({ subject, split })}
        />
      )}
    </div>
  );
}
