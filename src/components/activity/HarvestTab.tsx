import { HarvestRecord } from '@/types/farm';
import RecordListItem from '@/components/RecordListItem';
import { formatIsoDate, formatDate } from '@/utils/dates';
import { cleanName } from '@/utils/text';

interface HarvestTabProps {
  records: HarvestRecord[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  onEdit: (record: HarvestRecord) => void;
}
function buildSubtitle(r: HarvestRecord): string {
  return `${r.crop || 'UNSPECIFIED'} · ${r.bushels} BU`;
}

function buildDetails(r: HarvestRecord): string {
  return `${r.moisturePercent}% MST · BIN ${r.binId ? 'ID:' + r.binId : 'N/A'}`;
}

function buildDate(r: HarvestRecord): string {
  return formatIsoDate(r.harvestDate) || formatDate(r.timestamp);
}

export default function HarvestTab({ records, selected, onToggle, onEdit }: HarvestTabProps) {
  if (records.length === 0) {
    return (
      <p className="text-center text-muted-foreground font-mono text-sm py-8">
        No harvest records
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {records.map(r => (
        <RecordListItem
          key={r.id}
          id={r.id}
          type="harvest"
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
