import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Check, ChevronDown, ChevronUp, Trash2, RefreshCw, FileUp, HelpCircle, ExternalLink, Mail, Info, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import { useFarm } from '@/store/farmStore';
import { parseCluGeoJson } from '@/lib/cluImport';
import { loadTractData, parseTractKeys } from '@/lib/tractLookup';
import { cn } from '@/lib/utils';
import FsaTractImporter from '@/components/FsaTractImporter';
import CluAssignmentMap from '@/components/CluAssignmentMap';
import CluFieldSelector from '@/components/CluFieldSelector';
import type { CluLandUse, FieldCluAssignment, FsaTractImport } from '@/types/fsaTract';
import { getCentroid } from '@/lib/geoHelpers';

interface TractAssignmentFlowProps {
  onDone?: () => void;
  initialFieldId?: string | null;
}

function hasSameCluNumbers(left: string[] = [], right: string[] = []): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

export default function TractAssignmentFlow({ onDone, initialFieldId }: TractAssignmentFlowProps) {
  const {
    fields, fsaTracts, cluAssignments,
    addField, updateField, importTract, deleteTract,
    assignClu, updateCluLandUse, unassignClu,
  } = useFarm();

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(initialFieldId ?? null);

  useEffect(() => {
    if (initialFieldId) {
      setSelectedFieldId(initialFieldId);
    }
  }, [initialFieldId]);
  const [selectedLandUse, setSelectedLandUse] = useState<CluLandUse>('cropland');
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);
  const [focusedUnassignedIndex, setFocusedUnassignedIndex] = useState(0);
  const [focusedUnassignedKey, setFocusedUnassignedKey] = useState<string | null>(null);
  const [bundledTracts, setBundledTracts] = useState<FsaTractImport[]>([]);
  const [showTractList, setShowTractList] = useState(false);
  const reimportRef = useRef<HTMLInputElement>(null);
  const [reimportTarget, setReimportTarget] = useState<string | null>(null);

  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const cluAssignmentsRef = useRef(cluAssignments);
  cluAssignmentsRef.current = cluAssignments;

  const displayAssignmentsRef = useRef<FieldCluAssignment[]>([]);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isDialogDragActive, setIsDialogDragActive] = useState(false);
  const [tractToDelete, setTractToDelete] = useState<string | null>(null);
  const dialogFileInputRef = useRef<HTMLInputElement>(null);

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

  const persistedAssignmentKeys = useMemo(
    () => new Set(cluAssignments.filter(a => !a.deletedAt).map(a => `${a.tractKey}:${a.cluNumber}`)),
    [cluAssignments],
  );

  const displayAssignments = useMemo<FieldCluAssignment[]>(() => {
    const legacyAssignments: FieldCluAssignment[] = [];

    for (const field of fields) {
      if (!field.cluNumbers?.length) continue;

      for (const tractKey of parseTractKeys(field.fsaFarmNumber, field.fsaTractNumber)) {
        for (const cluNumber of field.cluNumbers) {
          const key = `${tractKey}:${cluNumber}`;
          if (persistedAssignmentKeys.has(key) || !featureAcresByClu.has(key)) continue;

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
  }, [persistedAssignmentKeys, cluAssignments, featureAcresByClu, fields]);

  displayAssignmentsRef.current = displayAssignments;

  const displayAssignmentKeys = useMemo(
    () => new Set(displayAssignments.filter(a => !a.deletedAt).map(a => `${a.tractKey}:${a.cluNumber}`)),
    [displayAssignments],
  );

  const availableCluCount = featureAcresByClu.size;
  const assignedCluCount = displayAssignmentKeys.size;
  const unassignedCluCount = Math.max(0, availableCluCount - displayAssignmentKeys.size);
  const unassignedCluKeys = useMemo(
    () => Array.from(featureAcresByClu.keys())
      .filter(key => !displayAssignmentKeys.has(key))
      .sort(),
    [featureAcresByClu, displayAssignmentKeys],
  );
  useEffect(() => {
    if (focusedUnassignedIndex >= unassignedCluKeys.length) {
      setFocusedUnassignedIndex(0);
    }
  }, [focusedUnassignedIndex, unassignedCluKeys.length]);

  useEffect(() => {
    if (unassignedCluKeys.length === 0 && showUnassignedOnly) {
      setShowUnassignedOnly(false);
    }
  }, [showUnassignedOnly, unassignedCluKeys.length]);

  useEffect(() => {
    if (focusedUnassignedKey && !unassignedCluKeys.includes(focusedUnassignedKey)) {
      setFocusedUnassignedKey(null);
    }
  }, [focusedUnassignedKey, unassignedCluKeys]);

  const syncFieldAcreageAndClus = useCallback(async (fieldId: string, nextAssignments: { cluNumber: string; acres: number }[]) => {
    const field = fieldsRef.current.find(f => f.id === fieldId);
    if (!field) return;

    const cluNumbers = nextAssignments.map(a => a.cluNumber);

    if (hasSameCluNumbers(field.cluNumbers ?? [], cluNumbers)) {
      return;
    }

    await updateField({
      ...field,
      cluNumbers,
    });
  }, [updateField]);

  const getFieldAssignmentsWithDelta = useCallback((
    fieldId: string,
    delta: {
      remove?: { tractKey: string; cluNumber: string };
      add?: { fieldId: string; tractKey: string; cluNumber: string; acres: number };
    } = {},
  ) => {
    const activeAssignments = displayAssignmentsRef.current.filter(a => !a.deletedAt);
    const withoutRemoved = delta.remove
      ? activeAssignments.filter(a => !(a.tractKey === delta.remove?.tractKey && a.cluNumber === delta.remove?.cluNumber))
      : activeAssignments;
    const pendingAssignment: FieldCluAssignment | null = delta.add
      ? {
          id: `pending-${delta.add.fieldId}-${delta.add.tractKey}-${delta.add.cluNumber}`,
          farmId: '',
          fieldId: delta.add.fieldId,
          tractKey: delta.add.tractKey,
          cluNumber: delta.add.cluNumber,
          acres: delta.add.acres,
          landUse: selectedLandUse,
          assignedAt: '',
          deletedAt: null,
        }
      : null;
    const nextAssignments = pendingAssignment ? [...withoutRemoved, pendingAssignment] : withoutRemoved;

    return nextAssignments.filter(a => a.fieldId === fieldId);
  }, [selectedLandUse]);

  const handleToggleClu = useCallback(async (
    tractKey: string, cluNumber: string, acres: number
  ) => {
    if (!selectedFieldId) return;

    const existing = cluAssignmentsRef.current.find(
      a => a.fieldId === selectedFieldId && a.tractKey === tractKey && a.cluNumber === cluNumber && !a.deletedAt,
    );
    const legacyExisting = displayAssignmentsRef.current.find(
      a => a.id.startsWith('legacy-') && a.tractKey === tractKey && a.cluNumber === cluNumber,
    );

    // Find if assigned to any other field
    const otherExisting = cluAssignmentsRef.current.find(
      a => a.fieldId !== selectedFieldId && a.tractKey === tractKey && a.cluNumber === cluNumber && !a.deletedAt,
    );

    if (existing) {
      if (existing.landUse !== selectedLandUse) {
        const ok = await updateCluLandUse(existing.id, selectedLandUse);
        if (!ok) return;
      } else {
        const ok = await unassignClu(selectedFieldId, tractKey, cluNumber);
        if (!ok) return;
        const remaining = getFieldAssignmentsWithDelta(selectedFieldId, {
          remove: { tractKey, cluNumber },
        });
        await syncFieldAcreageAndClus(selectedFieldId, remaining);
      }
    } else if (legacyExisting) {
      if (legacyExisting.fieldId === selectedFieldId) {
        // Promote same field
        const ok = await assignClu(selectedFieldId, tractKey, cluNumber, legacyExisting.acres, selectedLandUse);
        if (!ok) return;
        const promotedAssignments = getFieldAssignmentsWithDelta(selectedFieldId);
        await syncFieldAcreageAndClus(selectedFieldId, promotedAssignments);
      } else {
        // Promote & reassign to selected field
        const ok = await assignClu(selectedFieldId, tractKey, cluNumber, legacyExisting.acres, selectedLandUse);
        if (!ok) return;

        const oldRemaining = getFieldAssignmentsWithDelta(legacyExisting.fieldId, {
          remove: { tractKey, cluNumber },
        });
        await syncFieldAcreageAndClus(legacyExisting.fieldId, oldRemaining);

        const selectedNext = getFieldAssignmentsWithDelta(selectedFieldId, {
          remove: { tractKey, cluNumber },
          add: { fieldId: selectedFieldId, tractKey, cluNumber, acres: legacyExisting.acres },
        });
        await syncFieldAcreageAndClus(selectedFieldId, selectedNext);
      }
    } else {
      // Assign new CLU
      const ok = await assignClu(selectedFieldId, tractKey, cluNumber, acres, selectedLandUse);
      if (!ok) return;

      const selectedNext = getFieldAssignmentsWithDelta(selectedFieldId, {
        remove: { tractKey, cluNumber },
        add: { fieldId: selectedFieldId, tractKey, cluNumber, acres },
      });
      await syncFieldAcreageAndClus(selectedFieldId, selectedNext);

      // If assigned to another field, sync that field too (remove this CLU)
      if (otherExisting) {
        const otherRemaining = getFieldAssignmentsWithDelta(otherExisting.fieldId, {
          remove: { tractKey, cluNumber },
        });
        await syncFieldAcreageAndClus(otherExisting.fieldId, otherRemaining);
      }
    }
  }, [
    selectedFieldId,
    selectedLandUse,
    assignClu,
    updateCluLandUse,
    unassignClu,
    getFieldAssignmentsWithDelta,
    syncFieldAcreageAndClus
  ]);

  const handleCreateField = useCallback(async (name: string): Promise<string | null> => {
    let lat = 38.47, lng = -93.54;
    if (editableTracts.length > 0) {
      const allFeats = editableTracts.flatMap(t => t.geojson.features);
      const [latVal, lngVal] = getCentroid(allFeats);
      lat = latVal;
      lng = lngVal;
    }

    const id = crypto.randomUUID();
    const ok = await addField({ name, acreage: 0, lat, lng, farm_id: '', deleted_at: null }, id);
    if (!ok) return null;

    return id;
  }, [editableTracts, addField]);

  const handleDone = useCallback(async () => {
    onDone?.();
  }, [onDone]);

  const executeDeleteTract = useCallback(async (tractId: string) => {
    const tract = fsaTracts.find(t => t.id === tractId);
    const deleted = await deleteTract(tractId);
    if (deleted && tract) {
      const affectedFieldIds = new Set<string>();
      for (const assignment of displayAssignments) {
        if (!assignment.deletedAt && assignment.tractKey === tract.tractKey) {
          affectedFieldIds.add(assignment.fieldId);
        }
      }

      const remainingAssignments = displayAssignments.filter(a => !a.deletedAt && a.tractKey !== tract.tractKey);
      for (const fieldId of affectedFieldIds) {
        const fieldRemaining = remainingAssignments.filter(a => a.fieldId === fieldId);
        await syncFieldAcreageAndClus(fieldId, fieldRemaining);
      }
    }
  }, [fsaTracts, displayAssignments, deleteTract, syncFieldAcreageAndClus]);

  const handleDeleteTract = useCallback(async (tractId: string) => {
    const tract = fsaTracts.find(t => t.id === tractId);
    const assignedCount = displayAssignments.filter(a => !a.deletedAt && a.tractKey === tract?.tractKey).length;

    if (assignedCount > 0) {
      setTractToDelete(tractId);
    } else {
      await executeDeleteTract(tractId);
    }
  }, [fsaTracts, displayAssignments, executeDeleteTract]);

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

  const handleImportFiles = useCallback(async (files: FileList | File[] | null) => {
    if (!files?.length) return;

    let imported = 0;
    for (const file of Array.from(files)) {
      try {
        const contents = await file.text();
        const { tractKey, collection } = parseCluGeoJson(contents, file.name);

        const ok = await importTract(tractKey, file.name, collection, collection.features.length);
        if (ok) imported++;
      } catch (err) {
        toast.error(`${file.name}: ${err instanceof Error ? err.message : 'Failed to parse'}`);
      }
    }

    if (imported > 0) {
      toast.success(`${imported} tract${imported > 1 ? 's' : ''} imported successfully`);
      setIsGuideOpen(false);
    }
  }, [importTract]);

  const handleEmptyStateImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await handleImportFiles(e.target.files);
    }
  }, [handleImportFiles]);

  const handleDialogDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDialogDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDialogDragActive(false);
    }
  }, []);

  const handleDialogDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDialogDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImportFiles(e.dataTransfer.files);
    }
  }, [handleImportFiles]);

  const tractAssignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of displayAssignments) {
      if (a.deletedAt) continue;
      counts.set(a.tractKey, (counts.get(a.tractKey) || 0) + 1);
    }
    return counts;
  }, [displayAssignments]);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 p-3 border-b border-border bg-background space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FsaTractImporter />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsGuideOpen(true)}
              className="gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <HelpCircle size={15} />
              <span>Import Guide</span>
            </Button>
          </div>
          <div className="text-xs text-muted-foreground text-right">
            {editableTracts.length} tract{editableTracts.length !== 1 ? 's' : ''} available, {assignedCluCount} CLU{assignedCluCount !== 1 ? 's' : ''} assigned, {unassignedCluCount} unassigned
          </div>
        </div>

        {editableTracts.length === 0 && (
          <div className="space-y-4 my-2">
            {/* Upload Zone */}
            <div
              onClick={() => document.getElementById('empty-state-file-input')?.click()}
              className="border-2 border-dashed border-primary/30 hover:border-primary/50 bg-primary/5 hover:bg-primary/10 rounded-2xl p-6 text-center cursor-pointer transition-all space-y-2.5 animate-in fade-in zoom-in duration-300"
            >
              <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <FileUp size={20} className="animate-bounce" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-foreground text-sm">
                  Click to select or drag your field boundary files here
                </p>
                <p className="text-xs text-muted-foreground">
                  Accepts .json or .geojson boundary files from NRCS or FSA
                </p>
              </div>
              <input
                id="empty-state-file-input"
                type="file"
                accept=".json,.geojson"
                multiple
                className="hidden"
                onChange={handleEmptyStateImport}
              />
            </div>

            {/* Instruction Warning Card */}
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl space-y-2 text-xs text-muted-foreground">
              <h4 className="font-semibold text-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                How to get your field boundary files
              </h4>
              <p className="leading-relaxed">
                Request the <strong>FSA CLU JSON or GeoJSON</strong> files for your fields from your local <strong>NRCS office</strong>.
                You can contact them via phone or email and ask them to email the files directly to you.
              </p>
              <div className="pt-0.5">
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setIsGuideOpen(true)}
                  className="p-0 h-auto text-xs text-primary font-medium hover:underline"
                >
                  View detailed request guide & templates
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 overflow-x-auto">
          <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
            <Button
              type="button"
              variant={!showUnassignedOnly ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => {
                setShowUnassignedOnly(false);
                setFocusedUnassignedKey(null);
              }}
            >
              All CLUs
            </Button>
            <Button
              type="button"
              variant={showUnassignedOnly ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 px-3 text-xs text-red-600 dark:text-red-400"
              onClick={() => {
                setShowUnassignedOnly(true);
                setFocusedUnassignedKey(null);
              }}
            >
              Unassigned only
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-300"
            disabled={unassignedCluKeys.length === 0}
            onClick={() => {
              setShowUnassignedOnly(true);
              setFocusedUnassignedIndex(prev => {
                setFocusedUnassignedKey(unassignedCluKeys[prev] ?? null);
                return (prev + 1) % Math.max(1, unassignedCluKeys.length);
              });
            }}
          >
            Next unassigned
          </Button>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {unassignedCluKeys.length} left
          </span>
        </div>
        {showUnassignedOnly && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            <span className="font-semibold">
              Showing only unassigned CLUs. {assignedCluCount} assigned CLU{assignedCluCount !== 1 ? 's are' : ' is'} hidden.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs text-red-700 hover:bg-red-500/15 dark:text-red-200"
              onClick={() => {
                setShowUnassignedOnly(false);
                setFocusedUnassignedKey(null);
              }}
            >
              Show all
            </Button>
          </div>
        )}
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
                      <span className="ml-2">
                        {Math.max(0, tract.geojson.features.length - (tractAssignmentCounts.get(tract.tractKey) || 0))} unassigned
                      </span>
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
          showUnassignedOnly={showUnassignedOnly}
          focusCluKey={focusedUnassignedKey}
          onToggleClu={handleToggleClu}
        />
        <CluFieldSelector
          selectedFieldId={selectedFieldId}
          onSelectField={fieldId => {
            setSelectedFieldId(fieldId);
            setFocusedUnassignedKey(null);
          }}
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

      <Dialog open={isGuideOpen} onOpenChange={setIsGuideOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0 flex flex-col overflow-hidden border-border bg-card">
          <DialogHeader className="p-5 pb-2 shrink-0">
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <HelpCircle className="text-primary" size={20} />
              Importing FSA & NRCS Boundaries
            </DialogTitle>
            <DialogDescription className="sr-only">
              Learn how to request, convert, and upload CLU field boundary files.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="upload" className="flex-1 flex flex-col min-h-0">
            <div className="px-5 border-b border-border bg-muted/30 shrink-0">
              <TabsList className="grid w-full grid-cols-3 h-10 bg-muted/60 p-1">
                <TabsTrigger value="upload" className="text-xs font-semibold data-[state=active]:bg-background">
                  1. Load Files
                </TabsTrigger>
                <TabsTrigger value="request" className="text-xs font-semibold data-[state=active]:bg-background">
                  2. How to Request
                </TabsTrigger>
                <TabsTrigger value="convert" className="text-xs font-semibold data-[state=active]:bg-background">
                  3. Shapefile Guide
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <TabsContent value="upload" className="mt-0 space-y-4 outline-none">
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-foreground">Have your boundary files? Load them here:</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Once you receive your JSON/GeoJSON files (e.g. via email from NRCS or FSA), save them to your device and load them directly into AcreLedger:
                  </p>
                </div>

                {/* Dialog Drag & Drop Zone */}
                <div
                  onDragEnter={handleDialogDrag}
                  onDragOver={handleDialogDrag}
                  onDragLeave={handleDialogDrag}
                  onDrop={handleDialogDrop}
                  onClick={() => dialogFileInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3",
                    isDialogDragActive
                      ? "border-primary bg-primary/10 scale-[1.02]"
                      : "border-primary/30 hover:border-primary/50 bg-primary/5 hover:bg-primary/10"
                  )}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center transition-transform duration-200",
                    isDialogDragActive ? "bg-primary/20 scale-110 text-primary" : "bg-primary/10 text-primary"
                  )}>
                    <FileUp size={24} className={isDialogDragActive ? "animate-bounce" : ""} />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground text-sm">
                      {isDialogDragActive ? "Drop files now!" : "Click to select or drag boundary files here"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Supports .json or .geojson files.
                    </p>
                  </div>
                  <input
                    ref={dialogFileInputRef}
                    type="file"
                    accept=".json,.geojson"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      if (e.target.files) {
                        await handleImportFiles(e.target.files);
                      }
                      if (dialogFileInputRef.current) dialogFileInputRef.current.value = '';
                    }}
                  />
                </div>

                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 text-xs leading-relaxed text-muted-foreground flex gap-2">
                  <Info size={16} className="text-primary shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-foreground">Pro Tip: </span>
                    After a successful import, this guide will close and the map will center on your tracts. You can then click the tracts to assign boundaries to your fields.
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="request" className="mt-0 space-y-5 outline-none">
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-foreground">Where to request boundary files:</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Local agricultural agency offices manage digital maps of your fields. Email or call them to request exports of your files.
                  </p>
                </div>

                {/* FSA Section */}
                <div className="space-y-2.5 rounded-xl border border-border p-3.5 bg-card">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs text-foreground uppercase tracking-wider">Option A: Request FSA CLU boundaries</h4>
                    <span className="bg-primary/10 text-primary text-[10px] font-semibold px-2 py-0.5 rounded-full">Recommended</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Contact your local <strong>Farm Service Agency (FSA)</strong>. They maintain the official CLU (Common Land Unit) field boundaries.
                  </p>
                  <div className="relative bg-muted p-3.5 rounded-lg border border-border/80 text-xs font-mono text-muted-foreground leading-relaxed">
                    <span className="absolute -top-2 left-3 bg-card px-1.5 text-[9px] uppercase font-sans font-bold tracking-wider text-muted-foreground border rounded-sm">Suggested Email Template</span>
                    <p className="pt-2 text-foreground/95 select-all font-sans">
                      “I am trying to use my FSA field boundaries in my farm recordkeeping software. Can you help me export my FSA Common Land Unit, or CLU, field boundaries? I would prefer them as GeoJSON files, but shapefiles are fine if GeoJSON is not available. I need the field polygons with farm number, tract number, field number, and acres if those are included.”
                    </p>
                    <div className="mt-2.5 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText("I am trying to use my FSA field boundaries in my farm recordkeeping software. Can you help me export my FSA Common Land Unit, or CLU, field boundaries? I would prefer them as GeoJSON files, but shapefiles are fine if GeoJSON is not available. I need the field polygons with farm number, tract number, field number, and acres if those are included.");
                          toast.success("Suggested FSA wording copied to clipboard!");
                        }}
                        className="h-7 text-[10px] px-2.5 gap-1 hover:bg-muted bg-background border-border"
                      >
                        <Copy size={12} />
                        <span>Copy Wording</span>
                      </Button>
                    </div>
                  </div>
                </div>

                {/* NRCS Section */}
                <div className="space-y-2.5 rounded-xl border border-border p-3.5 bg-card">
                  <h4 className="font-bold text-xs text-foreground uppercase tracking-wider">Option B: Request NRCS GIS layers</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Contact your <strong>Natural Resources Conservation Service (NRCS)</strong> office. They have detailed conservation plan maps and soil layers.
                  </p>
                  <div className="relative bg-muted p-3.5 rounded-lg border border-border/80 text-xs font-mono text-muted-foreground leading-relaxed">
                    <span className="absolute -top-2 left-3 bg-card px-1.5 text-[9px] uppercase font-sans font-bold tracking-wider text-muted-foreground border rounded-sm">Suggested Email Template</span>
                    <p className="pt-2 text-foreground/95 select-all font-sans">
                      “I am using farm mapping software and would like any available GIS files for my operation. Do you have GeoJSON, shapefile, or other GIS exports for my farm boundaries, conservation plan maps, soil/resource layers, waterways, or planned NRCS practices?”
                    </p>
                    <div className="mt-2.5 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText("I am using farm mapping software and would like any available GIS files for my operation. Do you have GeoJSON, shapefile, or other GIS exports for my farm boundaries, conservation plan maps, soil/resource layers, waterways, or planned NRCS practices?");
                          toast.success("Suggested NRCS wording copied to clipboard!");
                        }}
                        className="h-7 text-[10px] px-2.5 gap-1 hover:bg-muted bg-background border-border"
                      >
                        <Copy size={12} />
                        <span>Copy Wording</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="convert" className="mt-0 space-y-4 outline-none">
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-foreground">Did you receive a Shapefile (.zip)?</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Government offices often send map boundaries in a <strong>Shapefile</strong> format (usually a <code>.zip</code> file containing multiple files like <code>.shp</code>, <code>.dbf</code>, and <code>.prj</code>).
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Since AcreLedger uses the modern, lightweight <strong>GeoJSON</strong> format, you can easily convert shapefiles in 15 seconds:
                  </p>
                </div>

                <div className="space-y-3 rounded-xl border border-border p-4 bg-muted/30">
                  <h4 className="font-bold text-xs text-foreground uppercase tracking-wider">How to convert using Mapshaper:</h4>
                  <ol className="list-decimal pl-5 text-xs space-y-2.5 text-muted-foreground">
                    <li>
                      Open{" "}
                      <a
                        href="https://mapshaper.org"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-semibold inline-flex items-center gap-0.5"
                      >
                        mapshaper.org
                        <ExternalLink size={12} className="inline shrink-0" />
                      </a>{" "}
                      in a new tab. This is a free, secure, and private browser-only converter.
                    </li>
                    <li>
                      Drag and drop your shapefile <strong>ZIP file</strong> (or select the individual files) into the Mapshaper window and click <strong>Import</strong>.
                    </li>
                    <li>
                      Click <strong>Export</strong> in the top-right corner of Mapshaper, select <strong>GeoJSON</strong>, and click <strong>Export</strong>.
                    </li>
                    <li>
                      Return to AcreLedger, go to the <strong>Load Files</strong> tab of this guide, and upload/drop the exported <code>.json</code> or <code>.geojson</code> file.
                    </li>
                  </ol>
                </div>

                <div className="rounded-lg border border-border bg-card p-3.5 text-xs text-muted-foreground flex gap-2 items-center">
                  <Mail size={16} className="text-primary shrink-0" />
                  <div>
                    Need help? Email the files you received to <span className="font-semibold text-foreground font-mono">support@acreledger.com</span> and we will convert and load them for you!
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!tractToDelete} onOpenChange={(open) => { if (!open) setTractToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                if (!tractToDelete) return '';
                const tract = fsaTracts.find(t => t.id === tractToDelete);
                const assignedCount = displayAssignments.filter(a => !a.deletedAt && a.tractKey === tract?.tractKey).length;
                return `This tract has ${assignedCount} CLU assignment${assignedCount > 1 ? 's' : ''} that will also be removed. Continue?`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (tractToDelete) {
                await executeDeleteTract(tractToDelete);
                setTractToDelete(null);
              }
            }}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
