import React from 'react';
import { HarvestRecord } from '@/types/farm';
import RecordListItem from '@/components/RecordListItem';
import { formatIsoDate } from '@/utils/dates';
import { formatDate } from '@/utils/dates';
import { cleanName } from '@/utils/text';

interface HarvestTabProps {
  records: HarvestRecord[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  onEdit: (record: HarvestRecord) => void;
}

const HarvestTab: React.FC<HarvestTabProps> = ({ records, selected, onToggle, onEdit }) => {
  if (records.length === 0) {
    return <p className="text-center text-muted-foreground font-mono text-sm py-8">No harvest records</p>;
  }

  return (
    <div className="space-y-2">
      {records.map(r => (
        <RecordListItem
          key={r.id}
          id={r.id}
          type="harvest"
          title={cleanName(r.fieldName)}
          subtitle={`${r.crop || 'UNSPECIFIED'} · ${r.bushels} BU`}
          details={`${r.moisturePercent}% MST · BIN ${r.binId ? 'ID:' + r.binId : 'N/A'}`}
          date={formatIsoDate(r.harvestDate) || r.harvestDate || formatDate(r.timestamp)}
          isSelected={selected.has(r.id)}
          onToggle={onToggle}
          onEdit={() => onEdit(r)}
        />
      ))}
    </div>
  );
};

export default HarvestTab;
