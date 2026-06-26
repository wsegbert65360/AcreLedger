import { SprayRecord } from '@/types/farm';
import RecordListItem from '@/components/RecordListItem';
import { formatIsoDate, formatDate } from '@/utils/dates';
import { cleanName } from '@/utils/text';

interface SprayTabProps {
  records: SprayRecord[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  onEdit: (record: SprayRecord) => void;
  onDuplicate?: (record: SprayRecord) => void;
}

function buildDetails(r: SprayRecord): string {
  const wind = r.windSpeed != null
    ? `${r.windSpeed} MPH ${r.windDirection || ''}`.trim()
    : null;
  const temp = r.temperature != null
    ? `${r.temperature}°F`
    : null;
  return [wind, temp].filter(Boolean).join(' · ') || '—';
}

function buildSubtitle(r: SprayRecord): string {
  const names = r.products?.map(p => p.product).filter(Boolean).join(', ');
  return names || 'No products recorded';
}

function buildDate(r: SprayRecord): string {
  // Never pass raw r.sprayDate to the UI — always format or fall back to timestamp
  return formatIsoDate(r.sprayDate) || formatDate(r.timestamp);
}

export default function SprayTab({ records, selected, onToggle, onEdit, onDuplicate }: SprayTabProps) {
  if (records.length === 0) {
    return (
      <p className="text-center text-muted-foreground text-sm py-8">
        No spray records
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {records.map(r => (
        <RecordListItem
          key={r.id}
          id={r.id}
          type="spray"
          title={cleanName(r.fieldName)}
          subtitle={buildSubtitle(r)}
          details={buildDetails(r)}
          date={buildDate(r)}
          isSelected={selected.has(r.id)}
          onToggle={onToggle}
          onEdit={() => onEdit(r)}
          onDuplicate={onDuplicate ? () => onDuplicate(r) : undefined}
          warning={r.nonCompliant}
        />
      ))}
    </div>
  );
}