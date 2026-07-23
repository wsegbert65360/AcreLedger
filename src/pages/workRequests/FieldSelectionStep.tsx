import { useMemo } from 'react';
import { useFarm } from '@/store/farmStore';
import { getDisplayFieldAcres } from '@/lib/fieldAcreage';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';

interface FieldSelectionStepProps {
  selectedFieldIds: Set<string>;
  setFieldIds: (ids: string[]) => void;
  totalSelectedAcres: number;
}

interface FieldGroup {
  farmKey: string;
  farmName: string;
  fields: { id: string; name: string; acreage: number }[];
}

/** Build a stable grouping key for fields (farm name today — single-farm app). */
function groupKey(farmName: string): string {
  return farmName || 'Farm';
}

export default function FieldSelectionStep({ selectedFieldIds, setFieldIds, totalSelectedAcres }: FieldSelectionStepProps) {
  const { fields, cluAssignments, farmName } = useFarm();
  const activeFarmName = farmName || 'Home Farm';

  const groups: FieldGroup[] = useMemo(() => {
    const byFarm = new Map<string, FieldGroup>();
    for (const field of fields) {
      if (field.deleted_at) continue;
      const key = groupKey(activeFarmName);
      let group = byFarm.get(key);
      if (!group) {
        group = { farmKey: key, farmName: activeFarmName, fields: [] };
        byFarm.set(key, group);
      }
      group.fields.push({
        id: field.id,
        name: field.name,
        acreage: getDisplayFieldAcres(field, cluAssignments),
      });
    }
    return [...byFarm.values()];
  }, [fields, cluAssignments, activeFarmName]);

  const allFieldIds = useMemo(() => groups.flatMap(g => g.fields.map(f => f.id)), [groups]);
  const allSelected = allFieldIds.length > 0 && allFieldIds.every(id => selectedFieldIds.has(id));

  const toggleField = (id: string) => {
    const next = new Set(selectedFieldIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFieldIds([...next]);
  };

  const toggleFarm = (group: FieldGroup) => {
    const groupIds = group.fields.map(f => f.id);
    const allInGroup = groupIds.every(id => selectedFieldIds.has(id));
    const next = new Set(selectedFieldIds);
    if (allInGroup) {
      groupIds.forEach(id => next.delete(id));
    } else {
      groupIds.forEach(id => next.add(id));
    }
    setFieldIds([...next]);
  };

  const selectAll = () => setFieldIds(allFieldIds);
  const clearAll = () => setFieldIds([]);

  if (groups.length === 0 || allFieldIds.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No fields available. Add a field first to create a work request.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-foreground">Select fields</h3>
          <p className="text-xs text-muted-foreground">Choose one, several, or all fields for this request.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={selectAll} disabled={allSelected}>
            Select All Fields
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={clearAll} disabled={selectedFieldIds.size === 0}>
            Clear All
          </Button>
        </div>
      </div>

      {/* Running total */}
      <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>Selected fields</span>
          <span className="text-foreground font-bold">{selectedFieldIds.size}</span>
        </div>
        <div className="flex justify-between">
          <span>Selected acres</span>
          <span className="text-foreground font-bold">{totalSelectedAcres.toLocaleString()} ac</span>
        </div>
      </div>

      {groups.map(group => {
        const groupIds = group.fields.map(f => f.id);
        const allInGroup = groupIds.every(id => selectedFieldIds.has(id));
        const someInGroup = groupIds.some(id => selectedFieldIds.has(id));
        return (
          <div key={group.farmKey} className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-border/50 bg-muted/20 px-3 py-2">
              <Checkbox
                id={`farm-${group.farmKey}`}
                checked={allInGroup ? true : someInGroup ? 'indeterminate' : false}
                onCheckedChange={() => toggleFarm(group)}
              />
              <Label htmlFor={`farm-${group.farmKey}`} className="text-sm font-bold text-foreground">
                {group.farmName} <span className="text-muted-foreground font-normal">({group.fields.length} fields)</span>
              </Label>
            </div>
            <ul className="divide-y divide-border/40">
              {group.fields.map(field => (
                <li key={field.id}>
                  <label htmlFor={`field-${field.id}`} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30">
                    <Checkbox
                      id={`field-${field.id}`}
                      checked={selectedFieldIds.has(field.id)}
                      onCheckedChange={() => toggleField(field.id)}
                    />
                    <MapPin size={14} className="text-muted-foreground shrink-0" />
                    <span className="text-sm text-foreground flex-1">{field.name}</span>
                    <span className="text-xs font-mono text-muted-foreground">{field.acreage.toLocaleString()} ac</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
