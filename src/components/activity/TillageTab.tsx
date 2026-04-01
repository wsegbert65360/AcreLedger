import { TillageRecord } from '@/types/farm';
import RecordListItem from '@/components/RecordListItem';
import { formatIsoDate, formatDate } from '@/utils/dates';
import { cleanName } from '@/utils/text';

interface TillageTabProps {
  records: TillageRecord[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  onEdit: (record: TillageRecord) => void;
}

function buildSubtitle(r: TillageRecord): string {
  return r.implementType;
}

function buildDetails(r: TillageRecord): string {
  return r.notes || 'No notes';
}

function buildDate(r: TillageRecord): string {
  return formatIsoDate(r.date) || formatDate(r.timestamp);
}

export default function TillageTab({ records, selected, onToggle, onEdit }: TillageTabProps) {
  if (records.length === 0) {
    return (
      <p className="text-center text-muted-foreground font-mono text-sm py-8">
        No tillage records
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {records.map(r => (
        <RecordListItem
          key={r.id}
          id={r.id}
          type="tillage"
          title={cleanName(r.fieldName)}
          subtitle={buildSubtitle(r)}
          details={buildDetails(r)}
          date={buildDate(r)}
          isSelected={selected.has(r.id)}
          onToggle={onToggle}
          onEdit={() => onEdit(r)}
        />
      ))}
    </div>
  );
}
