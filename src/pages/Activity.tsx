import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarm } from '@/store/farmStore';
import BottomNav from '@/components/BottomNav';
import { ClipboardList, Leaf, CloudRain, Wheat, Trash2, Warehouse, FileDown, Pencil, Tractor, Sprout, FileText, Settings, History } from 'lucide-react';
import { formatDate } from '@/config/constants';
import { formatIsoDate } from '@/utils/dates';
import { roundTo } from '@/utils/numbers';
import { generateMissouriLog, exportFsa578Data, exportHarvestData } from '@/lib/complianceReports';
import type { PlantRecord, SprayRecord, HarvestRecord, HayHarvestRecord, FertilizerApplication } from '@/types/farm';
import PlantModal from '@/components/PlantModal';
import SprayModal from '@/components/SprayModal';
import HarvestModal from '@/components/HarvestModal';
import HayModal from '@/components/HayModal';
import FertilizerModal from '@/components/FertilizerModal';
import GrainMovementModal from '@/components/GrainMovementModal';
import RecordListItem from '@/components/RecordListItem';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type EditableRecord = PlantRecord | SprayRecord | HarvestRecord | HayHarvestRecord | FertilizerApplication;
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Tab = 'plant' | 'spray' | 'fertilizer' | 'harvest' | 'hay' | 'grain';

const TABS: { key: Tab; icon: React.ElementType; label: string; color: string }[] = [
  { key: 'plant', icon: Leaf, label: 'Planting', color: 'text-plant' },
  { key: 'spray', icon: CloudRain, label: 'Spraying', color: 'text-spray' },
  { key: 'fertilizer', icon: Sprout, label: 'Fertilizer', color: 'text-lime-600 dark:text-lime-400' },
  { key: 'harvest', icon: Wheat, label: 'Harvesting', color: 'text-harvest' },
  { key: 'hay', icon: Tractor, label: 'Hay/Forage', color: 'text-orange-700 dark:text-orange-400' },
  { key: 'grain', icon: Warehouse, label: 'Grain', color: 'text-harvest' },
];

