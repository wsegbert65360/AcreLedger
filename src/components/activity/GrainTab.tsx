import { GrainMovement } from '@/types/farm';
import RecordListItem from '@/components/RecordListItem';
import { grainCardText } from '@/lib/activityDisplay';

interface GrainTabProps {
  records: GrainMovement[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  onEdit: (record: GrainMovement) => void;
  onDuplicate?: (record: GrainMovement) => void;
}

export default function GrainTab({ records, selected, onToggle, onEdit, onDuplicate }: GrainTabProps) {
  if (records.length === 0) {
    return (
      <p className="text-center text-muted-foreground text-sm py-8">
        No grain movement records
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {records.map(m => {
        const text = grainCardText(m);
        return (
          <RecordListItem
            key={m.id}
            id={m.id}
            type="grain"
            title={text.title}
            subtitle={text.subtitle}
            details={text.details}
            date={text.date}
            isSelected={selected.has(m.id)}
            onToggle={onToggle}
            onEdit={() => onEdit(m)}
            onDuplicate={onDuplicate ? () => onDuplicate(m) : undefined}
            warning={m.bushels < 0}
          />
        );
      })}
    </div>
  );
}
