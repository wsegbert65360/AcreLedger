import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarm } from '@/store/farmStore';
import BottomNav from '@/components/BottomNav';
import { ClipboardList, Leaf, CloudRain, Wheat, Trash2, Warehouse, FileDown, Tractor, Sprout } from 'lucide-react';
import { exportFsa578Data, exportHarvestData } from '@/lib/complianceReports';
import { generateSprayPDF } from '@/lib/sprayExport';
import type { 
  PlantRecord, SprayRecord, HarvestRecord, HayHarvestRecord, 
  FertilizerApplication, GrainMovement, TillageRecord, ActivityRecord 
} from '@/types/farm';
import PlantModal from '@/components/PlantModal';
import SprayModal from '@/components/SprayModal';
import HarvestModal from '@/components/HarvestModal';
import HayModal from '@/components/HayModal';
import FertilizerModal from '@/components/FertilizerModal';
import TillageModal from '@/components/TillageModal';
import GrainMovementModal from '@/components/GrainMovementModal';
import DeletedFieldFallback from '@/components/DeletedFieldFallback';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
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

// Tab Components
import PlantTab from '@/components/activity/PlantTab';
import SprayTab from '@/components/activity/SprayTab';
import HarvestTab from '@/components/activity/HarvestTab';
import HayTab from '@/components/activity/HayTab';
import FertilizerTab from '@/components/activity/FertilizerTab';
import TillageTab from '@/components/activity/TillageTab';
import GrainTab from '@/components/activity/GrainTab';
import HistoryFeed from '@/components/activity/HistoryFeed';

type Tab = 'all' | 'plant' | 'spray' | 'fertilizer' | 'tillage' | 'harvest' | 'hay' | 'grain';

const TABS: { key: Tab; icon: React.ElementType; label: string; color: string }[] = [
  { key: 'all', icon: ClipboardList, label: 'All', color: 'text-foreground' },
  { key: 'plant', icon: Leaf, label: 'Planting', color: 'text-plant' },
  { key: 'spray', icon: CloudRain, label: 'Spraying', color: 'text-spray' },
  { key: 'fertilizer', icon: Sprout, label: 'Fertilizer', color: 'text-lime-600 dark:text-lime-400' },
  { key: 'harvest', icon: Wheat, label: 'Harvesting', color: 'text-harvest' },
  { key: 'hay', icon: Tractor, label: 'Hay/Forage', color: 'text-orange-700 dark:text-orange-400' },
  { key: 'grain', icon: Warehouse, label: 'Grain', color: 'text-harvest' },
  { key: 'tillage', icon: Tractor, label: 'Tillage', color: 'text-orange-600' },
];

type EditableRecord = PlantRecord | SprayRecord | HarvestRecord | HayHarvestRecord | FertilizerApplication | GrainMovement | TillageRecord;

