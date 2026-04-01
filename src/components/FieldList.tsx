import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useFarm } from '@/store/farmStore';
import { Field } from '@/types/farm';
import { RainService } from '@/services/RainService';
import FieldCard from './FieldCard';

interface FieldListProps {
  fields: Field[];
}

/**
 * FieldList now fetches per-field rainfall using RainService (the same API
 * that FieldDetailScreen uses).  Key design decisions:
 *
 *  1. We derive a **stable** list of `{ fieldId, lat, lng, boundary }`
 *     objects keyed only by field identity — NOT by activity summaries.
 *     This prevents the useEffect from firing on every store tick.
 *
 *  2. We track which field IDs have been **attempted** (even on error or
 *     skip) so the card can show a "—" dash instead of a spinner.
 *
 *  3. A ref guard (`fetchingRef`) prevents concurrent rain rounds.
 */

export default function FieldList({ fields }: FieldListProps) {
  const { plantRecords, sprayRecords, fertilizerApplications, harvestRecords, viewingSeason } = useFarm();

  // ── Activity summaries (used for card display, NOT for rain deps) ──
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

  // ── Stable rain-args derived only from the raw fields array ──
  // We stringify so that React sees the same value when fields haven't
  // changed identity (same ids, same coords) even though the parent
  // may re-render for other reasons.
  const rainArgsKey = useMemo(() => {
    return fields.map(f => `${f.id}:${f.lat ?? ''}:${f.lng ?? ''}`).join('|');
  }, [fields]);

  const rainArgs = useMemo(() => {
    return fields.map(f => ({
      fieldId: f.id,
      lat: f.lat,
      lng: f.lng,
      boundary: f.boundary ?? undefined,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rainArgsKey]);

  // ── Planting / spray dates per field (stable per season) ──
  const fieldDates = useMemo(() => {
    const dates: Record<string, { sincePlantingDate?: string; sinceLastSprayDate?: string }> = {};
    for (const field of fields) {
      const seasonFilter = (r: { fieldId: string; seasonYear: number }) =>
        r.fieldId === field.id && r.seasonYear === viewingSeason;

      const plantings = plantRecords.filter(seasonFilter)
        .sort((a, b) => new Date(b.plantDate || 0).getTime() - new Date(a.plantDate || 0).getTime());
      const sprays = sprayRecords.filter(seasonFilter)
        .sort((a, b) => new Date(b.sprayDate || 0).getTime() - new Date(a.sprayDate || 0).getTime());

      dates[field.id] = {
        sincePlantingDate: plantings[0]?.plantDate,
        sinceLastSprayDate: sprays[0]?.sprayDate,
      };
    }
    return dates;
  }, [fields, plantRecords, sprayRecords, viewingSeason]);

  // ── Rain state ──
  const [rainMap, setRainMap] = useState<Record<string, {
    '24h': number;
    '72h': number;
    '7d': number;
    sincePlanting: number;
    sinceLastSpray: number;
    periodEndUtc: string;
    dataWarning?: string;
  }>>({});

  // Track which field IDs have finished attempting (success or fail)
  const [attemptedIds, setAttemptedIds] = useState<Set<string>>(new Set());
  const fetchingRef = useRef(false);

  const fetchRainfall = useCallback(async (args: typeof rainArgs, signal: AbortSignal) => {
    if (args.length === 0) return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    const newRain: typeof rainMap = {};
    const newAttempted = new Set<string>();

    const promises = args.map(async ({ fieldId, lat, lng, boundary }) => {
      // Skip fields with no location data at all
      if (lat == null && lng == null && !boundary) {
        newAttempted.add(fieldId);
        return;
      }

      const dates = fieldDates[fieldId];
      try {
        const data = await RainService.fetchComprehensiveRainfall({
          fieldId,
          lat,
          lng,
          boundary,
          sincePlantingDate: dates?.sincePlantingDate,
          sinceLastSprayDate: dates?.sinceLastSprayDate,
          signal,
        });
        newRain[fieldId] = data;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.warn(`[FieldList] Rain fetch failed for ${fieldId}:`, err.message);
      }
      newAttempted.add(fieldId);
    });

    await Promise.all(promises);

    if (!signal.aborted) {
      setRainMap(prev => ({ ...prev, ...newRain }));
      setAttemptedIds(prev => {
        const next = new Set(prev);
        for (const id of newAttempted) next.add(id);
        return next;
      });
    }

    fetchingRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldDates, rainArgsKey]);

  useEffect(() => {
    if (rainArgs.length === 0) return;
    const controller = new AbortController();
    fetchingRef.current = false; // reset guard so this round can run
    fetchRainfall(rainArgs, controller.signal);
    return () => controller.abort();
  }, [rainArgs, fetchRainfall]);

  return (
    <div className="space-y-1.5">
      {augmentedFields.map((field, i) => (
        <FieldCard
          key={field.id}
          field={field}
          index={i}
          rainStats={rainMap[field.id] ?? null}
          rainLoading={!attemptedIds.has(field.id)}
        />
      ))}
    </div>
  );
}
