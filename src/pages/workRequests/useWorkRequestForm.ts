import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  WorkRequest,
  WorkRequestFieldEntry,
  WorkRequestProduct,
} from '@/types/farm';
import type { WorkType } from '@/types/farm';
import type { FsaTractImport } from '@/types/fsaTract';
import { useFarm } from '@/store/farmStore';
import { getDisplayFieldAcres } from '@/lib/fieldAcreage';
import { generateRequestNumber } from '@/lib/workRequests/requestNumber';
import { resolveDefaultNavPoint } from '@/lib/workRequests/navPoint';
import { getFieldThumbnailGeometry } from '@/lib/fieldThumbnail';
import { buildNavigationUrl } from '@/lib/workRequests/navigation';

export type WorkRequestStep = 'fields' | 'details' | 'products' | 'field-review' | 'review';

export type { WorkType } from '@/types/farm';

export const WIZARD_STEPS: { key: WorkRequestStep; label: string }[] = [
  { key: 'fields', label: 'Fields' },
  { key: 'details', label: 'Details' },
  { key: 'products', label: 'Products' },
  { key: 'field-review', label: 'Field Review' },
  { key: 'review', label: 'Review' },
];

/** Mutable draft the wizard edits in place. */
export type WorkRequestDraft = Omit<WorkRequest, 'id' | 'timestamp' | 'deleted_at' | 'farm_id'>;

