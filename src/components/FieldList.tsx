import { useMemo, useCallback, useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

import { useFarm } from '@/store/farmStore';
import { Field } from '@/types/farm';
import { buildDisplayFieldAcreMap } from '@/lib/fieldAcreage';
import { getFieldThumbnailGeometry } from '@/lib/fieldThumbnail';
import { loadBundledFsaTracts, mergeBundledFsaTracts } from '@/lib/bundledFsaTracts';
import { usePullToRefresh } from '@/hooks/use-pull-refresh';

import FieldCard from './FieldCard';

interface FieldListProps {
  fields: Field[];
}

export default function FieldList({ fields }: FieldListProps) {
  const { plantRecords, sprayRecords, fertilizerApplications, cluAssignments, fsaTracts, viewingSeason, refresh } = useFarm();
  const [bundledTracts, setBundledTracts] = useState<Awaited<ReturnType<typeof loadBundledFsaTracts>>>([]);

  useEffect(() => {
    let cancelled = false;
    loadBundledFsaTracts()
      .then(tracts => {
        if (!cancelled) setBundledTracts(tracts);
      })
      .catch(err => {
        console.error('[FieldList] Failed to load bundled FSA tracts:', err);
        if (!cancelled) setBundledTracts([]);
      });
    return () => { cancelled = true; };
  }, []);

  const mergedTracts = useMemo(
    () => mergeBundledFsaTracts(fsaTracts, bundledTracts),
    [fsaTracts, bundledTracts],
  );

  const augmentedFields = useMemo(() => {
    const displayAcreMap = buildDisplayFieldAcreMap(fields, cluAssignments);

    return fields.map(field => {
      const summary = {
        planted: plantRecords.some(r => r.fieldId === field.id && r.seasonYear === viewingSeason),
        sprayed: sprayRecords.filter(r => r.fieldId === field.id && r.seasonYear === viewingSeason).length,
        fertilized: fertilizerApplications.filter(r => r.fieldId === field.id && r.seasonYear === viewingSeason).length,
      };
      return {
        ...field,
        activitySummary: summary,
        displayAcreage: displayAcreMap.get(field.id) ?? field.acreage,
        thumbnailGeometry: getFieldThumbnailGeometry(field, cluAssignments, mergedTracts),
      };
    });
  }, [fields, plantRecords, sprayRecords, fertilizerApplications, cluAssignments, mergedTracts, viewingSeason]);

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
