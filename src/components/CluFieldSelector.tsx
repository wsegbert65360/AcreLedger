import { useState, useMemo } from 'react';
import { Plus, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFarm } from '@/store/farmStore';
import type { CluLandUse, FieldCluAssignment } from '@/types/fsaTract';

interface CluFieldSelectorProps {
  selectedFieldId: string | null;
  onSelectField: (fieldId: string | null) => void;
  selectedLandUse: CluLandUse;
  onSelectLandUse: (landUse: CluLandUse) => void;
  onCreateField: (name: string) => Promise<string | null>;
  assignments: FieldCluAssignment[];
}

export default function CluFieldSelector({
  selectedFieldId,
  onSelectField,
  selectedLandUse,
  onSelectLandUse,
  onCreateField,
  assignments,
}: CluFieldSelectorProps) {
  const { fields } = useFarm();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const activeAssignments = assignments.filter(a => a.fieldId === selectedFieldId && !a.deletedAt);
  const totalAcres = activeAssignments.reduce((sum, a) => sum + a.acres, 0);
  const croplandAcres = activeAssignments
    .filter(a => a.landUse === 'cropland')
    .reduce((sum, a) => sum + a.acres, 0);
  const nonCroplandAcres = activeAssignments
    .filter(a => a.landUse === 'non_cropland')
    .reduce((sum, a) => sum + a.acres, 0);
  const selectedField = fields.find(f => f.id === selectedFieldId);

  const assignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of assignments) {
      if (a.deletedAt) continue;
      counts.set(a.fieldId, (counts.get(a.fieldId) || 0) + 1);
    }
    return counts;
  }, [assignments]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const id = await onCreateField(newName.trim());
    if (id) {
      onSelectField(id);
      setNewName('');
      setIsCreating(false);
    }
    setCreating(false);
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 bg-background/95 backdrop-blur border-t border-border p-3 space-y-2">
      {selectedField && activeAssignments.length > 0 && (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Check size={12} className="text-green-500" />
          {selectedField.name}: {activeAssignments.length} CLU{activeAssignments.length !== 1 ? 's' : ''} ({totalAcres.toFixed(1)} ac)
          <span className="font-mono text-[10px]">
            {croplandAcres.toFixed(1)} crop / {nonCroplandAcres.toFixed(1)} non-crop
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant={selectedLandUse === 'cropland' ? 'default' : 'outline'}
          className="h-9 text-xs"
          onClick={() => onSelectLandUse('cropland')}
        >
          Cropland
        </Button>
        <Button
          type="button"
          size="sm"
          variant={selectedLandUse === 'non_cropland' ? 'default' : 'outline'}
          className="h-9 text-xs"
          onClick={() => onSelectLandUse('non_cropland')}
        >
          Non-cropland
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Select a field and land use, then tap CLUs. Tap an assigned CLU with the other land use selected to re-label it.
      </p>

      {isCreating ? (
        <div className="flex items-center gap-2">
          <Input
            placeholder="Field name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            autoFocus
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={handleCreate} disabled={creating || !newName.trim()}>
            <Plus size={14} className="mr-1" />
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setIsCreating(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <select
            value={selectedFieldId ?? ''}
            onChange={e => onSelectField(e.target.value || null)}
            className="flex-1 h-8 text-sm rounded-md border border-input bg-background px-2"
          >
            <option value="">Select a field to assign CLUs...</option>
            {fields.map(f => {
              const cluCount = assignmentCounts.get(f.id) || 0;
              const cluLabel = cluCount > 0 ? ` · ${cluCount} CLU${cluCount !== 1 ? 's' : ''}` : ' · No CLUs';
              return (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.acreage} ac{cluLabel})
                </option>
              );
            })}
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCreating(true)}
            className="shrink-0"
          >
            <Plus size={14} className="mr-1" />
            New Field
          </Button>
        </div>
      )}
    </div>
  );
}
