import React from 'react';
import { FertilizerApplication } from '@/types/farm';
import RecordListItem from '@/components/RecordListItem';
import { formatIsoDate } from '@/utils/dates';
import { formatDate } from '@/utils/dates';
import { cleanName } from '@/utils/text';

interface FertilizerTabProps {
  records: FertilizerApplication[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  onEdit: (record: FertilizerApplication) => void;
}

const FertilizerTab: React.FC<FertilizerTabProps> = ({ records, selected, onToggle, onEdit }) => {
  if (records.length === 0) {
    return <p className="text-center text-muted-foreground font-mono text-sm py-8">No fertilizer records</p>;
  }

  return (
    <div className="space-y-2">
      {records.map(r => (
        <RecordListItem
          key={r.id}
          id={r.id}
          type="fertilizer"
          title={cleanName(r.fieldName)}
          subtitle={`${r.fertilizer_formula}`}
          details={`${r.acres} AC · APPLIED`}
          date={formatIsoDate(r.date) || r.date || formatDate(new Date(r.created_at).getTime())}
          isSelected={selected.has(r.id)}
          onToggle={onToggle}
          onEdit={() => onEdit(r)}
        />
      ))}
    </div>
  );
};

export default FertilizerTab;