export default function Activity() {
  const navigate = useNavigate();
  const {
    fields,
    plantRecords,
    sprayRecords,
    harvestRecords,
    hayHarvestRecords,
    fertilizerApplications,
    tillageRecords,
    grainMovements,
    deletePlantRecords,
    deleteSprayRecords,
    deleteHarvestRecords,
    deleteHayHarvestRecords,
    deleteFertilizerApplications,
    deleteTillageRecords,
    activeSeason,
    viewingSeason,
    setViewingSeason,
    deleteGrainMovements,
    farmName
  } = useFarm();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EditableRecord | null>(null);

  const getEditField = (fieldId: string) =>
    fields.find(f => f.id === fieldId && !f.deleted_at) ?? null;

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredPlant = useMemo(() =>
    plantRecords
      .filter(r => !r.deleted_at && r.seasonYear === viewingSeason && (r.fieldName.toLowerCase().includes(search.toLowerCase()) || r.seedVariety.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => b.timestamp - a.timestamp),
    [plantRecords, search, viewingSeason]
  );

  const filteredSpray = useMemo(() =>
    sprayRecords
      .filter(r => !r.deleted_at && r.seasonYear === viewingSeason && (r.fieldName.toLowerCase().includes(search.toLowerCase()) || r.products?.some(p => p.product.toLowerCase().includes(search.toLowerCase()))))
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
      .filter(r => !r.deleted_at && r.seasonYear === viewingSeason && (r.fieldName.toLowerCase().includes(search.toLowerCase()) || r.fertilizer_formula.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [fertilizerApplications, search, viewingSeason]
  );

  const filteredTillage = useMemo(() =>
    tillageRecords
      .filter(r => !r.deleted_at && r.seasonYear === viewingSeason && (r.fieldName.toLowerCase().includes(search.toLowerCase()) || r.implementType.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => b.timestamp - a.timestamp),
    [tillageRecords, search, viewingSeason]
  );

  const unifiedRecords = useMemo(() => {
    const all: (ActivityRecord & { timestamp: number })[] = [
      ...filteredPlant.map(r => ({ type: 'plant' as const, data: r, timestamp: r.timestamp })),
      ...filteredSpray.map(r => ({ type: 'spray' as const, data: r, timestamp: r.timestamp })),
      ...filteredHarvest.map(r => ({ type: 'harvest' as const, data: r, timestamp: r.timestamp })),
      ...filteredHay.map(r => ({ type: 'hay' as const, data: r, timestamp: r.timestamp })),
      ...filteredFertilizer.map(r => ({ type: 'fertilizer' as const, data: r, timestamp: new Date(r.date).getTime() })),
      ...filteredTillage.map(r => ({ type: 'tillage' as const, data: r, timestamp: r.timestamp })),
      ...filteredGrain.map(r => ({ type: 'grain' as const, data: r, timestamp: r.timestamp })),
    ];
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }, [filteredPlant, filteredSpray, filteredHarvest, filteredHay, filteredFertilizer, filteredTillage, filteredGrain]);

  const handleDelete = async () => {
    const ids = Array.from(selected);
    
    const toDelete = unifiedRecords.filter(r => ids.includes(r.data.id));
    const byType = toDelete.reduce((acc, r) => {
      acc[r.type] = acc[r.type] || [];
      acc[r.type].push(r.data.id);
      return acc;
    }, {} as Record<string, string[]>);

    await Promise.all([
      byType.plant ? deletePlantRecords(byType.plant) : Promise.resolve(true),
      byType.spray ? deleteSprayRecords(byType.spray) : Promise.resolve(true),
      byType.harvest ? deleteHarvestRecords(byType.harvest) : Promise.resolve(true),
      byType.hay ? deleteHayHarvestRecords(byType.hay) : Promise.resolve(true),
      byType.fertilizer ? deleteFertilizerApplications(byType.fertilizer) : Promise.resolve(true),
      byType.tillage ? deleteTillageRecords(byType.tillage) : Promise.resolve(true),
      byType.grain ? deleteGrainMovements(byType.grain) : Promise.resolve(true),
    ]);

    setSelected(new Set());
    setConfirmDelete(false);
  };

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-8">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border pb-0">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between lg:max-w-5xl lg:px-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ClipboardList size={20} className="text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-foreground tracking-tight">Activity</h1>
                <Select
                  value={viewingSeason.toString()}
                  onValueChange={(v) => setViewingSeason(parseInt(v, 10))}
                >
                  <SelectTrigger className="h-7 min-w-[80px] bg-muted border-none font-mono text-xs font-bold py-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[activeSeason, activeSeason - 1, activeSeason - 2].map(y => (
                      <SelectItem key={y} value={y.toString()} className="font-mono text-xs">
                        {y} SEASON
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">Review & manage</p>
            </div>
          </div>

          {tab === 'spray' && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const toExport = selected.size > 0 
                    ? filteredSpray.filter(r => selected.has(r.id))
                    : filteredSpray;
                  generateSprayPDF(toExport, farmName);
                }}
                className="p-2.5 rounded-lg bg-spray/10 text-spray hover:bg-spray/20 transition-colors flex items-center gap-2 text-xs font-bold"
                title="Export Universal Spray Log PDF"
              >
                <FileDown size={16} />
                EXPORT LOG
              </button>
            </div>
          )}
          {(tab === 'plant' || tab === 'harvest') && (
            <button
              onClick={() => tab === 'plant' ? exportFsa578Data(filteredPlant, fields) : exportHarvestData(filteredHarvest, fields)}
              className="p-2.5 rounded-lg bg-plant/10 text-plant hover:bg-plant/20 transition-colors flex items-center gap-2 text-xs font-bold"
              title={tab === 'plant' ? "Export FSA-578 Data Summary" : "Export Harvest Production Data"}
            >
              <FileDown size={16} />
              FSA EXPORT
            </button>
          )}
          {tab === 'hay' && (
            <button
              onClick={() => navigate('/reports?tab=hay-summary')}
              className="p-2.5 rounded-lg bg-harvest/10 text-harvest hover:bg-harvest/20 transition-colors flex items-center gap-2 text-xs font-bold"
            >
              <FileDown size={16} />
              HAY SUMMARY
            </button>
          )}
        </div>

      </header>
      <main className="max-w-lg mx-auto px-4 py-4 space-y-4 lg:max-w-5xl lg:px-8">
        {/* Tabs */}
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar py-2 px-4 border-y border-border bg-card/50 lg:flex-wrap">
          {TABS.map(t => {
            const count = t.key === 'all' ? unifiedRecords.length
              : t.key === 'plant' ? filteredPlant.length
              : t.key === 'spray' ? filteredSpray.length
              : t.key === 'harvest' ? filteredHarvest.length
              : t.key === 'grain' ? filteredGrain.length
              : t.key === 'hay' ? filteredHay.length
              : t.key === 'tillage' ? filteredTillage.length
              : filteredFertilizer.length;

            const isActive = tab === t.key;

            return (
              <button
                key={t.key}
                onClick={() => {
                  if (isActive) setTab('all');
                  else setTab(t.key);
                  setSelected(new Set());
                }}
                className={`flex-shrink-0 h-[48px] flex items-center justify-center gap-2 px-4 rounded-xl transition-all text-xs uppercase tracking-widest ${isActive
                  ? 'ring-2 ring-primary bg-primary/10 text-primary font-black shadow-sm'
                  : 'text-muted-foreground font-bold hover:bg-muted/50'
                  }`}
              >
                <t.icon size={16} className={isActive ? 'text-primary' : 'text-muted-foreground'} />
                <span className="flex items-center gap-2">
                  {t.label}
                    <span className="bg-muted px-2 py-0.5 rounded-full text-xs font-bold text-muted-foreground">
                      {count}
                    </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Label htmlFor="activitySearch" className="sr-only">Search Records</Label>
          <input
            id="activitySearch"
            name="activitySearch"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search records..."
            aria-label="Search records"
            className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Bulk delete */}
        {selected.size > 0 && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="touch-target w-full flex items-center justify-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg py-3 text-sm font-bold active:scale-95 transition-transform"
          >
            <Trash2 size={18} />
            Delete {selected.size} Record{selected.size > 1 ? 's' : ''}
          </button>
        )}

        {/* Records */}
        <div className="space-y-2">
          {tab === 'all' && <HistoryFeed records={unifiedRecords} selected={selected} onToggle={toggle} onEdit={setEditingRecord} />}
          {tab === 'plant' && <PlantTab records={filteredPlant} selected={selected} onToggle={toggle} onEdit={setEditingRecord} />}
          {tab === 'spray' && <SprayTab records={filteredSpray} selected={selected} onToggle={toggle} onEdit={setEditingRecord} />}
          {tab === 'harvest' && <HarvestTab records={filteredHarvest} selected={selected} onToggle={toggle} onEdit={setEditingRecord} />}
          {tab === 'hay' && <HayTab records={filteredHay} selected={selected} onToggle={toggle} onEdit={setEditingRecord} />}
          {tab === 'fertilizer' && <FertilizerTab records={filteredFertilizer} selected={selected} onToggle={toggle} onEdit={setEditingRecord} />}
          {tab === 'tillage' && <TillageTab records={filteredTillage} selected={selected} onToggle={toggle} onEdit={setEditingRecord} />}
          {tab === 'grain' && <GrainTab records={filteredGrain} selected={selected} onToggle={toggle} onEdit={setEditingRecord} />}
        </div>
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
          initialData={editingRecord as GrainMovement}
        />
      )}
      <BottomNav />

      {tab === 'plant' && editingRecord && (() => {
        const editField = getEditField((editingRecord as PlantRecord).fieldId);
        if (!editField) return <DeletedFieldFallback onClose={() => setEditingRecord(null)} />;
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
        const editField = getEditField((editingRecord as SprayRecord).fieldId);
        if (!editField) return <DeletedFieldFallback onClose={() => setEditingRecord(null)} />;
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
        const editField = getEditField((editingRecord as HarvestRecord).fieldId);
        if (!editField) return <DeletedFieldFallback onClose={() => setEditingRecord(null)} />;
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
        const editField = getEditField((editingRecord as HayHarvestRecord).fieldId);
        if (!editField) return <DeletedFieldFallback onClose={() => setEditingRecord(null)} />;
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
        if (!editField) return <DeletedFieldFallback onClose={() => setEditingRecord(null)} />;
        return (
          <FertilizerModal
            open={!!editingRecord}
            onClose={() => setEditingRecord(null)}
            field={editField}
            initialData={editingRecord as FertilizerApplication}
          />
        );
      })()}
      {tab === 'tillage' && editingRecord && (() => {
        const editField = getEditField((editingRecord as TillageRecord).fieldId);
        if (!editField) return <DeletedFieldFallback onClose={() => setEditingRecord(null)} />;
        return (
          <TillageModal
            open={!!editingRecord}
            onClose={() => setEditingRecord(null)}
            field={editField}
            initialData={editingRecord as TillageRecord}
          />
        );
      })()}
    </div>
  );
}
