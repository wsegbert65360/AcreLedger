import { useMemo, useState, useEffect, useRef } from 'react';
import { useFarm } from '@/store/farmStore';
import { Field } from '@/types/farm';
import FieldCard from './FieldCard';

interface FieldListProps {
  fields: Field[];
}

// ── Activity summaries only (no rain logic here) ────────────────────────

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

  return (
    <div className="space-y-1.5">
      {augmentedFields.map((field, i) => (
        <FieldCard key={field.id} field={field} index={i} />
      ))}
    </div>
  );
}
