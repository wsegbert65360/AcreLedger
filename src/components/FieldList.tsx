import { useMemo } from 'react';
import { useFarm } from '@/store/farmStore';
import { Field } from '@/types/farm';
import FieldCard from './FieldCard';

interface FieldListProps {
  fields: Field[];
}

export default function FieldList({ fields }: FieldListProps) {
  const { plantRecords, sprayRecords, fertilizerApplications, viewingSeason } = useFarm();

  const augmentedFields = useMemo(() => {
    return fields.map(field => {
      const summary = {
        planted: plantRecords.some(r => r.fieldId === field.id && r.seasonYear === viewingSeason),
        sprayed: sprayRecords.filter(r => r.fieldId === field.id && r.seasonYear === viewingSeason).length,
        fertilized: fertilizerApplications.filter(r => r.fieldId === field.id && r.seasonYear === viewingSeason).length,
      };
      return { ...field, activitySummary: summary };
    });
  }, [fields, plantRecords, sprayRecords, fertilizerApplications, viewingSeason]);

  return (
    <div className="space-y-1">
      {augmentedFields.map(field => (
        <FieldCard key={field.id} field={field} />
      ))}
    </div>
  );
}