function emptyProduct(): WorkRequestProduct {
  return { productName: '', applicationRate: '', rateUnit: '', carrierVolume: '', carrierVolumeUnit: '', applicationMethod: '', supplier: undefined };
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function buildEntryFromField(
  fieldId: string,
  farmName: string,
  cluAssignments: import('@/types/fsaTract').FieldCluAssignment[],
  resolve: (id: string) => { field: import('@/types/farm').Field | undefined; geometry: import('@/lib/geoHelpers').GeoJSONGeometry | null },
): WorkRequestFieldEntry | null {
  const { field, geometry } = resolve(fieldId);
  if (!field) return null;
  const acreage = getDisplayFieldAcres(field, cluAssignments);
  // Default nav point uses field coords / centroid — nearest-vertex-to-road is
  // applied later after road lookup runs in FieldReviewStep.
  const navPoint = resolveDefaultNavPoint(field, geometry, null);
  return {
    fieldId: field.id,
    farmName,
    fieldName: field.name,
    acreage,
    crop: undefined,
    gpsLat: field.lat ?? undefined,
    gpsLng: field.lng ?? undefined,
    navigationLat: navPoint?.lat,
    navigationLng: navPoint?.lng,
    nearbyRoad: undefined,
    roadSource: undefined,
    overrides: undefined,
  };
}

interface UseWorkRequestFormArgs {
  /** Existing request for edit/duplicate; undefined for a new request. */
  initial?: WorkRequest | null;
  /** 'edit' | 'duplicate' | 'new'. Duplicate stamps a new request number + Draft. */
  mode?: 'edit' | 'duplicate' | 'new';
  open: boolean;
  /** Imported + bundled tracts supplied by the parent when available. */
  fsaTracts?: FsaTractImport[];
}

export function useWorkRequestForm({ initial, mode = 'new', open, fsaTracts: providedFsaTracts }: UseWorkRequestFormArgs) {
  const { fields, cluAssignments, fsaTracts, farmName, viewingSeason, workRequests } = useFarm();
  const resolvedFsaTracts = providedFsaTracts ?? fsaTracts;
  const isDuplicate = mode === 'duplicate' && !!initial;

  const [step, setStep] = useState<WorkRequestStep>('fields');
  const [draft, setDraft] = useState<WorkRequestDraft>(() => buildInitialDraft(initial, mode, viewingSeason, workRequests));
  const [isSaving, setIsSaving] = useState(false);

  // Reset the draft whenever the wizard (re)opens for a different target.
  useEffect(() => {
    if (!open) return;
    setDraft(buildInitialDraft(initial, mode, viewingSeason, workRequests));
    setStep('fields');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id, mode]);

  // Geometry lookup helper (closure so step components resolve consistently).
  const resolve = useCallback((fieldId: string) => {
    const field = fields.find(f => f.id === fieldId);
    const geometry = field
      ? getFieldThumbnailGeometry(field, cluAssignments, resolvedFsaTracts, {
          preferAssignments: true,
          croplandOnly: true,
        })
      : null;
    return { field, geometry };
  }, [fields, cluAssignments, resolvedFsaTracts]);

  // ── Selection helpers (Fields step) ───────────────────────────────────────
  const selectedFieldIds = useMemo(() => new Set(draft.fields.map(f => f.fieldId)), [draft.fields]);

  const setFieldIds = useCallback((ids: string[]) => {
    setDraft(prev => {
      const farmNameCurrent = farmName || 'Farm';
      const existingById = new Map(prev.fields.map(f => [f.fieldId, f]));
      const next: WorkRequestFieldEntry[] = [];
      for (const id of ids) {
        const kept = existingById.get(id);
        if (kept) {
          next.push(kept);
        } else {
          const entry = buildEntryFromField(id, farmNameCurrent || 'Farm', cluAssignments, resolve);
          if (entry) next.push(entry);
        }
      }
      return { ...prev, fields: next };
    });
  }, [resolve, farmName, cluAssignments]);

  const totalSelectedAcres = useMemo(
    () => draft.fields.reduce((sum, f) => sum + (f.acreage || 0), 0),
    [draft.fields],
  );

  // ── Details / products / per-field patchers ───────────────────────────────
  const patchDraft = useCallback((patch: Partial<WorkRequestDraft>) => {
    setDraft(prev => ({ ...prev, ...patch }));
  }, []);

  const setWorkType = useCallback((workType: WorkType) => patchDraft({ workType }), [patchDraft]);

  const setProducts = useCallback((products: WorkRequestProduct[]) => patchDraft({ products }), [patchDraft]);

  const addProduct = useCallback(() => {
    setDraft(prev => ({ ...prev, products: [...prev.products, emptyProduct()] }));
  }, []);

  const updateProduct = useCallback((index: number, patch: Partial<WorkRequestProduct>) => {
    setDraft(prev => ({
      ...prev,
      products: prev.products.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));
  }, []);

  const removeProduct = useCallback((index: number) => {
    setDraft(prev => ({ ...prev, products: prev.products.filter((_, i) => i !== index) }));
  }, []);

  const patchFieldEntry = useCallback((fieldId: string, patch: Partial<WorkRequestFieldEntry>) => {
    setDraft(prev => ({
      ...prev,
      fields: prev.fields.map(f => (f.fieldId === fieldId ? { ...f, ...patch } : f)),
    }));
  }, []);

  // ── Validation gate (blocks PDF/email until complete) ─────────────────────
  const issues = useMemo(() => {
    const list: string[] = [];
    if (draft.fields.length === 0) list.push('Select at least one field.');
    if (!draft.customerName.trim()) list.push('Enter the customer/landowner name.');
    if (!draft.providerName?.trim()) list.push('Enter the provider/applicator name.');
    if (!draft.providerEmail?.trim()) list.push('Enter the provider email (required to email).');
    if (!draft.requestedCompletionDate) list.push('Choose a requested completion date.');
    return list;
  }, [draft]);

  const canProceedFields = draft.fields.length > 0;
  const canProceedDetails = !!draft.customerName.trim() && !!draft.providerName?.trim() && !!draft.providerEmail?.trim() && !!draft.requestedCompletionDate;
  const canGenerate = issues.length === 0;

  // ── Navigation ────────────────────────────────────────────────────────────
  const stepIndex = WIZARD_STEPS.findIndex(s => s.key === step);
  const goNext = useCallback(() => {
    setStep(prev => {
      const idx = WIZARD_STEPS.findIndex(s => s.key === prev);
      return WIZARD_STEPS[Math.min(idx + 1, WIZARD_STEPS.length - 1)].key;
    });
  }, []);
  const goBack = useCallback(() => {
    setStep(prev => {
      const idx = WIZARD_STEPS.findIndex(s => s.key === prev);
      return WIZARD_STEPS[Math.max(idx - 1, 0)].key;
    });
  }, []);
  const goToStep = useCallback((target: WorkRequestStep) => setStep(target), []);

  const navUrlFor = useCallback((entry: WorkRequestFieldEntry) => {
    if (entry.navigationLat == null || entry.navigationLng == null) return null;
    return buildNavigationUrl(entry.navigationLat, entry.navigationLng, 'app');
  }, []);

  return {
    step,
    stepIndex,
    draft,
    setDraft,
    isSaving,
    setIsSaving,
    isDuplicate,
    // fields
    selectedFieldIds,
    setFieldIds,
    totalSelectedAcres,
    // details/products
    patchDraft,
    setWorkType,
    setProducts,
    addProduct,
    updateProduct,
    removeProduct,
    patchFieldEntry,
    // per-field geometry resolution (for FieldReviewStep maps)
    resolve,
    // validation
    issues,
    canProceedFields,
    canProceedDetails,
    canGenerate,
    // navigation
    goNext,
    goBack,
    goToStep,
    navUrlFor,
  };
}

function buildInitialDraft(
  initial: WorkRequest | null | undefined,
  mode: 'edit' | 'duplicate' | 'new',
  viewingSeason: number,
  existing: WorkRequest[],
): WorkRequestDraft {
  if (initial && mode === 'edit') {
    const { id: _id, timestamp: _t, deleted_at: _d, farm_id: _f, ...rest } = initial;
    return rest;
  }
  if (initial && mode === 'duplicate') {
    const nowIso = new Date().toISOString();
    const { id: _id, timestamp: _t, deleted_at: _d, farm_id: _f, ...rest } = initial;
    return {
      ...rest,
      requestNumber: generateRequestNumber(existing),
      status: 'Draft',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }
  // new
  const nowIso = new Date().toISOString();
  return {
    requestNumber: generateRequestNumber(existing),
    status: 'Draft',
    createdAt: nowIso,
    updatedAt: nowIso,
    customerName: '',
    customerPhone: '',
    customerBillingAddress: '',
    providerName: '',
    providerEmail: '',
    workType: 'spraying',
    requestedCompletionDate: todayIso(),
    crop: '',
    cropYear: viewingSeason,
    currentCropStage: '',
    previousCrop: '',
    nextPlannedCrop: '',
    notes: '',
    products: [emptyProduct()],
    fields: [],
  };
}

export { todayIso };
