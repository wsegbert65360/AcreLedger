import { Link } from 'react-router-dom';
import { Beef } from 'lucide-react';

import { restDaysSinceLastGrazed } from '@/lib/cattle/derived';
import { localTodayIso } from '@/lib/equipment';
import { useFarm } from '@/store/farmStore';

/** "Cattle here now" and "Last grazed / rest days" for a field. Renders nothing while cattle is off. */
export default function FieldCattleSummary({ fieldId }: { fieldId: string }) {
  const { runsCattle, cattleGroups, cattleMoves } = useFarm();
  if (!runsCattle) return null;

  const here = (cattleGroups ?? []).filter(group => !group.deleted_at && group.currentFieldId === fieldId);
  const rest = restDaysSinceLastGrazed(fieldId, cattleMoves ?? [], localTodayIso());
  const restText = rest === null ? 'Never grazed' : rest === 0 ? 'Grazing now' : `${rest} day${rest === 1 ? '' : 's'} of rest`;

  return (
    <div className="space-y-2 border-t border-border/70 pt-4" data-testid="field-cattle-summary">
      <h4 className="flex items-center gap-2 text-sm font-bold"><Beef size={16} className="text-primary" />Cattle</h4>
      <div className="grid grid-cols-2 gap-4 text-xs">
        <div>
          <span className="mb-0.5 block text-xs font-semibold text-muted-foreground">Cattle here now</span>
          {here.length === 0 ? <div className="font-bold text-foreground">None</div> : here.map(group => (
            <Link key={group.id} to={`/cattle/${group.id}`} className="block min-h-11 py-2 font-bold text-primary">
              {group.name} · {group.headCount} head
            </Link>
          ))}
        </div>
        <div>
          <span className="mb-0.5 block text-xs font-semibold text-muted-foreground">Last grazed</span>
          <div className="font-bold text-foreground">{restText}</div>
        </div>
      </div>
    </div>
  );
}
