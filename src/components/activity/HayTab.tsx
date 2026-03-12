import React from 'react';
import { HayHarvestRecord } from '@/types/farm';
import RecordListItem from '@/components/RecordListItem';
import { formatIsoDate } from '@/utils/dates';
import { formatDate } from '@/utils/dates';
import { cleanName } from '@/utils/text';

interface HayTabProps {
  records: HayHarvestRecord[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  onEdit: (record: HayHarvestRecord) => void;
}

const HayTab: React.FC<HayTabProps> = ({ records, selected, onToggle, onEdit }) => {
  if (records.length === 0) {
    return <p className="text-center text-muted-foreground font-mono text-sm py-8">No hay records</p>;
  }

  return (
    <div className="space-y-2">
      {records.map(r => (
        <RecordListItem
          key={r.id}
          id={r.id}
          type="hay"
          title={cleanName(r.fieldName)}
          subtitle={`${r.baleCount} BALES · ${r.baleType}`}
          details={`CUTTING #${r.cuttingNumber}`}
          date={formatIsoDate(r.date) || r.date || formatDate(r.timestamp)}
          isSelected={selected.has(r.id)}
          onToggle={onToggle}
          onEdit={() => onEdit(r)}
        />
      ))}
    </div>
  );
};

export default HayTab;
