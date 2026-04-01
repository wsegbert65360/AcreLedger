import { useMemo, useState, useEffect, useRef } from 'react';
import { useFarm } from '@/store/farmStore';
import { Field } from '@/types/farm';
import { RainService } from '@/services/RainService';
import FieldCard from './FieldCard';

interface FieldListProps {
  fields: Field[];
}

type RainfallResult = {
  '24h': number;
  '72h': number;
  '7d': number;
  sincePlanting: number;
  sinceLastSpray: number;
  periodEndUtc: string;
  dataWarning?: string;
};

/**
 * Fetches rain for a single field.  Returns null on error/abort so the
 * caller can distinguish "loading" from "done but failed".
 */
async function fetchFieldRain(
  fieldId: string,
  lat: number | null,
  lng: number | null,
  boundary: Field['boundary'],
  sincePlantingDate: string | undefined,
  sinceLastSprayDate: string | undefined,
): Promise<RainfallResult | null> {
  // No location → bail out immediately, not an error
  if (lat == null && lng == null && !boundary) return null;

  try {
    return await RainService.fetchComprehensiveRainfall({
      fieldId,
      lat,
      lng,
      boundary: boundary ?? undefined,
      sincePlantingDate,
      sinceLastSprayDate,
    });
  } catch (err: any) {
    if (err.name === 'AbortError') return null;
    console.warn(`[FieldList] Rain fetch failed for ${fieldId}:`, err.message);
    return null;          // error → null, card shows "—"
  }
}

export default function FieldList({ fields }: FieldListProps) {
  const { plantRecords, sprayRecords, fertilizerApplications, harvestRecords, viewingSeason } = useFarm();

  // ── Activity summaries (pure display, no rain dependency) ──────────────
  const augmentedFields = useMemo(() => {
    return fields.map(field => {
      const seasonFilter = (r: { fieldId: string; seasonYear: number }) =>
        r.fieldId === field.id && r.seasonYear === viewingSeason;
      const summary = {
        planted: plantRecords.some(seasonFilter),
        harvested: harvestRecords.some(seasonFilter),
        sprayed: sprayRecords.filter(seasonFilter).length,
        fertilized: fertilizerApplications.filter(seasonFilter).length,
      };
      return { ...field, activitySummary: summary };
    });
  }, [fields, plantRecords, sprayRecords, fertilizerApplications, harvestRecords, viewingSeason]);

  // ── Rain state ─────────────────────────────────────────────────────────
  const [rainMap, setRainMap] = useState<Record<string, RainfallResult>>({});
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const resolvedRef = useRef(new Set<string>());

  /**
   * Effect: fire ONE independent fetch per field.  Each field gets its own
   * Promise that resolves or rejects on its own timeline — no shared abort
   * controller, no callback that recreates on dep changes.
   *
   * We use field.id as the trigger so the effect only re-fires when the
   * actual list of fields changes (added / removed), never when the store
   * updates other slices.
   *
   * We de-dupe via a ref so a field that already resolved is never
   * re-fetched within the same mount cycle.
   */
  useEffect(() => {
    if (fields.length === 0) return;

    const currentIds = fields.map(f => f.id);
    const pending = currentIds.filter(id => !resolvedRef.current.has(id));
    if (pending.length === 0) return;

    let cancelled = false;

    const doFetch = async () => {
      for (const fieldId of pending) {
        const field = fields.find(f => f.id === fieldId);
        if (!field) continue;

        // Derive planting/spray dates at call-time (not via useMemo)
        const seasonFilter = (r: { fieldId: string; seasonYear: number }) =>
          r.fieldId === field.id && r.seasonYear === viewingSeason;

        const plantings = plantRecords.filter(seasonFilter)
          .sort((a, b) => new Date(b.plantDate || 0).getTime() - new Date(a.plantDate || 0).getTime());
        const sprays = sprayRecords.filter(seasonFilter)
          .sort((a, b) => new Date(b.sprayDate || 0).getTime() - new Date(a.sprayDate || 0).getTime());

        const result = await fetchFieldRain(
          field.id,
          field.lat,
          field.lng,
          field.boundary,
          plantings[0]?.plantDate,
          sprays[0]?.sprayDate,
        );

        if (cancelled) return;

        resolvedRef.current.add(fieldId);
        setResolvedIds(prev => new Set(prev).add(fieldId));

        if (result) {
          setRainMap(prev => ({ ...prev, [fieldId]: result }));
        }
      }
    };

    doFetch();

    return () => { cancelled = true; };
    // Only depend on field IDs — not on the Field objects themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.map(f => f.id).join(',')]);

  return (
    <div className="space-y-1.5">
      {augmentedFields.map((field, i) => (
        <FieldCard
          key={field.id}
          field={field}
          index={i}
          rainStats={rainMap[field.id] ?? null}
          rainLoading={!resolvedIds.has(field.id)}
        />
      ))}
    </div>
  );
}
