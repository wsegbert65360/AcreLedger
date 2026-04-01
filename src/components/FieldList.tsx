import { useMemo, useState, useEffect, useCallback } from 'react';
import { useFarm } from '@/store/farmStore';
import { Field } from '@/types/farm';
import { RainService } from '@/services/RainService';
import FieldCard from './FieldCard';

interface RainfallResult {
  '24h': number;
  '72h': number;
  '7d': number;
  sincePlanting: number;
  sinceLastSpray: number;
  periodEndUtc: string;
  dataWarning?: string;
}

interface FieldListProps {
  fields: Field[];
}

export default function FieldList({ fields }: FieldListProps) {
  const { plantRecords, sprayRecords, fertilizerApplications, harvestRecords, viewingSeason } = useFarm();

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

  // Per-field rainfall data keyed by field ID
  const [rainMap, setRainMap] = useState<Record<string, RainfallResult>>({});

  // Derive planting/spray dates per field for the current season
  const fieldDates = useMemo(() => {
    const dates: Record<string, { sincePlantingDate?: string; sinceLastSprayDate?: string }> = {};
    for (const field of augmentedFields) {
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
  }, [augmentedFields, plantRecords, sprayRecords, viewingSeason]);

  const fetchRainfall = useCallback(async (signal?: AbortSignal) => {
    const newMap: Record<string, RainfallResult> = {};

    const promises = augmentedFields.map(async (field) => {
      // Only fetch if field has location data
      if (field.lat == null && field.lng == null && !field.boundary) return;

      const dates = fieldDates[field.id];
      try {
        const data = await RainService.fetchComprehensiveRainfall({
          fieldId: field.id,
          lat: field.lat,
          lng: field.lng,
          boundary: field.boundary ?? undefined,
          sincePlantingDate: dates?.sincePlantingDate,
          sinceLastSprayDate: dates?.sinceLastSprayDate,
          signal,
        });
        newMap[field.id] = data;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.warn(`[FieldList] Rain fetch failed for ${field.name}:`, err.message);
      }
    });

    await Promise.all(promises);
    if (!signal?.aborted) {
      setRainMap(newMap);
    }
  }, [augmentedFields, fieldDates]);

  useEffect(() => {
    if (augmentedFields.length === 0) return;
    const controller = new AbortController();
    fetchRainfall(controller.signal);
    return () => controller.abort();
  }, [augmentedFields, fetchRainfall]);

  return (
    <div className="space-y-1.5">
      {augmentedFields.map((field, i) => (
        <FieldCard key={field.id} field={field} index={i} rainStats={rainMap[field.id] ?? null} />
      ))}
    </div>
  );
}
