import { useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Download, Gauge, Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { toast } from 'sonner';

import BottomNav from '@/components/BottomNav';
import EquipmentIcon from '@/components/equipment/EquipmentIcon';
import SyncStatusIndicator from '@/components/SyncStatusIndicator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  computeDueStatus,
  convertMeterUnit,
  costTotals,
  localTodayIso,
  resolveBrandColor,
  summarizeEquipmentStatus,
  type DueStatus,
} from '@/lib/equipment';
import { exportMaintenanceCsv } from '@/lib/equipment/export';
import { useFarm } from '@/store/farmStore';
import type { Equipment as EquipmentRecord, EquipmentKind, MaintenanceLogKind, MaintenanceSchedule, MeterUnit } from '@/types/equipment';

const KINDS: EquipmentKind[] = ['tractor', 'combine', 'sprayer', 'planter', 'tillage', 'truck', 'implement', 'other'];
const MAKES = ['John Deere', 'Case IH', 'New Holland', 'Kubota', 'Massey Ferguson', 'Claas', 'Ford'];
const UNIT_LABEL: Record<MeterUnit, string> = { hours: 'hrs', miles: 'mi', km: 'km' };
const EMPTY_COLOR = '#888780';

function todayIso() {
  return localTodayIso();
}

function machineName(machine: EquipmentRecord) {
  return [machine.year, machine.make, machine.model].filter(Boolean).join(' ') || `${machine.kind[0].toUpperCase()}${machine.kind.slice(1)}`;
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function StatusBadge({ status, task }: { status: DueStatus; task?: string }) {
  const styles: Record<DueStatus, string> = {
    overdue: 'border-destructive/30 bg-destructive/10 text-destructive',
    due_soon: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  };
  return <Badge variant="outline" className={styles[status]}>{task ? `${task}: ` : ''}{status === 'due_soon' ? 'Due soon' : status}</Badge>;
}

interface EquipmentFormProps {
  open: boolean;
  machine?: EquipmentRecord;
  schedules: MaintenanceSchedule[];
  onClose: () => void;
}

function EquipmentForm({ open, machine, schedules, onClose }: EquipmentFormProps) {
  const { addEquipment, updateEquipment, setEquipmentMeterUnit } = useFarm();
  const [kind, setKind] = useState<EquipmentKind>(machine?.kind ?? 'tractor');
  const [year, setYear] = useState(machine?.year?.toString() ?? '');
  const [make, setMake] = useState(machine?.make ?? '');
  const [model, setModel] = useState(machine?.model ?? '');
  const [serial, setSerial] = useState(machine?.serialNumber ?? '');
  const [unit, setUnit] = useState<MeterUnit>(machine?.meterUnit ?? 'hours');
  const [reading, setReading] = useState(machine?.currentReading.toString() ?? '0');
  const [notes, setNotes] = useState(machine?.notes ?? '');
  const [replacementIntervals, setReplacementIntervals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const unitChanged = Boolean(machine && machine.meterUnit !== unit);
  const automaticallyConvertible = Boolean(machine && convertMeterUnit(machine.currentReading, machine.meterUnit, unit) != null);
  const meterSchedules = schedules.filter(schedule => schedule.intervalValue != null);

  const changeUnit = (next: MeterUnit) => {
    if (machine && next !== machine.meterUnit) {
      const converted = convertMeterUnit(machine.currentReading, machine.meterUnit, next);
      setReading(converted?.toString() ?? '');
      const convertedIntervals: Record<string, string> = {};
      for (const schedule of meterSchedules) {
        const nextInterval = convertMeterUnit(schedule.intervalValue!, machine.meterUnit, next);
        if (nextInterval != null) convertedIntervals[schedule.id] = String(nextInterval);
      }
      setReplacementIntervals(convertedIntervals);
    } else if (machine) {
      setReading(String(machine.currentReading));
      setReplacementIntervals({});
    }
    setUnit(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const currentReading = Number(reading);
    const parsedYear = optionalNumber(year);
    if (!Number.isFinite(currentReading) || currentReading < 0) return toast.error('Enter a valid meter reading.');
    if (parsedYear != null && (parsedYear < 1900 || parsedYear > 2100)) return toast.error('Enter a year from 1900 to 2100.');
    if (unitChanged && !automaticallyConvertible && meterSchedules.some(schedule => !optionalNumber(replacementIntervals[schedule.id] ?? ''))) {
      return toast.error('Re-enter every meter-based maintenance interval for the new unit.');
    }
    setSaving(true);
    try {
      if (!machine) {
        const ok = await addEquipment({
          kind, year: parsedYear, make: make.trim() || undefined, model: model.trim() || undefined,
          serialNumber: serial.trim() || undefined, meterUnit: unit, currentReading,
          readingUpdatedAt: new Date().toISOString(), status: 'active', notes: notes.trim() || undefined,
        });
        if (ok) onClose();
        return;
      }
      const ok = await updateEquipment({
        ...machine, kind, year: parsedYear, make: make.trim() || undefined, model: model.trim() || undefined,
        serialNumber: serial.trim() || undefined, notes: notes.trim() || undefined,
      });
      if (!ok) return;
      if (unitChanged) {
        const unitOk = await setEquipmentMeterUnit(machine.id, machine.meterUnit, unit, {
          currentReading,
          schedules: meterSchedules.map(schedule => ({
            id: schedule.id,
            intervalValue: optionalNumber(replacementIntervals[schedule.id] ?? '') ?? schedule.intervalValue!,
            lastDoneReading: automaticallyConvertible
              ? (schedule.lastDoneReading == null
                ? null
                : convertMeterUnit(schedule.lastDoneReading, machine.meterUnit, unit))
              : null,
          })),
        });
        if (!unitOk) return;
      } else if (currentReading !== machine.currentReading) {
        const result = await performMeterUpdate(machine, currentReading);
        if (!result) return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // updateEquipment deliberately excludes meter columns. The page performs the
  // guarded meter write after the descriptive edit through this small adapter.
  async function performMeterUpdate(current: EquipmentRecord, next: number): Promise<boolean> {
    const result = await useFarmOps.updateEquipmentReading(current.id, next);
    if (result === 'warning') {
      if (!window.confirm('This reading is lower than the current meter. Save it as a meter replacement or correction?')) return false;
      return (await useFarmOps.updateEquipmentReading(current.id, next, true)) === 'saved';
    }
    return result === 'saved';
  }

  const useFarmOps = useFarm();

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{machine ? 'Edit equipment' : 'Add equipment'}</DialogTitle><DialogDescription>Machine details and its single meter.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm"><span className="font-medium">Kind</span><select value={kind} onChange={e => setKind(e.target.value as EquipmentKind)} className="h-11 w-full rounded-md border bg-background px-3">{KINDS.map(value => <option key={value}>{value}</option>)}</select></label>
            <label className="space-y-1 text-sm"><span className="font-medium">Year</span><Input inputMode="numeric" value={year} onChange={e => setYear(e.target.value)} placeholder="2020" /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm"><span className="font-medium">Make</span><Input list="equipment-makes" value={make} onChange={e => setMake(e.target.value)} /><datalist id="equipment-makes">{MAKES.map(value => <option key={value} value={value} />)}</datalist></label>
            <label className="space-y-1 text-sm"><span className="font-medium">Model</span><Input value={model} onChange={e => setModel(e.target.value)} /></label>
          </div>
          <label className="block space-y-1 text-sm"><span className="font-medium">Serial number</span><Input value={serial} onChange={e => setSerial(e.target.value)} /></label>
          <fieldset className="space-y-2"><legend className="text-sm font-medium">Meter unit</legend><div className="grid grid-cols-3 gap-2">{(['hours', 'miles', 'km'] as MeterUnit[]).map(value => <Button key={value} type="button" variant={unit === value ? 'default' : 'outline'} className="h-11 capitalize" onClick={() => changeUnit(value)}>{value}</Button>)}</div></fieldset>
          <label className="block space-y-1 text-sm"><span className="font-medium">Current reading ({UNIT_LABEL[unit]})</span><Input required inputMode="decimal" value={reading} onChange={e => setReading(e.target.value)} /></label>
          {unitChanged && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">{automaticallyConvertible ? 'The meter and maintenance intervals were converted automatically. Review them before saving.' : 'Hours cannot convert to distance (or vice versa). Re-enter the meter and each meter-based interval.'}</div>}
          {unitChanged && meterSchedules.map(schedule => <label key={schedule.id} className="block space-y-1 text-sm"><span className="font-medium">{schedule.taskName} interval ({UNIT_LABEL[unit]})</span><Input required inputMode="decimal" value={replacementIntervals[schedule.id] ?? ''} onChange={e => setReplacementIntervals(current => ({ ...current, [schedule.id]: e.target.value }))} /></label>)}
          <label className="block space-y-1 text-sm"><span className="font-medium">Notes</span><Textarea value={notes} onChange={e => setNotes(e.target.value)} /></label>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MeterDialog({ machine, onClose }: { machine: EquipmentRecord | null; onClose: () => void }) {
  const { updateEquipmentReading } = useFarm();
  const [reading, setReading] = useState(machine?.currentReading.toString() ?? '');
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!machine) return;
    const value = Number(reading);
    let result = await updateEquipmentReading(machine.id, value);
    if (result === 'warning' && window.confirm('This lowers the meter. Confirm a meter replacement or correction?')) result = await updateEquipmentReading(machine.id, value, true);
    if (result === 'saved') onClose(); else if (result === 'failed') toast.error('Could not update the meter.');
  };
  return <Dialog open={Boolean(machine)} onOpenChange={value => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>Update meter</DialogTitle><DialogDescription>{machine && `${machineName(machine)} · ${UNIT_LABEL[machine.meterUnit]}`}</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4"><Input autoFocus required inputMode="decimal" value={reading} onChange={e => setReading(e.target.value)} /><DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button>Save reading</Button></DialogFooter></form></DialogContent></Dialog>;
}

function ScheduleDialog({ machine, schedule, onClose }: { machine: EquipmentRecord; schedule?: MaintenanceSchedule; onClose: () => void }) {
  const { addMaintenanceSchedule, updateMaintenanceSchedule } = useFarm();
  const [name, setName] = useState(schedule?.taskName ?? '');
  const [meter, setMeter] = useState(schedule?.intervalValue?.toString() ?? '');
  const [days, setDays] = useState(schedule?.intervalDays?.toString() ?? '');
  const [lastReading, setLastReading] = useState(schedule?.lastDoneReading?.toString() ?? '');
  const [lastDate, setLastDate] = useState(schedule?.lastDoneAt ?? '');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!meter && !days) return toast.error('Enter a meter or day interval.');
    const values = { equipmentId: machine.id, taskName: name.trim(), intervalValue: optionalNumber(meter), intervalDays: optionalNumber(days), lastDoneReading: optionalNumber(lastReading), lastDoneAt: lastDate || undefined };
    const ok = schedule ? await updateMaintenanceSchedule({ ...schedule, ...values }) : await addMaintenanceSchedule(values);
    if (ok) onClose();
  };
  return <Dialog open onOpenChange={value => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>{schedule ? 'Edit maintenance task' : 'Add maintenance task'}</DialogTitle><DialogDescription>Use a meter interval, a calendar interval, or both.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-3"><label className="block space-y-1"><Label>Task name</Label><Input required value={name} onChange={e => setName(e.target.value)} placeholder="Oil change" /></label><div className="grid grid-cols-2 gap-3"><label className="space-y-1"><Label>Every ({UNIT_LABEL[machine.meterUnit]})</Label><Input inputMode="decimal" value={meter} onChange={e => setMeter(e.target.value)} /></label><label className="space-y-1"><Label>Every (days)</Label><Input inputMode="numeric" value={days} onChange={e => setDays(e.target.value)} /></label><label className="space-y-1"><Label>Last reading</Label><Input inputMode="decimal" value={lastReading} onChange={e => setLastReading(e.target.value)} /></label><label className="space-y-1"><Label>Last done</Label><Input type="date" value={lastDate} onChange={e => setLastDate(e.target.value)} /></label></div><DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button>Save task</Button></DialogFooter></form></DialogContent></Dialog>;
}

function LogDialog({ machine, kind, schedules, onClose }: { machine: EquipmentRecord; kind: MaintenanceLogKind; schedules: MaintenanceSchedule[]; onClose: () => void }) {
  const { logMaintenance } = useFarm();
  const [date, setDate] = useState(todayIso());
  const [reading, setReading] = useState(String(machine.currentReading));
  const [scheduleId, setScheduleId] = useState('');
  const [description, setDescription] = useState('');
  const [performedBy, setPerformedBy] = useState('');
  const [vendor, setVendor] = useState('');
  const [parts, setParts] = useState('');
  const [labor, setLabor] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const meter = optionalNumber(reading);
    const force = meter != null && meter < machine.currentReading
      ? window.confirm('This reading is lower than the current meter. Save it as a meter replacement or correction?')
      : false;
    if (meter != null && meter < machine.currentReading && !force) return;
    const ok = await logMaintenance({ equipmentId: machine.id, scheduleId: kind === 'service' && scheduleId ? scheduleId : undefined, kind, performedOn: date, readingAtService: meter, description: description.trim() || undefined, performedBy: performedBy.trim() || undefined, vendor: vendor.trim() || undefined, costParts: optionalNumber(parts), costLabor: optionalNumber(labor) }, force);
    if (ok) onClose(); else toast.error(`Could not save ${kind}.`);
  };
  return <Dialog open onOpenChange={value => !value && onClose()}><DialogContent className="max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle>Log {kind}</DialogTitle><DialogDescription>{machineName(machine)}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-3"><div className="grid grid-cols-2 gap-3"><label className="space-y-1"><Label>Date</Label><Input required type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label className="space-y-1"><Label>Reading ({UNIT_LABEL[machine.meterUnit]})</Label><Input inputMode="decimal" value={reading} onChange={e => setReading(e.target.value)} /></label></div>{kind === 'service' && <label className="block space-y-1"><Label>Maintenance task</Label><select className="h-11 w-full rounded-md border bg-background px-3" value={scheduleId} onChange={e => setScheduleId(e.target.value)}><option value="">None</option>{schedules.map(item => <option key={item.id} value={item.id}>{item.taskName}</option>)}</select></label>}<label className="block space-y-1"><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} /></label><div className="grid grid-cols-2 gap-3"><label className="space-y-1"><Label>Performed by</Label><Input value={performedBy} onChange={e => setPerformedBy(e.target.value)} /></label><label className="space-y-1"><Label>Vendor</Label><Input value={vendor} onChange={e => setVendor(e.target.value)} /></label><label className="space-y-1"><Label>Parts cost</Label><Input inputMode="decimal" value={parts} onChange={e => setParts(e.target.value)} /></label><label className="space-y-1"><Label>Labor cost</Label><Input inputMode="decimal" value={labor} onChange={e => setLabor(e.target.value)} /></label></div><DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button>Save {kind}</Button></DialogFooter></form></DialogContent></Dialog>;
}

export default function Equipment() {
  const { equipment, maintenanceSchedules, maintenanceLogs, deleteEquipment, deleteMaintenanceSchedule } = useFarm();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EquipmentRecord | 'new' | null>(null);
  const [meterMachine, setMeterMachine] = useState<EquipmentRecord | null>(null);
  const [scheduleEditor, setScheduleEditor] = useState<MaintenanceSchedule | 'new' | null>(null);
  const [logKind, setLogKind] = useState<MaintenanceLogKind | null>(null);
  const selected = equipment.find(item => item.id === selectedId) ?? null;
  const selectedSchedules = maintenanceSchedules.filter(item => item.equipmentId === selectedId);
  const selectedLogs = maintenanceLogs.filter(item => item.equipmentId === selectedId).sort((a, b) => b.performedOn.localeCompare(a.performedOn));
  const totals = costTotals(maintenanceLogs);
  const thisYear = new Date().getFullYear();

  const sorted = useMemo(() => equipment.map(machine => ({ machine, due: summarizeEquipmentStatus(maintenanceSchedules, machine, todayIso()) })).sort((a, b) => {
    const rank: Record<DueStatus, number> = { overdue: 0, due_soon: 1, ok: 2 };
    return rank[a.due.status] - rank[b.due.status] || machineName(a.machine).localeCompare(machineName(b.machine));
  }), [equipment, maintenanceSchedules]);

  const removeMachine = async (machine: EquipmentRecord) => {
    if (!window.confirm(`Delete ${machineName(machine)} and its maintenance history?`)) return;
    if (await deleteEquipment(machine.id)) setSelectedId(null);
  };

  return <div className="min-h-screen bg-background pb-[calc(7rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl"><div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3 lg:max-w-5xl lg:px-8"><div className="flex items-center gap-2">{selected && <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)} aria-label="Back to equipment"><ArrowLeft /></Button>}<div><h1 className="text-lg font-bold">{selected ? machineName(selected) : 'Equipment'}</h1><p className="text-xs text-muted-foreground">{selected ? `${selected.kind} · ${selected.currentReading.toLocaleString()} ${UNIT_LABEL[selected.meterUnit]}` : `${equipment.length} machine${equipment.length === 1 ? '' : 's'}`}</p></div></div><div className="flex items-center gap-2"><SyncStatusIndicator />{!selected && <Button size="sm" className="h-11" onClick={() => setEditing('new')}><Plus className="mr-1 h-4 w-4" />Add</Button>}</div></div></header>
    <main className="mx-auto max-w-lg space-y-4 px-4 py-4 lg:max-w-5xl lg:px-8">
      {!selected ? <>
        {sorted.length === 0 && <section className="rounded-2xl border-2 border-dashed p-10 text-center"><Wrench className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" /><h2 className="font-bold">No equipment yet</h2><p className="mt-1 text-sm text-muted-foreground">Add your first machine to track meters, maintenance, and repairs.</p><Button className="mt-4 h-11" onClick={() => setEditing('new')}><Plus className="mr-2 h-4 w-4" />Add equipment</Button></section>}
        <div className="grid gap-3 lg:grid-cols-2">{sorted.map(({ machine, due }) => <button type="button" key={machine.id} onClick={() => setSelectedId(machine.id)} className="flex min-h-20 w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left shadow-sm transition hover:border-primary/30"><EquipmentIcon kind={machine.kind} color={resolveBrandColor(machine.make) ?? EMPTY_COLOR} /><span className="min-w-0 flex-1"><span className="block truncate font-bold">{machineName(machine)}</span><span className="block text-xs capitalize text-muted-foreground">{machine.kind} · {machine.currentReading.toLocaleString()} {UNIT_LABEL[machine.meterUnit]}</span></span><StatusBadge status={due.status} task={due.taskName} /></button>)}</div>
        {maintenanceLogs.length > 0 && <Button variant="outline" className="h-11 w-full" onClick={() => void exportMaintenanceCsv(maintenanceLogs, equipment, `AcreLedger_Equipment_${todayIso()}.csv`)}><Download className="mr-2 h-4 w-4" />Export all logs</Button>}
      </> : <>
        <section className="rounded-2xl border bg-card p-4 shadow-sm"><div className="flex items-start gap-4"><EquipmentIcon kind={selected.kind} color={resolveBrandColor(selected.make) ?? EMPTY_COLOR} size={72} /><div className="min-w-0 flex-1"><p className="text-sm text-muted-foreground">{selected.serialNumber ? `Serial ${selected.serialNumber}` : 'No serial number'}</p><p className="mt-1 text-2xl font-black">{selected.currentReading.toLocaleString()} <span className="text-sm font-semibold text-muted-foreground">{UNIT_LABEL[selected.meterUnit]}</span></p><p className="text-xs text-muted-foreground">{selected.readingUpdatedAt ? `Updated ${new Date(selected.readingUpdatedAt).toLocaleDateString()}` : 'Reading date not set'}</p></div><Button size="icon" variant="ghost" onClick={() => setEditing(selected)} aria-label="Edit equipment"><Pencil className="h-4 w-4" /></Button></div><div className="mt-4 grid grid-cols-3 gap-2"><Button variant="outline" className="h-11 px-2" onClick={() => setMeterMachine(selected)}><Gauge className="mr-1 h-4 w-4" />Meter</Button><Button variant="outline" className="h-11 px-2" onClick={() => setLogKind('service')}>Service</Button><Button variant="outline" className="h-11 px-2" onClick={() => setLogKind('repair')}>Repair</Button></div></section>
        <section className="space-y-2"><div className="flex items-center justify-between"><h2 className="font-bold">Maintenance</h2><Button size="sm" variant="outline" className="h-11" onClick={() => setScheduleEditor('new')}><Plus className="mr-1 h-4 w-4" />Task</Button></div>{selectedSchedules.length === 0 && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">No recurring maintenance tasks.</p>}{selectedSchedules.map(schedule => { const due = computeDueStatus(schedule, selected, todayIso()); return <div key={schedule.id} className="flex items-center gap-3 rounded-xl border bg-card p-3"><div className="min-w-0 flex-1"><p className="font-semibold">{schedule.taskName}</p><p className="text-xs text-muted-foreground">{schedule.intervalValue && `Every ${schedule.intervalValue} ${UNIT_LABEL[selected.meterUnit]}`}{schedule.intervalValue && schedule.intervalDays ? ' or ' : ''}{schedule.intervalDays && `every ${schedule.intervalDays} days`}</p></div><StatusBadge status={due.status} /><Button size="icon" variant="ghost" onClick={() => setScheduleEditor(schedule)} aria-label={`Edit ${schedule.taskName}`}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => window.confirm(`Delete ${schedule.taskName}?`) && void deleteMaintenanceSchedule(schedule.id)} aria-label={`Delete ${schedule.taskName}`}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>; })}</section>
        <section className="space-y-2"><div className="flex items-center justify-between"><h2 className="font-bold">Service & repairs</h2>{selectedLogs.length > 0 && <Button size="sm" variant="outline" className="h-11" onClick={() => void exportMaintenanceCsv(selectedLogs, [selected], `AcreLedger_${machineName(selected).replace(/\s+/g, '_')}_${todayIso()}.csv`)}><Download className="mr-1 h-4 w-4" />CSV</Button>}</div><div className="grid grid-cols-2 gap-2"><div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">All time</p><p className="font-mono text-lg font-bold">${(totals[selected.id]?.allTime.total ?? 0).toFixed(2)}</p></div><div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">{thisYear}</p><p className="font-mono text-lg font-bold">${(totals[selected.id]?.byYear[thisYear]?.total ?? 0).toFixed(2)}</p></div></div>{selectedLogs.length === 0 && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">No service or repairs logged.</p>}{selectedLogs.map(log => <div key={log.id} className="rounded-xl border bg-card p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold capitalize">{log.kind}{log.description ? ` · ${log.description}` : ''}</p><p className="text-xs text-muted-foreground">{new Date(`${log.performedOn}T12:00:00`).toLocaleDateString()}{log.vendor ? ` · ${log.vendor}` : ''}{log.readingAtService != null ? ` · ${log.readingAtService} ${UNIT_LABEL[selected.meterUnit]}` : ''}</p></div><span className="font-mono text-sm font-bold">${((log.costParts ?? 0) + (log.costLabor ?? 0)).toFixed(2)}</span></div></div>)}</section>
        <Button variant="destructive" className="h-11 w-full" onClick={() => void removeMachine(selected)}><Trash2 className="mr-2 h-4 w-4" />Delete equipment</Button>
      </>}
    </main>
    {editing && <EquipmentForm key={editing === 'new' ? 'new' : editing.id} open machine={editing === 'new' ? undefined : editing} schedules={editing === 'new' ? [] : selectedSchedules} onClose={() => setEditing(null)} />}
    <MeterDialog key={meterMachine?.id ?? 'closed'} machine={meterMachine} onClose={() => setMeterMachine(null)} />
    {selected && scheduleEditor && <ScheduleDialog key={scheduleEditor === 'new' ? 'new' : scheduleEditor.id} machine={selected} schedule={scheduleEditor === 'new' ? undefined : scheduleEditor} onClose={() => setScheduleEditor(null)} />}
    {selected && logKind && <LogDialog key={logKind} machine={selected} kind={logKind} schedules={selectedSchedules} onClose={() => setLogKind(null)} />}
    <BottomNav />
  </div>;
}
