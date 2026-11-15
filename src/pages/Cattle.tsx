import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Beef, Download, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import BottomNav from '@/components/BottomNav';
import CattleGroupDialog from '@/components/cattle/CattleGroupDialog';
import CattleEventsSection from '@/components/cattle/CattleEventsSection';
import CattleMoveDialog from '@/components/cattle/CattleMoveDialog';
import SyncStatusIndicator from '@/components/SyncStatusIndicator';
import { Button } from '@/components/ui/button';
import { daysOnCurrentPasture } from '@/lib/cattle/derived';
import { buildCattleCsv, exportCattleCsv } from '@/lib/cattle/report';
import {
  CATTLE_CLASS_LABELS, PASTURE_REMOVED_LABEL, pastureLabel,
} from '@/lib/cattle/ui';
import { localTodayIso } from '@/lib/equipment';
import { formatIsoDate } from '@/utils/dates';
import { useFarm } from '@/store/farmStore';
import type { CattleGroup } from '@/types/cattle';

function dayText(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

function GroupCard({ group, pasture, days }: { group: CattleGroup; pasture: string; days: number }) {
  const removed = pasture === PASTURE_REMOVED_LABEL;
  return (
    <Link
      to={`/cattle/${group.id}`}
      className="flex min-h-20 w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left shadow-sm transition hover:border-primary/30"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Beef size={22} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold leading-tight">{group.name}</span>
        <span className="block text-xs text-muted-foreground">{CATTLE_CLASS_LABELS[group.class]} · {group.headCount} head</span>
        <span className={removed ? 'block truncate text-xs font-semibold text-amber-700 dark:text-amber-300' : 'block truncate text-xs text-muted-foreground'}>
          {group.currentFieldId ? `${pasture}${removed ? '' : ` · ${dayText(days)}`}` : 'Not on a pasture'}
        </span>
      </span>
    </Link>
  );
}

function CattleList() {
  const { cattleGroups, cattleMoves, cattleEvents, fields } = useFarm();
  const [adding, setAdding] = useState(false);
  const today = localTodayIso();
  const groups = useMemo(
    () => cattleGroups.filter(group => !group.deleted_at).sort((a, b) => a.name.localeCompare(b.name)),
    [cattleGroups],
  );
  const hasRecords = groups.length > 0;

  const exportCsv = async () => {
    try {
      await exportCattleCsv(buildCattleCsv(cattleGroups, cattleMoves, cattleEvents, fields), `AcreLedger-cattle-${today}.csv`);
    } catch (error) {
      console.error('Cattle CSV export failed:', error);
      toast.error('Could not export the cattle CSV.');
    }
  };

  return (
    <>
      {!hasRecords && (
        <section className="rounded-2xl border-2 border-dashed p-10 text-center">
          <Beef className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
          <p className="font-semibold">Add your first group to start tracking cattle.</p>
        </section>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map(group => (
          <GroupCard
            key={group.id}
            group={group}
            pasture={pastureLabel(group.currentFieldId, fields)}
            days={daysOnCurrentPasture(group, today)}
          />
        ))}
      </div>
      <Button className="h-12 w-full" onClick={() => setAdding(true)}><Plus className="mr-2 h-4 w-4" />Add group</Button>
      {hasRecords && (
        <Button variant="outline" className="h-11 w-full" onClick={() => void exportCsv()}>
          <Download className="mr-2 h-4 w-4" />Export cattle CSV
        </Button>
      )}
      {adding && <CattleGroupDialog onClose={() => setAdding(false)} />}
    </>
  );
}

function GroupDetail({ group }: { group: CattleGroup }) {
  const navigate = useNavigate();
  const { cattleMoves, fields, deleteCattleGroup, deleteCattleMove } = useFarm();
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const today = localTodayIso();
  const moves = useMemo(() => cattleMoves
    .filter(move => move.groupId === group.id && !move.deleted_at)
    .sort((a, b) => b.movedOn.localeCompare(a.movedOn) || b.createdAt.localeCompare(a.createdAt)), [cattleMoves, group.id]);
  const pasture = pastureLabel(group.currentFieldId, fields);

  const remove = async () => {
    if (!window.confirm(`Delete ${group.name} and its move and event history?`)) return;
    if (await deleteCattleGroup(group.id)) navigate('/cattle', { replace: true });
    else toast.error('Could not delete the group.');
  };

  return (
    <>
      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground">{CATTLE_CLASS_LABELS[group.class]}</p>
            <p className="text-3xl font-black tracking-tight">{group.headCount} <span className="text-base font-bold text-muted-foreground">head</span></p>
          </div>
          <Button variant="outline" className="h-11 shrink-0" onClick={() => setEditing(true)}><Pencil className="mr-2 h-4 w-4" />Edit</Button>
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">
            {group.currentFieldId
              ? `${pasture}${pasture === PASTURE_REMOVED_LABEL ? '' : ` · ${dayText(daysOnCurrentPasture(group, today))}`}`
              : 'Not on a pasture'}
          </span>
        </p>
        {group.notes && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{group.notes}</p>}
        <Button className="h-14 w-full text-base font-bold" onClick={() => setMoving(true)}>Move</Button>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Moves</h2>
        {moves.length === 0 && <p className="text-sm text-muted-foreground">No moves yet.</p>}
        {moves.map(move => (
          <div key={move.id} className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{pastureLabel(move.fieldId, fields)}</span>
              <span className="block text-xs text-muted-foreground">{formatIsoDate(move.movedOn)} · {move.headCount} head</span>
              {move.notes && <span className="block truncate text-xs text-muted-foreground">{move.notes}</span>}
            </span>
            <Button
              variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Delete move on ${move.movedOn}`}
              onClick={() => { if (window.confirm('Delete this move?')) void deleteCattleMove(move.id); }}
            ><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </section>

      <CattleEventsSection group={group} />

      <Button variant="destructive" className="h-11 w-full" onClick={() => void remove()}><Trash2 className="mr-2 h-4 w-4" />Delete group</Button>
      {editing && <CattleGroupDialog group={group} onClose={() => setEditing(false)} />}
      {moving && <CattleMoveDialog group={group} onClose={() => setMoving(false)} />}
    </>
  );
}

export default function Cattle() {
  const { groupId } = useParams();
  const { runsCattle, initialFetchComplete, cattleGroups, cattleLoadFailed } = useFarm();
  const group = groupId ? cattleGroups.find(item => item.id === groupId && !item.deleted_at) : undefined;
  const liveCount = cattleGroups.filter(item => !item.deleted_at).length;

  // With the feature off the screen does not exist; wait for the saved setting before deciding.
  if (initialFetchComplete && !runsCattle) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background pb-[calc(7rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3 lg:max-w-5xl lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            {groupId && (
              <Button variant="ghost" size="icon" className="h-11 w-11" asChild aria-label="Back to cattle">
                <Link to="/cattle"><ArrowLeft /></Link>
              </Button>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold">{group ? group.name : 'Cattle'}</h1>
              <p className="text-xs text-muted-foreground">
                {group ? `${group.headCount} head` : `${liveCount} group${liveCount === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
          <SyncStatusIndicator />
        </div>
      </header>
      <main className="mx-auto max-w-lg space-y-4 px-4 py-4 lg:max-w-5xl lg:px-8">
        {cattleLoadFailed && (
          <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
            Cattle could not be refreshed. Showing what is saved on this device.
          </p>
        )}
        {groupId
          ? (group ? <GroupDetail key={group.id} group={group} /> : (
            <section className="rounded-2xl border-2 border-dashed p-10 text-center">
              <p className="font-semibold">This group is no longer here.</p>
              <Button variant="outline" className="mt-4 h-11" asChild><Link to="/cattle">Back to cattle</Link></Button>
            </section>
          ))
          : <CattleList />}
      </main>
      <BottomNav />
    </div>
  );
}
