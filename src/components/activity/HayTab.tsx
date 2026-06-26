import { HayHarvestRecord } from '@/types/farm';
import RecordListItem from '@/components/RecordListItem';
import { formatIsoDate, formatDate } from '@/utils/dates';
import { cleanName } from '@/utils/text';

interface HayTabProps {
  records: HayHarvestRecord[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  onEdit: (record: HayHarvestRecord) => void;
  onDuplicate?: (record: HayHarvestRecord) => void;
}
function buildSubtitle(r: HayHarvestRecord): string {
  return `${r.baleCount} BALES · ${r.baleType}`;
}

function buildDetails(r: HayHarvestRecord): string {
  return `CUTTING #${r.cuttingNumber}`;
}

function buildDate(r: HayHarvestRecord): string {
  return formatIsoDate(r.date) || formatDate(r.timestamp);
}

export default function HayTab({ records, selected, onToggle, onEdit, onDuplicate }: HayTabProps) {
  if (records.length === 0) {
    return (
      <p className="text-center text-muted-foreground text-sm py-8">
        No hay records
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {records.map(r => (
        <RecordListItem
          key={r.id}
          id={r.id}
          type="hay"
          title={cleanName(r.fieldName)}
          subtitle={buildSubtitle(r)}
          details={buildDetails(r)}
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
