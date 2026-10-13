import RecordListItem from '@/components/RecordListItem';
import { harvestCardText } from '@/lib/activityDisplay';
import { useFarm } from '@/store/farmStore';
import { useAppPreferences } from '@/store/useAppPreferences';
import { HarvestRecord } from '@/types/farm';

interface HarvestTabProps {
  records: HarvestRecord[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  onEdit: (record: HarvestRecord) => void;
  onDuplicate?: (record: HarvestRecord) => void;
  /** binId -> display name so cards can say which bin. */
  binNames?: Record<string, string>;
}
export default function HarvestTab({ records, selected, onToggle, onEdit, onDuplicate, binNames }: HarvestTabProps) {
  const { session } = useFarm();
  const { preferences } = useAppPreferences(session?.user?.id ?? null);

  if (records.length === 0) {
    return (
      <p className="text-center text-muted-foreground text-sm py-8">
        No harvest records
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {records.map(r => {
        const text = harvestCardText(r, r.binId ? binNames?.[r.binId] : undefined, preferences.locale);
        return (
          <RecordListItem
            key={r.id}
            id={r.id}
            type="harvest"
            title={text.title}
            subtitle={text.subtitle}
            details={text.details}
            date={text.date}
            isSelected={selected.has(r.id)}
            onToggle={onToggle}
            onEdit={() => onEdit(r)}
            onDuplicate={onDuplicate ? () => onDuplicate(r) : undefined}
          />
        );
      })}
    </div>
  );
}
