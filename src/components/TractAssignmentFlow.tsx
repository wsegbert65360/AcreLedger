import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Check, ChevronDown, ChevronUp, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useFarm } from '@/store/farmStore';
import { parseCluGeoJson } from '@/lib/cluImport';
import { loadTractData, parseTractKeys } from '@/lib/tractLookup';
import FsaTractImporter from '@/components/FsaTractImporter';
import CluAssignmentMap from '@/components/CluAssignmentMap';
import CluFieldSelector from '@/components/CluFieldSelector';
import type { CluLandUse, FieldCluAssignment, FsaTractImport } from '@/types/fsaTract';

interface TractAssignmentFlowProps {
  onDone?: () => void;
}

export default function TractAssignmentFlow({ onDone }: TractAssignmentFlowProps) {
  const {
    fields, fsaTracts, cluAssignments,
    addField, updateField, importTract, deleteTract,
    assignClu, updateCluLandUse, unassignClu,
  } = useFarm();

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [selectedLandUse, setSelectedLandUse] = useState<CluLandUse>('cropland');
  const [bundledTracts, setBundledTracts] = useState<FsaTractImport[]>([]);
  const [showTractList, setShowTractList] = useState(false);
  const reimportRef = useRef<HTMLInputElement>(null);
  const [reimportTarget, setReimportTarget] = useState<string | null>(null);

  const legacyTractKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const field of fields) {
      for (const key of parseTractKeys(field.fsaFarmNumber, field.fsaTractNumber)) {
        keys.add(key);
      }
    }
    return Array.from(keys).sort();
  }, [fields]);

  useEffect(() => {
    if (legacyTractKeys.length === 0) {
      setBundledTracts([]);
      return;
    }

    let cancelled = false;
    Promise.all(
      legacyTractKeys.map(async tractKey => ({
        tractKey,
        collections: await loadTractData([tractKey]),
      })),
    ).then(results => {
      if (cancelled) return;
      setBundledTracts(results.flatMap(({ tractKey, collections }) => collections.map(collection => ({
        id: `bundled-${tractKey}`,
        farmId: '',
        tractKey,
        filename: 'Bundled FSA tract',
        featureCount: collection.features.length,
        geojson: collection,
        importedAt: '',
        deletedAt: null,
      }))));
    }).catch(err => {
      console.error('[TractAssignmentFlow] Failed to load bundled tracts:', err);
      if (!cancelled) setBundledTracts([]);
    });

    return () => { cancelled = true; };
  }, [legacyTractKeys]);

  const editableTracts = useMemo(() => {
    const byKey = new Map<string, FsaTractImport>();
    for (const tract of bundledTracts) byKey.set(tract.tractKey, tract);
    for (const tract of fsaTracts) byKey.set(tract.tractKey, tract);
    return Array.from(byKey.values());
  }, [bundledTracts, fsaTracts]);

  const featureAcresByClu = useMemo(() => {
    const acres = new Map<string, number>();
    for (const tract of editableTracts) {
      for (const feature of tract.geojson.features) {
        if (!feature.properties.cluNumber) continue;
        acres.set(`${tract.tractKey}:${feature.properties.cluNumber}`, feature.properties.acres);
      }
    }
    return acres;
  }, [editableTracts]);

  const displayAssignments = useMemo<FieldCluAssignment[]>(() => {
    const persistedKeys = new Set(cluAssignments.map(a => `${a.tractKey}:${a.cluNumber}`));
    const legacyAssignments: FieldCluAssignment[] = [];

    for (const field of fields) {
      if (!field.cluNumbers?.length) continue;

      for (const tractKey of parseTractKeys(field.fsaFarmNumber, field.fsaTractNumber)) {
        for (const cluNumber of field.cluNumbers) {
          const key = `${tractKey}:${cluNumber}`;
          if (persistedKeys.has(key) || !featureAcresByClu.has(key)) continue;

          legacyAssignments.push({
            id: `legacy-${field.id}-${tractKey}-${cluNumber}`,
            farmId: field.farm_id || '',
            fieldId: field.id,
            tractKey,
            cluNumber,
            acres: featureAcresByClu.get(key) ?? 0,
            landUse: 'cropland',
            assignedAt: '',
            deletedAt: null,
          });
        }
      }
    }

    return [...cluAssignments, ...legacyAssignments];
  }, [cluAssignments, featureAcresByClu, fields]);

  const handleToggleClu = useCallback(async (tractKey: string, cluNumber: string, acres: number) => {
    if (!selectedFieldId) return;

    const existing = cluAssignments.find(
      a => a.fieldId === selectedFieldId && a.tractKey === tractKey && a.cluNumber === cluNumber,
    );
    const legacyExisting = displayAssignments.find(
      a => a.id.startsWith('legacy-') && a.fieldId === selectedFieldId && a.tractKey === tractKey && a.cluNumber === cluNumber,
    );

    if (existing) {
      if (existing.landUse !== selectedLandUse) {
        await updateCluLandUse(existing.id, selectedLandUse);
      } else {
        await unassignClu(selectedFieldId, tractKey, cluNumber);
      }
    } else {
      await assignClu(selectedFieldId, tractKey, cluNumber, legacyExisting?.acres ?? acres, selectedLandUse);
    }
  }, [selectedFieldId, selectedLandUse, cluAssignments, displayAssignments, assignClu, updateCluLandUse, unassignClu]);

  const handleCreateField = useCallback(async (name: string): Promise<string | null> => {
    let lat = 38.47, lng = -93.54;
    if (editableTracts.length > 0) {
      let sumLat = 0, sumLng = 0, n = 0;
      for (const tract of editableTracts) {
        for (const f of tract.geojson.features) {
          const ring = f.geometry.coordinates[0];
          if (!ring) continue;
          for (const c of ring) { sumLng += c[0]; sumLat += c[1]; n++; }
        }
      }
      if (n > 0) { lat = sumLat / n; lng = sumLng / n; }
    }

    const id = crypto.randomUUID();
    const ok = await addField({ name, acreage: 0, lat, lng, farm_id: '' }, id);
    if (!ok) return null;

    return id;
  }, [editableTracts, addField]);

  const persistFieldAssignments = useCallback(async (
    assignments: typeof cluAssignments,
  ): Promise<boolean> => {
    const fieldUpdates = new Map<string, { cluNumbers: string[]; acres: number }>();

    for (const field of fields) {
      if (field.cluNumbers?.length) {
        fieldUpdates.set(field.id, { cluNumbers: [], acres: 0 });
      }
    }

    for (const a of assignments) {
      if (a.deletedAt) continue;
      const existing = fieldUpdates.get(a.fieldId) || { cluNumbers: [], acres: 0 };
      existing.cluNumbers.push(a.cluNumber);
      existing.acres += a.acres;
      fieldUpdates.set(a.fieldId, existing);
    }

    let updated = 0;
    let failed = 0;
    for (const [fieldId, { cluNumbers, acres }] of fieldUpdates) {
      const field = fields.find(f => f.id === fieldId);
      if (!field) continue;
      const ok = await updateField({
        ...field,
        cluNumbers,
        acreage: Math.round(acres * 100) / 100,
      });
      if (ok) updated++;
      else failed++;
    }

    if (updated > 0) toast.success(`${updated} field${updated > 1 ? 's' : ''} updated`);
    if (failed > 0) {
      toast.error(`${failed} field${failed > 1 ? 's' : ''} could not be updated`);
      return false;
    }
    return true;
  }, [fields, updateField]);

  const handleDone = useCallback(async () => {
    const saved = await persistFieldAssignments(cluAssignments);
    if (!saved) return;
    onDone?.();
  }, [cluAssignments, persistFieldAssignments, onDone]);

  const handleDeleteTract = useCallback(async (tractId: string) => {
    const tract = fsaTracts.find(t => t.id === tractId);
    const assignedCount = cluAssignments.filter(a => a.tractKey === tract?.tractKey).length;

    if (assignedCount > 0) {
      const confirmed = window.confirm(
        `This tract has ${assignedCount} CLU assignment${assignedCount > 1 ? 's' : ''} that will also be removed. Continue?`,
      );
      if (!confirmed) return;
    }

    const deleted = await deleteTract(tractId);
    if (deleted && tract) {
      const remainingAssignments = cluAssignments.filter(a => a.tractKey !== tract.tractKey);
      await persistFieldAssignments(remainingAssignments);
    }
  }, [fsaTracts, cluAssignments, deleteTract, persistFieldAssignments]);

  const handleReimport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !reimportTarget) { setReimportTarget(null); return; }

    try {
      const contents = await file.text();
      const { collection } = parseCluGeoJson(contents, file.name);
      const target = fsaTracts.find(tract => tract.id === reimportTarget);
      if (!target) throw new Error('The tract being replaced could not be found.');
      await importTract(target.tractKey, file.name, collection, collection.features.length);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse file');
    }

    setReimportTarget(null);
    if (reimportRef.current) reimportRef.current.value = '';
  }, [reimportTarget, fsaTracts, importTract]);

  const tractAssignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of cluAssignments) {
      counts.set(a.tractKey, (counts.get(a.tractKey) || 0) + 1);
    }
    return counts;
  }, [cluAssignments]);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 p-3 border-b border-border flex items-center justify-between bg-background">
        <FsaTractImporter />
        <div className="text-xs text-muted-foreground">
          {editableTracts.length} tract{editableTracts.length !== 1 ? 's' : ''} available, {displayAssignments.length} CLU{displayAssignments.length !== 1 ? 's' : ''} assigned
        </div>
      </div>

      {fsaTracts.length > 0 && (
        <div className="shrink-0 border-b border-border">
          <button
            onClick={() => setShowTractList(prev => !prev)}
            className="w-full px-3 py-2 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Imported tracts ({fsaTracts.length})</span>
            {showTractList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showTractList && (
            <div className="max-h-40 overflow-y-auto border-t border-border">
              {fsaTracts.map(tract => (
                <div key={tract.id} className="px-3 py-2 flex items-center justify-between text-sm border-b border-border last:border-b-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{tract.tractKey}</div>
                    <div className="text-xs text-muted-foreground">
                      {tract.featureCount} CLUs
                      {tractAssignmentCounts.has(tract.tractKey) && (
                        <span className="ml-2">({tractAssignmentCounts.get(tract.tractKey)} assigned)</span>
                      )}
                      <span className="ml-2">{tract.filename}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Replace with new file"
                      onClick={() => {
                        setReimportTarget(tract.id);
                        reimportRef.current?.click();
                      }}
                    >
                      <RefreshCw size={13} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      title="Delete tract"
                      onClick={() => handleDeleteTract(tract.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <input
        ref={reimportRef}
        type="file"
        accept=".json,.geojson"
        className="hidden"
        onChange={handleReimport}
      />

      <div className="relative flex-1 min-h-0">
        <CluAssignmentMap
          tracts={editableTracts}
          assignments={displayAssignments}
          selectedFieldId={selectedFieldId}
          selectedLandUse={selectedLandUse}
          onToggleClu={handleToggleClu}
        />
        <CluFieldSelector
          selectedFieldId={selectedFieldId}
          onSelectField={setSelectedFieldId}
          selectedLandUse={selectedLandUse}
          onSelectLandUse={setSelectedLandUse}
          onCreateField={handleCreateField}
          assignments={displayAssignments}
        />
      </div>

      {(editableTracts.length > 0 || fields.some(field => field.cluNumbers?.length)) && (
        <div className="shrink-0 p-3 border-t border-border">
          <Button onClick={handleDone} className="w-full gap-2">
            <Check size={16} />
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
