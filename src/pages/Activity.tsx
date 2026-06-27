import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarm } from '@/store/farmStore';
import { ClipboardList, Trash2, FileDown, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import SyncStatusIndicator from '@/components/SyncStatusIndicator';
import { useQuickAdd } from '@/context/QuickAddContext';
import { native } from '@/lib/native';
import {
  ACTIVITY_ICONS,
  ACTIVITY_TEXT_COLORS,
} from '@/lib/activityIcons';
import { mergeBundledFsaTracts } from '@/lib/bundledFsaTracts';
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

const TAB_GROUPS: { group: string; tabs: { key: Tab; icon: React.ElementType; label: string; color: string }[] }[] = [
  { group: 'All', tabs: [{ key: 'all', icon: ClipboardList, label: 'All', color: 'text-foreground' }] },
  { group: 'Crop', tabs: [
    { key: 'plant', icon: ACTIVITY_ICONS.plant, label: 'Planting', color: ACTIVITY_TEXT_COLORS.plant },
    { key: 'harvest', icon: ACTIVITY_ICONS.harvest, label: 'Harvesting', color: ACTIVITY_TEXT_COLORS.harvest },
    { key: 'hay', icon: ACTIVITY_ICONS.hay, label: 'Hay', color: ACTIVITY_TEXT_COLORS.hay },
  ]},
  { group: 'Inputs', tabs: [
    { key: 'spray', icon: ACTIVITY_ICONS.spray, label: 'Spraying', color: ACTIVITY_TEXT_COLORS.spray },
    { key: 'fertilizer', icon: ACTIVITY_ICONS.fertilizer, label: 'Fertilizer', color: ACTIVITY_TEXT_COLORS.fertilizer },
    { key: 'tillage', icon: ACTIVITY_ICONS.tillage, label: 'Tillage', color: ACTIVITY_TEXT_COLORS.tillage },
  ]},
  { group: 'Logistics', tabs: [
    { key: 'grain', icon: ACTIVITY_ICONS.grain, label: 'Grain', color: ACTIVITY_TEXT_COLORS.grain },
  ]},
];



type EditableRecord = PlantRecord | SprayRecord | HarvestRecord | HayHarvestRecord | FertilizerApplication | GrainMovement | TillageRecord;

export default function Activity() {
  const navigate = useNavigate();
  const { openQuickAdd } = useQuickAdd();
  const {
    fields,
    cluAssignments,
    fsaTracts,
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
    viewingSeason,
    setViewingSeason,
    seasonOptions,
    deleteGrainMovements,
    farmName
  } = useFarm();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingRecord, setEditingRecord] = useState<EditableRecord | null>(null);
  const [editingRecordType, setEditingRecordType] = useState<ActivityRecord['type'] | null>(null);
  const [editingMode, setEditingMode] = useState<'edit' | 'duplicate'>('edit');

  const openModal = (type: ActivityRecord['type'], record: EditableRecord, mode: 'edit' | 'duplicate') => {
    setEditingRecord(record);
    setEditingRecordType(type);
    setEditingMode(mode);
  };

  const closeModal = () => {
    setEditingRecord(null);
    setEditingRecordType(null);
    setEditingMode('edit');
  };

  const { pending: pendingDeletes, requestDelete } = useUndoDelete<ActivityRecord[]>({
    onCommit: async (_ids, toDelete) => {
      const byType = toDelete.reduce((acc, r) => {
        acc[r.type] = acc[r.type] || [];
        acc[r.type].push(r.data.id);
        return acc;
      }, {} as Record<string, string[]>);

      const results = await Promise.all([
        byType.plant ? deletePlantRecords(byType.plant) : Promise.resolve(true),
        byType.spray ? deleteSprayRecords(byType.spray) : Promise.resolve(true),
        byType.harvest ? deleteHarvestRecords(byType.harvest) : Promise.resolve(true),
        byType.hay ? deleteHayHarvestRecords(byType.hay) : Promise.resolve(true),
        byType.fertilizer ? deleteFertilizerApplications(byType.fertilizer) : Promise.resolve(true),
        byType.tillage ? deleteTillageRecords(byType.tillage) : Promise.resolve(true),
        byType.grain ? deleteGrainMovements(byType.grain) : Promise.resolve(true),
      ]);

      if (results.some(r => !r)) {
        throw new Error('One or more deletions failed');
      }
    },
    onError: () => toast.error('Failed to delete records. They remain visible.'),
  });

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

  const visibleUnifiedRecords = useMemo(() => {
    const all: (ActivityRecord & { timestamp: number })[] = [
      ...filteredPlant.map(r => ({ type: 'plant' as const, data: r, timestamp: r.timestamp })),
      ...filteredSpray.map(r => ({ type: 'spray' as const, data: r, timestamp: r.timestamp })),
      ...filteredHarvest.map(r => ({ type: 'harvest' as const, data: r, timestamp: r.timestamp })),
      ...filteredHay.map(r => ({ type: 'hay' as const, data: r, timestamp: r.timestamp })),
      ...filteredFertilizer.map(r => ({ type: 'fertilizer' as const, data: r, timestamp: new Date(r.date).getTime() })),
      ...filteredTillage.map(r => ({ type: 'tillage' as const, data: r, timestamp: r.timestamp })),
      ...filteredGrain.map(r => ({ type: 'grain' as const, data: r, timestamp: r.timestamp })),
    ];
    return all.filter(r => !pendingDeletes.has(r.data.id)).sort((a, b) => b.timestamp - a.timestamp);
  }, [filteredPlant, filteredSpray, filteredHarvest, filteredHay, filteredFertilizer, filteredTillage, filteredGrain, pendingDeletes]);

  const handleDeleteRequest = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    const toDelete = visibleUnifiedRecords.filter(r => ids.includes(r.data.id));
    requestDelete(
      ids,
      `${ids.length} record${ids.length !== 1 ? 's' : ''} deleted`,
      toDelete
    );
    setSelected(new Set());
  };


  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-8">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border pb-0">
        <div className="max-w-lg mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3 lg:max-w-5xl lg:px-8">
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
                    {seasonOptions.map(y => (
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

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end flex-grow sm:flex-grow-0">
            <SyncStatusIndicator />

            <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
              {tab === 'spray' && (
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
                  <span className="hidden sm:inline">EXPORT LOG</span>
                  <span className="inline sm:hidden">EXPORT</span>
                </button>
              )}
              {(tab === 'plant' || tab === 'harvest') && (
                <button
                  onClick={() => {
                    const exportPromise = tab === 'plant'
                      ? exportFsa578Data(filteredPlant, fields, cluAssignments, mergeBundledFsaTracts(fsaTracts), {
                        farmName,
                        cropYear: viewingSeason,
                        reportDate: new Date().toISOString().split('T')[0],
                      })
                      : exportHarvestData(filteredHarvest, fields);

                    exportPromise.catch((error) => {
                      console.error('FSA export failed:', error);
                      toast.error('Failed to export FSA data. Please try again.');
                    });
                  }}
                  className="p-2.5 rounded-lg bg-plant/10 text-plant hover:bg-plant/20 transition-colors flex items-center gap-2 text-xs font-bold"
                  title={tab === 'plant' ? "Export FSA-578 Data Summary" : "Export Harvest Production Data"}
                >
                  <FileDown size={16} />
                  <span className="hidden sm:inline">FSA EXPORT</span>
                  <span className="inline sm:hidden">FSA</span>
                </button>
              )}
              {tab === 'hay' && (
                <button
                  onClick={() => navigate('/reports?tab=hay-summary')}
                  className="p-2.5 rounded-lg bg-harvest/10 text-harvest hover:bg-harvest/20 transition-colors flex items-center gap-2 text-xs font-bold"
                >
                  <FileDown size={16} />
                  <span className="hidden sm:inline">HAY SUMMARY</span>
                  <span className="inline sm:hidden">SUMMARY</span>
                </button>
              )}

              {tab !== 'grain' && (
                <button
                  onClick={() => {
                    native.haptic.light();
                    const map: Record<string, 'plant' | 'spray' | 'fertilizer' | 'tillage' | 'harvest' | 'hay'> = {
                      plant: 'plant',
                      spray: 'spray',
                      fertilizer: 'fertilizer',
                      tillage: 'tillage',
                      harvest: 'harvest',
                      hay: 'hay'
                    };
                    openQuickAdd(map[tab] || null);
                  }}
                  className="p-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5 text-xs font-bold shadow-sm"
                >
                  <Plus size={14} strokeWidth={2.5} />
                  <span>
                    {tab === 'all' && 'Log Activity'}
                    {tab === 'plant' && <><span className="hidden sm:inline">New </span>Planting</>}
                    {tab === 'spray' && <><span className="hidden sm:inline">New </span>Spray</>}
                    {tab === 'fertilizer' && <><span className="hidden sm:inline">New </span>Fertilizing</>}
                    {tab === 'tillage' && <><span className="hidden sm:inline">New </span>Tillage</>}
                    {tab === 'harvest' && <><span className="hidden sm:inline">New </span>Harvest</>}
                    {tab === 'hay' && <><span className="hidden sm:inline">New </span>Hay</>}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

      </header>
      <main className="max-w-lg mx-auto px-4 py-4 space-y-4 lg:max-w-5xl lg:px-8">
        {/* Tabs — grouped pills */}
        <div className="space-y-1.5 border-y border-border bg-card/50 py-2 px-4">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar lg:flex-wrap">
            {TAB_GROUPS.map(group => (
              <div key={group.group} className="flex items-center gap-1 flex-shrink-0">
                {group.tabs.map((t) => {
                  const count = t.key === 'all' ? visibleUnifiedRecords.length
                    : t.key === 'plant' ? filteredPlant.filter(r => !pendingDeletes.has(r.id)).length
                    : t.key === 'spray' ? filteredSpray.filter(r => !pendingDeletes.has(r.id)).length
                    : t.key === 'harvest' ? filteredHarvest.filter(r => !pendingDeletes.has(r.id)).length
                    : t.key === 'grain' ? filteredGrain.filter(r => !pendingDeletes.has(r.id)).length
                    : t.key === 'hay' ? filteredHay.filter(r => !pendingDeletes.has(r.id)).length
                    : t.key === 'tillage' ? filteredTillage.filter(r => !pendingDeletes.has(r.id)).length
                    : filteredFertilizer.filter(r => !pendingDeletes.has(r.id)).length;

                  const isActive = tab === t.key;

                  return (
                    <button
                      key={t.key}
                      onClick={() => {
                        if (isActive) setTab('all');
                        else setTab(t.key);
                        setSelected(new Set());
                      }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all text-xs font-bold ${isActive
                        ? 'ring-2 ring-primary bg-primary/10 text-primary shadow-sm'
                        : 'text-muted-foreground hover:bg-muted/50'
                        }`}
                    >
                      <t.icon size={14} className={isActive ? 'text-primary' : 'text-muted-foreground'} />
                      <span>{t.label}</span>
                      {count > 0 && (
                        <span className="bg-muted px-1.5 py-0.5 rounded-full text-[11px] font-bold text-muted-foreground">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
                {group.group !== 'Logistics' && <div className="w-px h-5 bg-border/60 mx-1 hidden sm:block" />}
              </div>
            ))}
          </div>
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
            onClick={handleDeleteRequest}
            className="touch-target w-full flex items-center justify-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg py-3 text-sm font-bold active:scale-95 transition-transform"
          >
            <Trash2 size={18} />
            Delete {selected.size} Record{selected.size > 1 ? 's' : ''}
          </button>
        )}

        {/* Records */}
        <div className="space-y-2">
          {tab === 'all' && <HistoryFeed records={visibleUnifiedRecords} selected={selected} onToggle={toggle} onEdit={(r) => openModal(r.type, r.data, 'edit')} onDuplicate={(r) => openModal(r.type, r.data, 'duplicate')} />}
          {tab === 'plant' && <PlantTab records={filteredPlant.filter(r => !pendingDeletes.has(r.id))} selected={selected} onToggle={toggle} onEdit={(r) => openModal('plant', r, 'edit')} onDuplicate={(r) => openModal('plant', r, 'duplicate')} />}
          {tab === 'spray' && <SprayTab records={filteredSpray.filter(r => !pendingDeletes.has(r.id))} selected={selected} onToggle={toggle} onEdit={(r) => openModal('spray', r, 'edit')} onDuplicate={(r) => openModal('spray', r, 'duplicate')} />}
          {tab === 'harvest' && <HarvestTab records={filteredHarvest.filter(r => !pendingDeletes.has(r.id))} selected={selected} onToggle={toggle} onEdit={(r) => openModal('harvest', r, 'edit')} onDuplicate={(r) => openModal('harvest', r, 'duplicate')} />}
          {tab === 'hay' && <HayTab records={filteredHay.filter(r => !pendingDeletes.has(r.id))} selected={selected} onToggle={toggle} onEdit={(r) => openModal('hay', r, 'edit')} onDuplicate={(r) => openModal('hay', r, 'duplicate')} />}
          {tab === 'fertilizer' && <FertilizerTab records={filteredFertilizer.filter(r => !pendingDeletes.has(r.id))} selected={selected} onToggle={toggle} onEdit={(r) => openModal('fertilizer', r, 'edit')} onDuplicate={(r) => openModal('fertilizer', r, 'duplicate')} />}
          {tab === 'tillage' && <TillageTab records={filteredTillage.filter(r => !pendingDeletes.has(r.id))} selected={selected} onToggle={toggle} onEdit={(r) => openModal('tillage', r, 'edit')} onDuplicate={(r) => openModal('tillage', r, 'duplicate')} />}
          {tab === 'grain' && <GrainTab records={filteredGrain.filter(r => !pendingDeletes.has(r.id))} selected={selected} onToggle={toggle} onEdit={(r) => openModal('grain', r, 'edit')} onDuplicate={(r) => openModal('grain', r, 'duplicate')} />}
        </div>
      </main>

      {editingRecordType === 'grain' && editingRecord && (
        <GrainMovementModal
          open={!!editingRecord}
          onClose={closeModal}
          initialData={editingRecord as GrainMovement}
          mode={editingMode}
        />
      )}

      {editingRecordType === 'plant' && editingRecord && (() => {
        const editField = getEditField((editingRecord as PlantRecord).fieldId);
        if (!editField) return <DeletedFieldFallback onClose={closeModal} />;
        return (
          <PlantModal
            open={!!editingRecord}
            onClose={closeModal}
            field={editField}
            initialData={editingRecord as PlantRecord}
            mode={editingMode}
          />
        );
      })()}

      {editingRecordType === 'spray' && editingRecord && (() => {
        const editField = getEditField((editingRecord as SprayRecord).fieldId);
        if (!editField) return <DeletedFieldFallback onClose={closeModal} />;
        return (
          <SprayModal
            open={!!editingRecord}
            onClose={closeModal}
            field={editField}
            initialData={editingRecord as SprayRecord}
            mode={editingMode}
          />
        );
      })()}

      {editingRecordType === 'harvest' && editingRecord && (() => {
        const editField = getEditField((editingRecord as HarvestRecord).fieldId);
        if (!editField) return <DeletedFieldFallback onClose={closeModal} />;
        return (
          <HarvestModal
            open={!!editingRecord}
            onClose={closeModal}
            field={editField}
            initialData={editingRecord as HarvestRecord}
            mode={editingMode}
          />
        );
      })()}

      {editingRecordType === 'hay' && editingRecord && (() => {
        const editField = getEditField((editingRecord as HayHarvestRecord).fieldId);
        if (!editField) return <DeletedFieldFallback onClose={closeModal} />;
        return (
          <HayModal
            open={!!editingRecord}
            onClose={closeModal}
            field={editField}
            initialData={editingRecord as HayHarvestRecord}
            mode={editingMode}
          />
        );
      })()}

      {editingRecordType === 'fertilizer' && editingRecord && (() => {
        const editField = getEditField((editingRecord as FertilizerApplication).fieldId);
        if (!editField) return <DeletedFieldFallback onClose={closeModal} />;
        return (
          <FertilizerModal
            open={!!editingRecord}
            onClose={closeModal}
            field={editField}
            initialData={editingRecord as FertilizerApplication}
            mode={editingMode}
          />
        );
      })()}

      {editingRecordType === 'tillage' && editingRecord && (() => {
        const editField = getEditField((editingRecord as TillageRecord).fieldId);
        if (!editField) return <DeletedFieldFallback onClose={closeModal} />;
        return (
          <TillageModal
            open={!!editingRecord}
            onClose={closeModal}
            field={editField}
            initialData={editingRecord as TillageRecord}
            mode={editingMode}
          />
        );
      })()}
    </div>
  );
}
