import { useMemo, useState } from 'react';
import { Syringe, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import CattleTreatmentDialog from '@/components/cattle/CattleTreatmentDialog';
import { PlanUpgradeLink } from '@/components/settings/PlanUpgradeLink';
import { Button } from '@/components/ui/button';
import { ENTITLEMENT_COPY } from '@/copy/entitlements';
import { useEntitlement } from '@/hooks/useEntitlement';
import { COUNT_TITLES } from '@/lib/cattle/counts';
import { activeWithdrawal, describeDose, TREATMENT_KIND_LABELS } from '@/lib/cattle/health';
import { isFreeTierLocked } from '@/lib/entitlements';
import { localTodayIso } from '@/lib/equipment';
import { formatIsoDate } from '@/utils/dates';
import { useFarm } from '@/store/farmStore';
import type { CattleGroup } from '@/types/cattle';

/** The amber hold-back note for a herd, or nothing when no withdrawal is running. */
export function WithdrawalBadge({ groupId, className = '' }: { groupId: string; className?: string }) {
  const { cattleTreatments } = useFarm();
  const hold = useMemo(
    () => activeWithdrawal(cattleTreatments, groupId, localTodayIso()),
    [cattleTreatments, groupId],
  );
  if (!hold) return null;
  return (
    <span
      data-testid="withdrawal-badge"
      className={`inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-200 ${className}`}
    >
      Withdrawal until {formatIsoDate(hold.until)}
    </span>
  );
}

/** Treatments and vaccines for one herd, newest first, with the controls to add or remove one. */
export default function CattleTreatmentsSection({ group }: { group: CattleGroup }) {
  const { cattleTreatments, deleteCattleTreatment } = useFarm();
  const [treating, setTreating] = useState(false);
  // Display only; the server (assert_premium) is what actually refuses a free farm's new records.
  const { entitlement, cachedEntitlement } = useEntitlement();
  const locked = isFreeTierLocked(entitlement ?? cachedEntitlement);
  const today = localTodayIso();
  const items = useMemo(() => cattleTreatments
    .filter(item => item.groupId === group.id && !item.deleted_at)
    .sort((a, b) => b.treatedOn.localeCompare(a.treatedOn) || b.createdAt.localeCompare(a.createdAt)), [cattleTreatments, group.id]);

  return (
    <section className="space-y-2" aria-label="Treatments">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold">Treatments and vaccines</h2>
        {!locked && (
          <Button size="sm" variant="outline" className="h-11" onClick={() => setTreating(true)}>
            <Syringe className="mr-1.5 h-4 w-4" />Treat
          </Button>
        )}
      </div>
      {locked && (
        <div className="space-y-1 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm" data-testid="cattle-treatments-locked">
          <p className="font-semibold">{ENTITLEMENT_COPY.cattleEventsLockedTitle}</p>
          <p className="text-muted-foreground">{ENTITLEMENT_COPY.cattleEventsLockedBody}</p>
          <PlanUpgradeLink />
        </div>
      )}
      {items.length === 0 && !locked && <p className="text-sm text-muted-foreground">No treatments yet.</p>}
      {items.map(item => {
        const holding = item.treatedOn <= today && today < item.withdrawalUntil;
        return (
          <div key={item.id} className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {item.product} <span className="font-normal text-muted-foreground">· {TREATMENT_KIND_LABELS[item.kind]}</span>
              </span>
              <span className="block text-xs text-muted-foreground">
                {formatIsoDate(item.treatedOn)} · {item.headTreated} {item.cattleClass ? COUNT_TITLES[item.cattleClass].toLowerCase() : 'head'} · {describeDose(item)}
              </span>
              {item.withdrawalDays > 0 && (
                <span className={holding ? 'block text-xs font-semibold text-amber-700 dark:text-amber-300' : 'block text-xs text-muted-foreground'}>
                  {holding ? 'Withdrawal until ' : 'Withdrawal ended '}{formatIsoDate(item.withdrawalUntil)}
                </span>
              )}
              {item.lotNumber && <span className="block truncate text-xs text-muted-foreground">Lot {item.lotNumber}</span>}
              {item.notes && <span className="block truncate text-xs text-muted-foreground">{item.notes}</span>}
            </span>
            <Button
              variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Delete ${item.product} treatment on ${item.treatedOn}`}
              onClick={() => {
                if (!window.confirm('Delete this treatment record?')) return;
                void deleteCattleTreatment(item.id).then(ok => { if (!ok) toast.error('Could not delete the treatment.'); });
              }}
            ><Trash2 className="h-4 w-4" /></Button>
          </div>
        );
      })}
      {treating && !locked && <CattleTreatmentDialog group={group} onClose={() => setTreating(false)} />}
    </section>
  );
}
