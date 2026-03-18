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
function buildSubtitle(m: GrainMovement): string {
  return `${m.type === 'in' ? 'ADDITION' : 'SALE'} · ${m.bushels} BU`;
}

function buildDetails(m: GrainMovement): string {
  return `${m.sourceFieldName || m.destination || 'N/A'} · ${m.moisturePercent}% MST`;
}

export default function GrainTab({ records, selected, onToggle, onEdit }: GrainTabProps) {
  if (records.length === 0) {
    return (
      <p className="text-center text-muted-foreground font-mono text-sm py-8">
        No grain movement records
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {records.map(m => (
        <RecordListItem
          key={m.id}
          id={m.id}
          type="grain"
          title={cleanName(m.binName)}
          subtitle={buildSubtitle(m)}
          details={buildDetails(m)}
          date={formatDate(m.timestamp)}
          isSelected={selected.has(m.id)}
          onToggle={onToggle}
          onEdit={() => onEdit(m)}
          warning={m.bushels < 0}
        />
      ))}
    </div>
  );
}
