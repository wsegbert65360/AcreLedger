import { PlantRecord } from '@/types/farm';
import RecordListItem from '@/components/RecordListItem';
import { formatIsoDate, formatDate } from '@/utils/dates';
import { cleanName } from '@/utils/text';

interface PlantTabProps {
  records: PlantRecord[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  onEdit: (record: PlantRecord) => void;
}
function buildSubtitle(r: PlantRecord): string {
  return `${r.crop || 'UNSPECIFIED'} · ${r.seedVariety}`;
}

function buildDetails(r: PlantRecord): string {
  return `${r.acreage} AC · PLANTED`;
}

function buildDate(r: PlantRecord): string {
  return formatIsoDate(r.plantDate) || formatDate(r.timestamp);
}

export default function PlantTab({ records, selected, onToggle, onEdit }: PlantTabProps) {
  if (records.length === 0) {
    return (
      <p className="text-center text-muted-foreground font-mono text-sm py-8">
        No planting records
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {records.map(r => (
        <RecordListItem
          key={r.id}
          id={r.id}
          type="plant"
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
