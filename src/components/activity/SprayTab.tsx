import React from 'react';
import { SprayRecord } from '@/types/farm';
import RecordListItem from '@/components/RecordListItem';
import { formatIsoDate } from '@/utils/dates';
import { formatDate } from '@/utils/dates';
import { cleanName } from '@/utils/text';

interface SprayTabProps {
  records: SprayRecord[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  onEdit: (record: SprayRecord) => void;
}

const SprayTab: React.FC<SprayTabProps> = ({ records, selected, onToggle, onEdit }) => {
  if (records.length === 0) {
    return <p className="text-center text-muted-foreground font-mono text-sm py-8">No spray records</p>;
  }

  return (
    <div className="space-y-2">
      {records.map(r => (
        <RecordListItem
          key={r.id}
          id={r.id}
          type="spray"
          title={cleanName(r.fieldName)}
          subtitle={r.products?.map(p => p.product).join(', ') || 'No product'}
          details={`${r.windSpeed} MPH ${r.windDirection} · ${r.temperature}°F`}
          date={formatIsoDate(r.sprayDate) || r.sprayDate || formatDate(r.timestamp)}
          isSelected={selected.has(r.id)}
          onToggle={onToggle}
          onEdit={() => onEdit(r)}
        />
      ))}
    </div>
  );
};

export default SprayTab;
