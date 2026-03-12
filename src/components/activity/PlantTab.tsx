import React from 'react';
import { PlantRecord } from '@/types/farm';
import RecordListItem from '@/components/RecordListItem';
import { formatIsoDate } from '@/utils/dates';
import { formatDate } from '@/utils/dates';
import { cleanName } from '@/utils/text';

interface PlantTabProps {
  records: PlantRecord[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  onEdit: (record: PlantRecord) => void;
}

const PlantTab: React.FC<PlantTabProps> = ({ records, selected, onToggle, onEdit }) => {
  if (records.length === 0) {
    return <p className="text-center text-muted-foreground font-mono text-sm py-8">No planting records</p>;
  }

  return (
    <div className="space-y-2">
      {records.map(r => (
        <RecordListItem
          key={r.id}
          id={r.id}
          type="plant"
          title={cleanName(r.fieldName)}
          subtitle={`${r.crop || 'UNSPECIFIED'} · ${r.seedVariety}`}
          details={`${r.acreage} AC · PLANTED`}
          date={formatIsoDate(r.plantDate) || r.plantDate || formatDate(r.timestamp)}
          isSelected={selected.has(r.id)}
          onToggle={onToggle}
          onEdit={() => onEdit(r)}
        />
      ))}
    </div>
  );
};

export default PlantTab;
