import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { COUNT_CLASSES, COUNT_TITLES } from '@/lib/cattle/counts';
import type { ClassText } from '@/lib/cattle/lines';
import type { CountClass } from '@/types/cattle';

/** One row per class the herd holds, so a load can be 24 steers and 3 cull cows in one save. */
export default function ClassLinesEditor({ idPrefix, counts, text, onChange }: {
  idPrefix: string;
  counts: Record<CountClass, number>;
  text: ClassText;
  onChange: (text: ClassText) => void;
}) {
  const present = COUNT_CLASSES.filter(item => counts[item] > 0);
  if (present.length === 0) return <p className="text-sm text-muted-foreground">This herd has no head.</p>;
  return (
    <div className="space-y-2">
      {present.map(item => (
        <div key={item} className="flex items-center gap-3">
          <Label htmlFor={`${idPrefix}-${item}`} className="w-32 shrink-0">{COUNT_TITLES[item]} <span className="text-muted-foreground">({counts[item]})</span></Label>
          <Input
            id={`${idPrefix}-${item}`} inputMode="numeric" className="h-11" placeholder="0"
            value={text[item]} onChange={event => onChange({ ...text, [item]: event.target.value })}
          />
        </div>
      ))}
    </div>
  );
}
