import React from 'react';
import { GrainMovement } from '@/types/farm';
import RecordListItem from '@/components/RecordListItem';
import { formatDate } from '@/utils/dates';
import { cleanName } from '@/utils/text';

interface GrainTabProps {
  records: GrainMovement[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  onEdit: (record: GrainMovement) => void;
}

const GrainTab: React.FC<GrainTabProps> = ({ records, selected, onToggle, onEdit }) => {
  if (records.length === 0) {
    return <p className="text-center text-muted-foreground font-mono text-sm py-8">No grain movement records</p>;
  }

  return (
    <div className="space-y-2">
      {records.map(m => (
        <RecordListItem
          key={m.id}
          id={m.id}
          type="grain"
          title={cleanName(m.binName)}
          subtitle={`${m.type === 'in' ? 'ADDITION' : 'SALE'} · ${m.bushels} BU`}
          details={`${m.sourceFieldName || m.destination || 'N/A'} · ${m.moisturePercent}% MST`}
          date={formatDate(m.timestamp)}
          isSelected={selected.has(m.id)}
          onToggle={onToggle}
          onEdit={() => onEdit(m)}
        />
      ))}
    </div>
  );
};

export default GrainTab;
