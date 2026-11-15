import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import CattleEventDialog from '@/components/cattle/CattleEventDialog';
import { PlanUpgradeLink } from '@/components/settings/PlanUpgradeLink';
import { Button } from '@/components/ui/button';
import { ENTITLEMENT_COPY } from '@/copy/entitlements';
import { useEntitlement } from '@/hooks/useEntitlement';
import { isFreeTierLocked } from '@/lib/entitlements';
import { CATTLE_REMOVAL_LABELS, describeEvent } from '@/lib/cattle/ui';
import { formatIsoDate } from '@/utils/dates';
import { useFarm } from '@/store/farmStore';
import type { CattleGroup } from '@/types/cattle';

/** Events for one group as a newest-first timeline, with the controls to log or remove an event. */
export default function CattleEventsSection({ group }: { group: CattleGroup }) {
  const { cattleEvents, cattleGroups, deleteCattleEvent } = useFarm();
  const [logging, setLogging] = useState(false);
  // Display only; the server (assert_premium) is what actually refuses a free farm's new events.
  const { entitlement, cachedEntitlement } = useEntitlement();
  const locked = isFreeTierLocked(entitlement ?? cachedEntitlement);
  const events = useMemo(() => cattleEvents
    .filter(event => event.groupId === group.id && !event.deleted_at)
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate) || b.createdAt.localeCompare(a.createdAt)), [cattleEvents, group.id]);

  return (
    <section className="space-y-2" aria-label="Events">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold">Events</h2>
        {!locked && (
          <Button size="sm" variant="outline" className="h-11" onClick={() => setLogging(true)}>
            <Plus className="mr-1.5 h-4 w-4" />Log event
          </Button>
        )}
      </div>
      {locked && (
        <div className="space-y-1 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm" data-testid="cattle-events-locked">
          <p className="font-semibold">{ENTITLEMENT_COPY.cattleEventsLockedTitle}</p>
          <p className="text-muted-foreground">{ENTITLEMENT_COPY.cattleEventsLockedBody}</p>
          <PlanUpgradeLink />
        </div>
      )}
      {events.length === 0 && !locked && <p className="text-sm text-muted-foreground">No events yet.</p>}
      {events.map(event => (
        <div key={event.id} className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{describeEvent(event, cattleEvents, cattleGroups)}</span>
            <span className="block text-xs text-muted-foreground">
              {formatIsoDate(event.eventDate)}{event.reason && !event.transferId ? ` · ${CATTLE_REMOVAL_LABELS[event.reason]}` : ''}
            </span>
            {event.notes && <span className="block truncate text-xs text-muted-foreground">{event.notes}</span>}
          </span>
          <Button
            variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Delete event on ${event.eventDate}`}
            onClick={() => {
              const message = event.transferId
                ? 'Delete this move? Both groups go back to their earlier head counts.'
                : 'Delete this event? The head count change is reversed.';
              if (!window.confirm(message)) return;
              void deleteCattleEvent(event.id).then(ok => { if (!ok) toast.error('Could not delete the event.'); });
            }}
          ><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      {logging && !locked && <CattleEventDialog group={group} onClose={() => setLogging(false)} />}
    </section>
  );
}
