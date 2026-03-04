import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarm } from '@/store/farmStore';
import BottomNav from '@/components/BottomNav';
import { ClipboardList, Leaf, CloudRain, Wheat, Trash2, Warehouse, FileDown, Pencil, Tractor, Sprout } from 'lucide-react';
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
  { key: 'grain', icon: Warehouse, label: 'Harvest', color: 'text-harvest' },
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
      .filter(r => !r.deleted_at && r.seasonYear === activeSeason && (r.fieldName.toLowerCase().includes(search.toLowerCase()) || r.seedVariety.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => b.timestamp - a.timestamp),
    [plantRecords, search, activeSeason]
  );

  const filteredSpray = useMemo(() =>
    sprayRecords
      .filter(r => !r.deleted_at && r.seasonYear === activeSeason && (r.fieldName.toLowerCase().includes(search.toLowerCase()) || r.product.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => b.timestamp - a.timestamp),
    [sprayRecords, search, activeSeason]
  );

  const filteredHarvest = useMemo(() =>
    harvestRecords
      .filter(r => !r.deleted_at && r.seasonYear === activeSeason && r.fieldName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.timestamp - a.timestamp),
    [harvestRecords, search, activeSeason]
  );

  const filteredGrain = useMemo(() =>
    grainMovements
      .filter(m => m.seasonYear === activeSeason && (m.binName.toLowerCase().includes(search.toLowerCase()) || (m.sourceFieldName || '').toLowerCase().includes(search.toLowerCase()) || (m.destination || '').toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => b.timestamp - a.timestamp),
    [grainMovements, search, activeSeason]
  );

  const filteredHay = useMemo(() =>
    hayHarvestRecords
      .filter(m => !m.deleted_at && m.seasonYear === activeSeason && (m.fieldName.toLowerCase().includes(search.toLowerCase()) || m.baleType.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => b.timestamp - a.timestamp),
    [hayHarvestRecords, search, activeSeason]
  );

  const filteredFertilizer = useMemo(() =>
    fertilizerApplications
      .filter(r => !r.deleted_at && r.season_year === activeSeason && (r.fieldName.toLowerCase().includes(search.toLowerCase()) || r.fertilizer_formula.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [fertilizerApplications, search, activeSeason]
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ClipboardList size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">Activity</h1>
              <p className="text-xs font-mono text-muted-foreground">REVIEW & MANAGE</p>
            </div>
          </div>

          {tab === 'spray' && (
            <button
              onClick={() => generateMissouriLog(sprayRecords, fields)}
              className="p-2.5 rounded-lg bg-spray/10 text-spray hover:bg-spray/20 transition-colors flex items-center gap-2 font-mono text-[10px] font-bold"
              title="Export Missouri Spray Log (MP693)"
            >
              <FileDown size={16} />
              EXPORT LOG
            </button>
          )}
          {(tab === 'plant' || tab === 'harvest') && (
            <button
              onClick={() => tab === 'plant' ? exportFsa578Data(plantRecords, fields) : exportHarvestData(harvestRecords, fields)}
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
      </header>
      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1 overflow-x-auto no-scrollbar">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSelected(new Set()); }}
              className={`flex-1 min-w-[80px] touch-target flex items-center justify-center gap-1.5 rounded-md py-2.5 font-mono text-[10px] font-semibold transition-all ${tab === t.key ? `bg-muted ${t.color}` : 'text-muted-foreground'
                }`}
            >
              <t.icon size={14} />
              {t.label.toUpperCase()}
            </button>
          ))}
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
            <button
              key={r.id}
              onClick={() => toggle(r.id)}
              className={`w-full text-left bg-card border rounded-lg p-3 transition-all ${selected.has(r.id) ? 'border-destructive bg-destructive/5' : 'border-border'
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  {renderTitle(r.fieldName, r.plantDate || r.timestamp)}
                </div>
                <button
                  onClick={(e) => edit(e, r)}
                  className="ml-3 p-2 rounded-md hover:bg-plant/10 text-muted-foreground hover:text-plant transition-colors"
                >
                  <Pencil size={14} />
                </button>
              </div>
            </button>
          ))}

          {tab === 'spray' && filteredSpray.map(r => (
            <button
              key={r.id}
              onClick={() => toggle(r.id)}
              className={`w-full text-left bg-card border rounded-lg p-3 transition-all ${selected.has(r.id) ? 'border-destructive bg-destructive/5' : 'border-border'
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  {renderTitle(r.fieldName, r.sprayDate || r.timestamp)}
                </div>
                <button
                  onClick={(e) => edit(e, r)}
                  className="ml-3 p-2 rounded-md hover:bg-spray/10 text-muted-foreground hover:text-spray transition-colors"
                >
                  <Pencil size={14} />
                </button>
              </div>
            </button>
          ))}

          {tab === 'harvest' && filteredHarvest.map(r => (
            <button
              key={r.id}
              onClick={() => toggle(r.id)}
              className={`w-full text-left bg-card border rounded-lg p-3 transition-all ${selected.has(r.id) ? 'border-destructive bg-destructive/5' : 'border-border'
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  {renderTitle(r.fieldName, r.harvestDate || r.timestamp)}
                </div>
                <button
                  onClick={(e) => edit(e, r)}
                  className="ml-3 p-2 rounded-md hover:bg-harvest/10 text-muted-foreground hover:text-harvest transition-colors"
                >
                  <Pencil size={14} />
                </button>
              </div>
            </button>
          ))}

          {tab === 'hay' && filteredHay.map(r => (
            <button
              key={r.id}
              onClick={() => toggle(r.id)}
              className={`w-full text-left bg-card border rounded-lg p-3 transition-all ${selected.has(r.id) ? 'border-destructive bg-destructive/5' : 'border-border'
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  {renderTitle(r.fieldName, r.date || r.timestamp)}
                </div>
                <button
                  onClick={(e) => edit(e, r)}
                  className="ml-3 p-2 rounded-md hover:bg-harvest/10 text-muted-foreground hover:text-harvest transition-colors"
                >
                  <Pencil size={14} />
                </button>
              </div>
            </button>
          ))}

          {tab === 'fertilizer' && filteredFertilizer.map(r => (
            <button
              key={r.id}
              onClick={() => toggle(r.id)}
              className={`w-full text-left bg-card border rounded-lg p-3 transition-all ${selected.has(r.id) ? 'border-destructive bg-destructive/5' : 'border-border'
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  {renderTitle(r.fieldName, r.date)}
                </div>
                <button
                  onClick={(e) => edit(e, r)}
                  className="ml-3 p-2 rounded-md hover:bg-spray/10 text-muted-foreground hover:text-spray transition-colors"
                >
                  <Pencil size={14} />
                </button>
              </div>
            </button>
          ))}

          {tab === 'grain' && filteredGrain.map(m => (
            <button
              key={m.id}
              onClick={() => toggle(m.id)}
              className={`w-full text-left bg-card border rounded-lg p-3 transition-all ${selected.has(m.id) ? 'border-destructive bg-destructive/5' : 'border-border'
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  {renderTitle(m.binName, m.timestamp)}
                </div>
                <button
                  onClick={(e) => edit(e, m)}
                  className="ml-3 p-2 rounded-md hover:bg-muted/30 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil size={14} />
                </button>
              </div>
            </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border p-6 rounded-xl shadow-2xl max-w-sm w-full space-y-4">
            <h2 className="text-lg font-bold">Edit Grain Movement</h2>
            <p className="text-sm text-muted-foreground">Grain movement editing is currently handled by updating the source activity (Harvest). Direct movement editing coming soon.</p>
            <Button onClick={() => setEditingRecord(null)} className="w-full">Close</Button>
          </div>
        </div>
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
