import { FertilizerApplication } from '@/types/farm';
import RecordListItem from '@/components/RecordListItem';
import { formatIsoDate, formatDate } from '@/utils/dates';
import { cleanName } from '@/utils/text';

interface FertilizerTabProps {
  records: FertilizerApplication[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  onEdit: (record: FertilizerApplication) => void;
  onDuplicate?: (record: FertilizerApplication) => void;
}
function buildDate(r: FertilizerApplication): string {
  return formatIsoDate(r.date) || formatDate(r.timestamp);
}

export default function FertilizerTab({ records, selected, onToggle, onEdit, onDuplicate }: FertilizerTabProps) {
  if (records.length === 0) {
    return (
      <p className="text-center text-muted-foreground text-sm py-8">
        No fertilizer records
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {records.map(r => (
        <RecordListItem
          key={r.id}
          id={r.id}
          type="fertilizer"
          title={cleanName(r.fieldName)}
          subtitle={r.fertilizer_formula}
          details={`${r.acres} AC · APPLIED`}
          date={buildDate(r)}
          isSelected={selected.has(r.id)}
          onToggle={onToggle}
          onEdit={() => onEdit(r)}
          onDuplicate={onDuplicate ? () => onDuplicate(r) : undefined}
        />
      ))}
    </div>
  );
}
