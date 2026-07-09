import { CustomSprayRecord } from '@/types/farm';
import RecordListItem from '@/components/RecordListItem';
import { formatIsoDate, formatDate } from '@/utils/dates';
import { cleanName } from '@/utils/text';

interface CustomSprayTabProps {
  records: CustomSprayRecord[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  onEdit: (record: CustomSprayRecord) => void;
  onDuplicate?: (record: CustomSprayRecord) => void;
}

function buildSubtitle(r: CustomSprayRecord): string {
  return r.applicator || 'Unknown applicator';
}

function buildDetails(r: CustomSprayRecord): string {
  const wind = r.windSpeed != null ? `${r.windSpeed} MPH ${r.windDirection || ''}`.trim() : null;
  const temp = r.temperature != null ? `${r.temperature}°F` : null;
  const conditions = [wind, temp].filter(Boolean).join(' · ');
  const recipe = r.recipe || 'No recipe recorded';
  return conditions ? `${recipe} · ${conditions}` : recipe;
}

function buildDate(r: CustomSprayRecord): string {
  return formatIsoDate(r.date) || formatDate(r.timestamp);
}

export default function CustomSprayTab({ records, selected, onToggle, onEdit, onDuplicate }: CustomSprayTabProps) {
  if (records.length === 0) {
    return (
      <p className="text-center text-muted-foreground text-sm py-8">
        No custom spray records
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {records.map(r => (
        <RecordListItem
          key={r.id}
          id={r.id}
          type="customSpray"
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