export default function Activity() {
  const navigate = useNavigate();
  const {
    fields,
    plantRecords,
    sprayRecords,
    harvestRecords,
    hayHarvestRecords,
    fertilizerApplications,
    grainMovements,
    deletePlantRecords,
    deleteSprayRecords,
    deleteHarvestRecords,
    deleteHayHarvestRecords,
    deleteFertilizerApplications,
    activeSeason,
    viewingSeason,
    setViewingSeason,
    deleteGrainMovements
  } = useFarm();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('plant');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EditableRecord | null>(null);

  const getEditField = (fieldId: string) =>
    fields.find(f => f.id === fieldId && !f.deleted_at) ?? null;

  const edit = (e: React.MouseEvent, record: any) => {
    e.stopPropagation();
    setEditingRecord(record);
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderTitle = (name: string, date: string | number) => {
    const uuidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
    const cleanName = name.replace(uuidRegex, '').trim().replace(/\s*—\s*$/, '').replace(/\s*-\s*$/, '');
    const formattedDate = typeof date === 'string' ? (formatIsoDate(date) || date) : formatDate(date);
    return (
      <div className="flex items-center justify-between w-full">
        <span className="font-bold text-foreground text-sm truncate mr-2">{cleanName}</span>
        <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{formattedDate}</span>
      </div>
    );
  };

  const handleDelete = () => {
    const ids = Array.from(selected);
    if (tab === 'plant') deletePlantRecords(ids);
    else if (tab === 'spray') deleteSprayRecords(ids);
    else if (tab === 'harvest') deleteHarvestRecords(ids);
    else if (tab === 'hay') deleteHayHarvestRecords(ids);
    else if (tab === 'fertilizer') deleteFertilizerApplications(ids);
    else deleteGrainMovements(ids);
    setSelected(new Set());
    setConfirmDelete(false);
  };

  const filteredPlant = useMemo(() =>
    plantRecords
      .filter(r => !r.deleted_at && r.seasonYear === viewingSeason && (r.fieldName.toLowerCase().includes(search.toLowerCase()) || r.seedVariety.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => b.timestamp - a.timestamp),
    [plantRecords, search, viewingSeason]
  );

  const filteredSpray = useMemo(() =>
    sprayRecords
      .filter(r => !r.deleted_at && r.seasonYear === viewingSeason && (r.fieldName.toLowerCase().includes(search.toLowerCase()) || r.product.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => b.timestamp - a.timestamp),
    [sprayRecords, search, viewingSeason]
  );

  const filteredHarvest = useMemo(() =>
    harvestRecords
      .filter(r => !r.deleted_at && r.seasonYear === viewingSeason && r.fieldName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.timestamp - a.timestamp),
    [harvestRecords, search, viewingSeason]
  );

  const filteredGrain = useMemo(() =>
    grainMovements
      .filter(m => !m.deleted_at && m.seasonYear === viewingSeason && (m.binName.toLowerCase().includes(search.toLowerCase()) || (m.sourceFieldName || '').toLowerCase().includes(search.toLowerCase()) || (m.destination || '').toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => b.timestamp - a.timestamp),
    [grainMovements, search, viewingSeason]
  );

  const filteredHay = useMemo(() =>
    hayHarvestRecords
      .filter(m => !m.deleted_at && m.seasonYear === viewingSeason && (m.fieldName.toLowerCase().includes(search.toLowerCase()) || m.baleType.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => b.timestamp - a.timestamp),
    [hayHarvestRecords, search, viewingSeason]
  );

  const filteredFertilizer = useMemo(() =>
    fertilizerApplications
      .filter(r => !r.deleted_at && r.season_year === viewingSeason && (r.fieldName.toLowerCase().includes(search.toLowerCase()) || r.fertilizer_formula.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [fertilizerApplications, search, viewingSeason]
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border pb-0">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ClipboardList size={20} className="text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-foreground tracking-tight">Activity</h1>
                <Select
                  value={viewingSeason.toString()}
                  onValueChange={(v) => setViewingSeason(parseInt(v))}
                >
                  <SelectTrigger className="h-7 min-w-[80px] bg-muted border-none font-mono text-[10px] font-bold py-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[activeSeason, activeSeason - 1, activeSeason - 2].map(y => (
                      <SelectItem key={y} value={y.toString()} className="font-mono text-[10px]">
                        {y} SEASON
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs font-mono text-muted-foreground">REVIEW & MANAGE</p>
            </div>
          </div>

          {tab === 'spray' && (
            <button
              onClick={() => generateMissouriLog(filteredSpray, fields)}
              className="p-2.5 rounded-lg bg-spray/10 text-spray hover:bg-spray/20 transition-colors flex items-center gap-2 font-mono text-[10px] font-bold"
              title="Export Missouri Spray Log (MP693)"
            >
              <FileDown size={16} />
              EXPORT LOG
            </button>
          )}
          {(tab === 'plant' || tab === 'harvest') && (
            <button
              onClick={() => tab === 'plant' ? exportFsa578Data(filteredPlant, fields) : exportHarvestData(filteredHarvest, fields)}
              className="p-2.5 rounded-lg bg-plant/10 text-plant hover:bg-plant/20 transition-colors flex items-center gap-2 font-mono text-[10px] font-bold"
              title={tab === 'plant' ? "Export FSA-578 Data Summary" : "Export Harvest Production Data"}
            >
              <FileDown size={16} />
              FSA EXPORT
            </button>
          )}
          {tab === 'hay' && (
            <button
              onClick={() => navigate('/reports?tab=hay-summary')}
              className="p-2.5 rounded-lg bg-harvest/10 text-harvest hover:bg-harvest/20 transition-colors flex items-center gap-2 font-mono text-[10px] font-bold"
            >
              <FileDown size={16} />
              HAY SUMMARY
            </button>
          )}
        </div>
        <div className="h-[2px] w-full bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
      </header>
      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1 overflow-x-auto no-scrollbar">
          {TABS.map(t => {
            const count = t.key === 'plant' ? filteredPlant.length
              : t.key === 'spray' ? filteredSpray.length
              : t.key === 'harvest' ? filteredHarvest.length
              : t.key === 'grain' ? filteredGrain.length
              : t.key === 'hay' ? filteredHay.length
              : filteredFertilizer.length;

            return (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setSelected(new Set()); }}
                className={`flex-1 min-w-[80px] touch-target flex items-center justify-center gap-1.5 rounded-md py-2.5 font-mono text-[10px] font-semibold transition-all ${tab === t.key ? `bg-muted ${t.color}` : 'text-muted-foreground'
                  }`}
              >
                <t.icon size={14} />
                <span className="flex items-center gap-1">
                  {t.label.toUpperCase()}
                  <span className={`px-1.5 py-0.5 rounded-full text-[8px] bg-background/50 border border-border/20 ${tab === t.key ? t.color : 'text-muted-foreground'}`}>
                    {count}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <input
          id="activitySearch"
          name="activitySearch"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search records..."
          className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />

        {/* Bulk delete */}
        {selected.size > 0 && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="touch-target w-full flex items-center justify-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg py-3 font-mono text-sm font-bold active:scale-95 transition-transform"
          >
            <Trash2 size={18} />
            Delete {selected.size} Record{selected.size > 1 ? 's' : ''}
          </button>
        )}

        {/* Records */}
        <div className="space-y-2">
          {tab === 'plant' && filteredPlant.map(r => (
            <RecordListItem
              key={r.id}
              id={r.id}
              type="plant"
              title={r.fieldName.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '').trim().replace(/\s*—\s*$/, '').replace(/\s*-\s*$/, '')}
              subtitle={`${r.crop || 'UNSPECIFIED'} · ${r.seedVariety}`}
              details={`${r.acreage} AC · PLANTED`}
              date={formatIsoDate(r.plantDate) || r.plantDate || formatDate(r.timestamp)}
              isSelected={selected.has(r.id)}
              onToggle={toggle}
              onEdit={() => setEditingRecord(r)}
            />
          ))}

          {tab === 'spray' && filteredSpray.map(r => (
            <RecordListItem
              key={r.id}
              id={r.id}
              type="spray"
              title={r.fieldName.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '').trim().replace(/\s*—\s*$/, '').replace(/\s*-\s*$/, '')}
              subtitle={r.product}
              details={`${r.windSpeed} MPH ${r.windDirection} · ${r.temperature}°F`}
              date={formatIsoDate(r.sprayDate) || r.sprayDate || formatDate(r.timestamp)}
              isSelected={selected.has(r.id)}
              onToggle={toggle}
              onEdit={() => setEditingRecord(r)}
            />
          ))}

          {tab === 'harvest' && filteredHarvest.map(r => (
            <RecordListItem
              key={r.id}
              id={r.id}
              type="harvest"
              title={r.fieldName.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '').trim().replace(/\s*—\s*$/, '').replace(/\s*-\s*$/, '')}
              subtitle={`${r.crop || 'UNSPECIFIED'} · ${r.bushels} BU`}
              details={`${r.moisturePercent}% MST · BIN ${r.binId ? 'ID:' + r.binId : 'N/A'}`}
              date={formatIsoDate(r.harvestDate) || r.harvestDate || formatDate(r.timestamp)}
              isSelected={selected.has(r.id)}
              onToggle={toggle}
              onEdit={() => setEditingRecord(r)}
            />
          ))}

          {tab === 'hay' && filteredHay.map(r => (
            <RecordListItem
              key={r.id}
              id={r.id}
              type="hay"
              title={r.fieldName.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '').trim().replace(/\s*—\s*$/, '').replace(/\s*-\s*$/, '')}
              subtitle={`${r.baleCount} BALES · ${r.baleType}`}
              details={`CUTTING #${r.cuttingNumber}`}
              date={formatIsoDate(r.date) || r.date || formatDate(r.timestamp)}
              isSelected={selected.has(r.id)}
              onToggle={toggle}
              onEdit={() => setEditingRecord(r)}
            />
          ))}

          {tab === 'fertilizer' && filteredFertilizer.map(r => (
            <RecordListItem
              key={r.id}
              id={r.id}
              type="fertilizer"
              title={r.fieldName.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '').trim().replace(/\s*—\s*$/, '').replace(/\s*-\s*$/, '')}
              subtitle={`${r.fertilizer_formula}`}
              details={`${r.acres} AC · APPLIED`}
              date={formatIsoDate(r.date) || r.date || formatDate(new Date(r.created_at).getTime())}
              isSelected={selected.has(r.id)}
              onToggle={toggle}
              onEdit={() => setEditingRecord(r)}
            />
          ))}

          {tab === 'grain' && filteredGrain.map(m => (
            <RecordListItem
              key={m.id}
              id={m.id}
              type="grain"
              title={m.binName.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '').trim().replace(/\s*—\s*$/, '').replace(/\s*-\s*$/, '')}
              subtitle={`${m.type === 'in' ? 'ADDITION' : 'SALE'} · ${m.bushels} BU`}
              details={`${m.sourceFieldName || m.destination || 'N/A'} · ${m.moisturePercent}% MST`}
              date={formatDate(m.timestamp)}
              isSelected={selected.has(m.id)}
              onToggle={toggle}
              onEdit={() => setEditingRecord(m)}
            />
          ))}
        </div>

        {/* Empty state */}
        {tab === 'plant' && filteredPlant.length === 0 && <p className="text-center text-muted-foreground font-mono text-sm py-8">No planting records</p>}
        {tab === 'spray' && filteredSpray.length === 0 && <p className="text-center text-muted-foreground font-mono text-sm py-8">No spray records</p>}
        {tab === 'harvest' && filteredHarvest.length === 0 && <p className="text-center text-muted-foreground font-mono text-sm py-8">No harvest records</p>}
        {tab === 'hay' && filteredHay.length === 0 && <p className="text-center text-muted-foreground font-mono text-sm py-8">No hay records</p>}
        {tab === 'fertilizer' && filteredFertilizer.length === 0 && <p className="text-center text-muted-foreground font-mono text-sm py-8">No fertilizer records</p>}
        {tab === 'grain' && filteredGrain.length === 0 && <p className="text-center text-muted-foreground font-mono text-sm py-8">No grain movement records</p>}
      </main>

      {/* Confirm Delete Dialog */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="bg-card border-destructive/30 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently remove {selected.size} record{selected.size > 1 ? 's' : ''}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="touch-target border-border text-muted-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="touch-target bg-destructive text-destructive-foreground glow-destructive">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {tab === 'grain' && editingRecord && (
        <GrainMovementModal
          open={!!editingRecord}
          onClose={() => setEditingRecord(null)}
          initialData={editingRecord as any}
        />
      )}
      <BottomNav />

      {tab === 'plant' && editingRecord && (() => {
        const editField = getEditField(editingRecord.fieldId);
        if (!editField) return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <div className="bg-card border border-border p-6 rounded-xl max-w-sm w-full space-y-4 shadow-2xl">
              <p className="text-sm text-muted-foreground">The original field for this record has been deleted.</p>
              <Button onClick={() => setEditingRecord(null)} className="w-full">Close</Button>
            </div>
          </div>
        );
        return (
          <PlantModal
            open={!!editingRecord}
            onClose={() => setEditingRecord(null)}
            field={editField}
            initialData={editingRecord as PlantRecord}
          />
        );
      })()}
      {tab === 'spray' && editingRecord && (() => {
        const editField = getEditField(editingRecord.fieldId);
        if (!editField) return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <div className="bg-card border border-border p-6 rounded-xl max-w-sm w-full space-y-4 shadow-2xl">
              <p className="text-sm text-muted-foreground">The original field for this record has been deleted.</p>
              <Button onClick={() => setEditingRecord(null)} className="w-full">Close</Button>
            </div>
          </div>
        );
        return (
          <SprayModal
            open={!!editingRecord}
            onClose={() => setEditingRecord(null)}
            field={editField}
            initialData={editingRecord as SprayRecord}
          />
        );
      })()}
      {tab === 'harvest' && editingRecord && (() => {
        const editField = getEditField(editingRecord.fieldId);
        if (!editField) return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <div className="bg-card border border-border p-6 rounded-xl max-w-sm w-full space-y-4 shadow-2xl">
              <p className="text-sm text-muted-foreground">The original field for this record has been deleted.</p>
              <Button onClick={() => setEditingRecord(null)} className="w-full">Close</Button>
            </div>
          </div>
        );
        return (
          <HarvestModal
            open={!!editingRecord}
            onClose={() => setEditingRecord(null)}
            field={editField}
            initialData={editingRecord as HarvestRecord}
          />
        );
      })()}
      {tab === 'hay' && editingRecord && (() => {
        const editField = getEditField(editingRecord.fieldId);
        if (!editField) return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <div className="bg-card border border-border p-6 rounded-xl max-w-sm w-full space-y-4 shadow-2xl">
              <p className="text-sm text-muted-foreground">The original field for this record has been deleted.</p>
              <Button onClick={() => setEditingRecord(null)} className="w-full">Close</Button>
            </div>
          </div>
        );
        return (
          <HayModal
            open={!!editingRecord}
            onClose={() => setEditingRecord(null)}
            field={editField}
            initialData={editingRecord as HayHarvestRecord}
          />
        );
      })()}
      {tab === 'fertilizer' && editingRecord && (() => {
        const editField = getEditField((editingRecord as FertilizerApplication).fieldId);
        if (!editField) return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <div className="bg-card border border-border p-6 rounded-xl max-w-sm w-full space-y-4 shadow-2xl">
              <p className="text-sm text-muted-foreground">The original field for this record has been deleted.</p>
              <Button onClick={() => setEditingRecord(null)} className="w-full">Close</Button>
            </div>
          </div>
        );
        return (
          <FertilizerModal
            open={!!editingRecord}
            onClose={() => setEditingRecord(null)}
            field={editField}
            initialData={editingRecord as FertilizerApplication}
          />
        );
      })()}
    </div>
  );
}
