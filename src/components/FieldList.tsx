import { useMemo, useCallback } from 'react';
import { useFarm } from '@/store/farmStore';
import { Field } from '@/types/farm';
import FieldCard from './FieldCard';
import { usePullToRefresh } from '@/hooks/use-pull-refresh';
import { RefreshCw } from 'lucide-react';

interface FieldListProps {
  fields: Field[];
}

export default function FieldList({ fields }: FieldListProps) {
  const { plantRecords, sprayRecords, fertilizerApplications, viewingSeason, refresh } = useFarm();

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

  const handleRefresh = useCallback(async () => {
    if (refresh) await refresh();
  }, [refresh]);

  const { refreshing, pullStyle, handlers } = usePullToRefresh({ onRefresh: handleRefresh });

  return (
    <div className="relative">
      {/* Pull indicator */}
      {refreshing && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
          <RefreshCw size={14} className="animate-spin text-primary" />
          Refreshing…
        </div>
      )}
      <div
        style={pullStyle}
        className="space-y-1"
        {...handlers}
      >
        {augmentedFields.map(field => (
          <FieldCard key={field.id} field={field} />
        ))}
      </div>
    </div>
  );
}
