import { useEffect, useState } from 'react';
import type { WorkRequestFieldEntry } from '@/types/farm';
import type { WorkRequestDraft } from './useWorkRequestForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Navigation as NavIcon, RefreshCw, MapPin } from 'lucide-react';
import { lookupNearbyRoad } from '@/lib/workRequests/roadLookup';
import { resolveDefaultNavPoint } from '@/lib/workRequests/navPoint';
import { formatNavigationCoords } from '@/lib/workRequests/navigation';
import { NOMINATIM_ATTRIBUTION } from '@/lib/workRequests/roadLookup';
import WorkRequestFieldMap from './WorkRequestFieldMap';

interface FieldReviewStepProps {
  draft: WorkRequestDraft;
  patchFieldEntry: (fieldId: string, patch: Partial<WorkRequestFieldEntry>) => void;
  resolve: (fieldId: string) => { field: import('@/types/farm').Field | undefined; geometry: import('@/lib/geoHelpers').GeoJSONGeometry | null };
  navUrlFor: (entry: WorkRequestFieldEntry) => string | null;
}

export default function FieldReviewStep({ draft, patchFieldEntry, resolve, navUrlFor }: FieldReviewStepProps) {
  const [activeFieldId, setActiveFieldId] = useState<string | null>(draft.fields[0]?.fieldId ?? null);
  const [lookupInProgress, setLookupInProgress] = useState<Record<string, boolean>>({});

  // Keep an active field selected as the list changes.
  useEffect(() => {
    if (!activeFieldId || !draft.fields.some(f => f.fieldId === activeFieldId)) {
      setActiveFieldId(draft.fields[0]?.fieldId ?? null);
    }
  }, [draft.fields, activeFieldId]);

  const activeEntry = draft.fields.find(f => f.fieldId === activeFieldId) ?? draft.fields[0];

  // Auto-run road lookup for fields that don't have one yet, on first mount.
  useEffect(() => {
    let cancelled = false;
    const runLookups = async () => {
      for (const entry of draft.fields) {
        if (cancelled) return;
        if (entry.nearbyRoad || entry.gpsLat == null || entry.gpsLng == null) continue;
        setLookupInProgress(prev => ({ ...prev, [entry.fieldId]: true }));
        const result = await lookupNearbyRoad(entry.gpsLat, entry.gpsLng);
        if (cancelled) return;
        const patch: Partial<WorkRequestFieldEntry> = {};
        if (result.name) {
          patch.nearbyRoad = result.name;
          patch.roadSource = 'nominatim';
        }
        // Re-snap nav point to nearest boundary vertex of the resolved road point.
        if (result.point) {
          const { geometry } = resolve(entry.fieldId);
          const snapped = resolveDefaultNavPoint({ lat: entry.gpsLat ?? null, lng: entry.gpsLng ?? null }, geometry, result.point);
          if (snapped) {
            patch.navigationLat = snapped.lat;
            patch.navigationLng = snapped.lng;
          }
        }
        if (Object.keys(patch).length > 0) patchFieldEntry(entry.fieldId, patch);
        setLookupInProgress(prev => ({ ...prev, [entry.fieldId]: false }));
      }
    };
    runLookups();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!activeEntry) {
    return <div className="py-8 text-center text-sm text-muted-foreground">No fields selected.</div>;
  }

  const relookupRoad = async (entry: WorkRequestFieldEntry) => {
    if (entry.gpsLat == null || entry.gpsLng == null) return;
    setLookupInProgress(prev => ({ ...prev, [entry.fieldId]: true }));
    const result = await lookupNearbyRoad(entry.gpsLat, entry.gpsLng);
    const patch: Partial<WorkRequestFieldEntry> = {};
    patch.nearbyRoad = result.name || '';
    patch.roadSource = result.name ? 'nominatim' : 'manual';
    if (result.point) {
      const { geometry } = resolve(entry.fieldId);
      const snapped = resolveDefaultNavPoint({ lat: entry.gpsLat ?? null, lng: entry.gpsLng ?? null }, geometry, result.point);
      if (snapped) {
        patch.navigationLat = snapped.lat;
        patch.navigationLng = snapped.lng;
      }
    }
    patchFieldEntry(entry.fieldId, patch);
    setLookupInProgress(prev => ({ ...prev, [entry.fieldId]: false }));
  };

  const applyFieldCoords = (entry: WorkRequestFieldEntry) => {
    if (entry.gpsLat == null || entry.gpsLng == null) return;
    patchFieldEntry(entry.fieldId, { navigationLat: entry.gpsLat, navigationLng: entry.gpsLng });
  };

  const applyCentroid = (entry: WorkRequestFieldEntry) => {
    const { geometry } = resolve(entry.fieldId);
    const point = resolveDefaultNavPoint({ lat: null, lng: null }, geometry, null);
    if (point) patchFieldEntry(entry.fieldId, { navigationLat: point.lat, navigationLng: point.lng });
  };

  const setOverrideCrop = (entry: WorkRequestFieldEntry, crop: string) => {
    patchFieldEntry(entry.fieldId, { overrides: { ...(entry.overrides ?? {}), crop: crop || undefined } });
  };
  const setOverrideNotes = (entry: WorkRequestFieldEntry, notes: string) => {
    patchFieldEntry(entry.fieldId, { overrides: { ...(entry.overrides ?? {}), notes: notes || undefined } });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-foreground">Review fields</h3>
        <p className="text-xs text-muted-foreground">Confirm the nearby road and navigation point for each field. Override details per field if needed.</p>
      </div>

      {/* Field switcher */}
      <div className="flex flex-wrap gap-2">
        {draft.fields.map((entry, index) => (
          <button
            key={entry.fieldId}
            type="button"
            onClick={() => setActiveFieldId(entry.fieldId)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              entry.fieldId === activeFieldId
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-muted/40'
            }`}
          >
            {index + 1}. {entry.fieldName}
          </button>
        ))}
      </div>

      <FieldReviewCard
        entry={activeEntry}
        draft={draft}
        lookupInProgress={!!lookupInProgress[activeEntry.fieldId]}
        navUrl={navUrlFor(activeEntry)}
        resolve={resolve}
        onRelookup={() => relookupRoad(activeEntry)}
        onRoadChange={value => patchFieldEntry(activeEntry.fieldId, { nearbyRoad: value, roadSource: 'manual' })}
        onApplyFieldCoords={() => applyFieldCoords(activeEntry)}
        onApplyCentroid={() => applyCentroid(activeEntry)}
        onOverrideCrop={crop => setOverrideCrop(activeEntry, crop)}
        onOverrideNotes={notes => setOverrideNotes(activeEntry, notes)}
      />

      <p className="text-[10px] text-muted-foreground">{NOMINATIM_ATTRIBUTION}</p>
    </div>
  );
}

interface FieldReviewCardProps {
  entry: WorkRequestFieldEntry;
  draft: WorkRequestDraft;
  lookupInProgress: boolean;
  navUrl: string | null;
  resolve: (fieldId: string) => { field: import('@/types/farm').Field | undefined; geometry: import('@/lib/geoHelpers').GeoJSONGeometry | null };
  onRelookup: () => void;
  onRoadChange: (value: string) => void;
  onApplyFieldCoords: () => void;
  onApplyCentroid: () => void;
  onOverrideCrop: (crop: string) => void;
  onOverrideNotes: (notes: string) => void;
}

function FieldReviewCard({ entry, draft, lookupInProgress, navUrl, resolve, onRelookup, onRoadChange, onApplyFieldCoords, onApplyCentroid, onOverrideCrop, onOverrideNotes }: FieldReviewCardProps) {
  const { geometry } = resolve(entry.fieldId);
  const navPoint = entry.navigationLat != null && entry.navigationLng != null ? { lat: entry.navigationLat, lng: entry.navigationLng } : null;
  const fallbackPoint = entry.gpsLat != null && entry.gpsLng != null
    ? { lat: entry.gpsLat, lng: entry.gpsLng }
    : null;

  const overrideCrop = entry.overrides?.crop ?? '';
  const overrideNotes = entry.overrides?.notes ?? '';
  const effectiveCrop = overrideCrop || entry.crop || draft.crop || '';

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div>
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="min-w-0 break-words text-sm font-bold text-foreground">{entry.fieldName}</h4>
          <span className="break-words text-xs font-mono text-muted-foreground sm:text-right">{entry.farmName} · {entry.acreage.toLocaleString()} ac</span>
        </div>
        <p className="text-xs text-muted-foreground">Crop: {effectiveCrop || '—'}</p>
      </div>

      {/* Map preview */}
      <WorkRequestFieldMap
        geometry={geometry}
        navPoint={navPoint}
        fallbackPoint={fallbackPoint}
      />

      {/* GPS + navigation */}
      <div className="space-y-2 rounded-xl bg-muted/30 p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
          <MapPin size={14} className="shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Field GPS:</span>
          <span className="font-mono text-foreground">
            {entry.gpsLat != null && entry.gpsLng != null ? `${entry.gpsLat.toFixed(5)}, ${entry.gpsLng.toFixed(5)}` : 'unavailable'}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
          <NavIcon size={14} className="shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Navigation point:</span>
            <span className="break-all font-mono text-foreground">{formatNavigationCoords(entry.navigationLat, entry.navigationLng)}</span>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={onApplyFieldCoords} disabled={entry.gpsLat == null}>
            Use field coords
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onApplyCentroid}>
            Use centroid
          </Button>
          {navUrl && (
            <a href={navUrl} target="_blank" rel="noopener noreferrer">
              <Button type="button" variant="outline" size="sm">
                <NavIcon size={14} className="mr-1" /> Navigate
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Nearby road */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={`road-${entry.fieldId}`} className="text-xs font-semibold">Nearby road</Label>
          <Button type="button" variant="ghost" size="sm" onClick={onRelookup} disabled={lookupInProgress || entry.gpsLat == null}>
            <RefreshCw size={14} className={`mr-1 ${lookupInProgress ? 'animate-spin' : ''}`} />
            {lookupInProgress ? 'Looking up…' : 'Re-lookup'}
          </Button>
        </div>
        <Input
          id={`road-${entry.fieldId}`}
          className="h-11"
          value={entry.nearbyRoad ?? ''}
          onChange={e => onRoadChange(e.target.value)}
          placeholder="Type the road name or re-lookup"
        />
        {entry.roadSource === 'nominatim' && <p className="text-[10px] text-muted-foreground">Auto-detected — edit if incorrect.</p>}
      </div>

      {/* Per-field overrides */}
      <div className="space-y-3 border-t border-border pt-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Per-field overrides (optional)</p>
        <div className="space-y-1.5">
          <Label htmlFor={`crop-${entry.fieldId}`} className="text-xs">Crop for this field</Label>
          <Input id={`crop-${entry.fieldId}`} className="h-11" value={overrideCrop} onChange={e => onOverrideCrop(e.target.value)} placeholder="Leave blank to use the request crop" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`notes-${entry.fieldId}`} className="text-xs">Notes for this field</Label>
          <Textarea id={`notes-${entry.fieldId}`} value={overrideNotes} onChange={e => onOverrideNotes(e.target.value)} placeholder="Leave blank to use the request notes" />
        </div>
        {(entry.overrides?.products?.length ?? 0) > 0 && (
          <p className="text-[10px] text-muted-foreground">This field has {entry.overrides!.products!.length} product override(s) applied from a saved request.</p>
        )}
      </div>
    </div>
  );
}
