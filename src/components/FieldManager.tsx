import { useState, useMemo, useCallback } from 'react';
import { useFarm } from '@/store/farmStore';
import { Field } from '@/types/farm';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { buildDisplayFieldAcreMap, getBoundaryFieldAcres } from '@/lib/fieldAcreage';
import { formatMeasurement, roundTo } from '@/utils/numbers';
import FieldManageModal from './FieldManageModal';

// ✅ Fix: Extracted shared card component — eliminates duplication
function FieldCard({
  field,
  displayAcreage,
  boundaryAcreage,
  onEdit,
  onDelete,
}: {
  field: Field;
  displayAcreage: number;
  boundaryAcreage: number | null;
  onEdit: (field: Field) => void;
  onDelete: (id: string) => void;
}) {
  // ✅ Fix: Guard against null/undefined lat/lng
  const coords =
    field.lat != null && field.lng != null
      ? `${field.lat.toFixed(3)}, ${field.lng.toFixed(3)}`
      : '—';
  const roundedDisplayAcreage = roundTo(displayAcreage, 2);
  const roundedBoundaryAcreage = boundaryAcreage == null ? null : roundTo(boundaryAcreage, 2);
  const hasDifferentBoundary = roundedBoundaryAcreage != null && roundedDisplayAcreage !== roundedBoundaryAcreage;

  return (
    <div className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
      <div>
        <span className="font-bold text-foreground text-sm">{field.name}</span>
        <div className="text-xs font-mono text-muted-foreground mt-0.5">
          {formatMeasurement(roundedDisplayAcreage, 'ac', 2)} FSA crop · {coords}
        </div>
        {hasDifferentBoundary && roundedBoundaryAcreage != null && (
          <div className="mt-0.5 text-xs font-mono text-muted-foreground">
            Boundary: {formatMeasurement(roundedBoundaryAcreage, 'ac', 2)}
          </div>
        )}
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onEdit(field)}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Edit field"
        >
          <Pencil size={16} />
        </button>
        <button
          onClick={() => onDelete(field.id)}
          className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Delete field"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

export default function FieldManager() {
  const { fields: allFields, cluAssignments, deleteField, fetchError } = useFarm();

  const [editField, setEditField] = useState<Field | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const commitDelete = useCallback(async (ids: string[]) => {
    const results = await Promise.all(ids.map(id => deleteField(id)));
    if (results.some(r => !r)) {
      throw new Error('One or more field deletions failed');
    }
  }, [deleteField]);

  const { pending: pendingDeletes, requestDelete } = useUndoDelete<string>({
    onCommit: commitDelete,
    onError: () => toast.error('Failed to delete field. It remains visible.'),
  });

  const activeFields = useMemo(() =>
    allFields.filter(f => !f.deleted_at && !pendingDeletes.has(f.id)),
    [allFields, pendingDeletes]
  );
  const displayAcreMap = useMemo(
    () => buildDisplayFieldAcreMap(activeFields, cluAssignments),
    [activeFields, cluAssignments]
  );

  const { rowCrops, pastureHay } = useMemo(() => {
    const sorted = [...activeFields].sort((a, b) => a.name.localeCompare(b.name));

    return {
      rowCrops: sorted.filter(f => {
        const use = (f.intendedUse || '').toLowerCase();
        return !use.includes('pasture') && !use.includes('hay');
      }),
      pastureHay: sorted.filter(f => {
        const use = (f.intendedUse || '').toLowerCase();
        return use.includes('pasture') || use.includes('hay');
      }),
    };
  }, [activeFields]);

  const hasFields = rowCrops.length > 0 || pastureHay.length > 0;
  const bothCategories = rowCrops.length > 0 && pastureHay.length > 0;

  const handleDeleteRequest = (id: string) => {
    const field = allFields.find(f => f.id === id);
    if (!field) return;
    requestDelete([id], `Field "${field.name}" deleted`, field.name);
  };

  return (
    <>
      <div className="space-y-2">
        <button
          onClick={() => setAddOpen(true)}
          className="touch-target w-full flex items-center justify-center gap-2 bg-primary/10 border border-primary/30 text-primary rounded-lg py-3 text-sm font-bold active:scale-95 transition-transform"
        >
          <Plus size={18} />
          Add New Field
        </button>

        {/* ✅ Fix: Empty and Error states */}
        {!hasFields && (
          <div className="text-center py-8 px-4 border border-dashed border-border rounded-lg bg-muted/5">
            {fetchError ? (
              <>
                <p className="text-xs text-destructive font-bold mb-1">
                  Cloud Sync Failed
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Showing local cache. Check your connection.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                No fields added yet. Add your first field above.
              </p>
            )}
          </div>
        )}

        {hasFields && (
          <div className="space-y-4">
            {rowCrops.length > 0 && (
              <div className="space-y-2">
                {/* ✅ Fix: Show "Row Crops" header only when both categories are present */}
                {bothCategories && (
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-tight px-1">
                    Row Crops
                  </h3>
                )}
                {rowCrops.map((field: Field) => (
                  <FieldCard
                    key={field.id}
                    field={field}
                    displayAcreage={displayAcreMap.get(field.id) ?? field.acreage}
                    boundaryAcreage={getBoundaryFieldAcres(field, cluAssignments)}
                    onEdit={setEditField}
                    onDelete={handleDeleteRequest}
                  />
                ))}
              </div>
            )}

            {pastureHay.length > 0 && (
              <div className="space-y-2">
                {bothCategories && (
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-tight px-1">
                    Pasture & Hay
                  </h3>
                )}
                {pastureHay.map((field: Field) => (
                  <FieldCard
                    key={field.id}
                    field={field}
                    displayAcreage={displayAcreMap.get(field.id) ?? field.acreage}
                    boundaryAcreage={getBoundaryFieldAcres(field, cluAssignments)}
                    onEdit={setEditField}
                    onDelete={handleDeleteRequest}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {addOpen && <FieldManageModal open onClose={() => setAddOpen(false)} />}
      {editField && (
        <FieldManageModal open editField={editField} onClose={() => setEditField(null)} />
      )}
    </>
  );
}
