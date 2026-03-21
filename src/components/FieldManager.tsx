import { useState, useMemo } from 'react';
import { useFarm } from '@/store/farmStore';
import { Field } from '@/types/farm';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import FieldManageModal from './FieldManageModal';

// ✅ Fix: Extracted shared card component — eliminates duplication
function FieldCard({
  field,
  onEdit,
  onDelete,
}: {
  field: Field;
  onEdit: (field: Field) => void;
  onDelete: (id: string) => void;
}) {
  // ✅ Fix: Guard against null/undefined lat/lng
  const coords =
    field.lat != null && field.lng != null
      ? `${field.lat.toFixed(3)}, ${field.lng.toFixed(3)}`
      : '—';

  return (
    <div className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
      <div>
        <span className="font-bold text-foreground text-sm">{field.name}</span>
        <div className="text-xs font-mono text-muted-foreground mt-0.5">
          {field.acreage} ac · {coords}
        </div>
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onEdit(field)}
          className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Edit field"
        >
          <Pencil size={16} />
        </button>
        <button
          onClick={() => onDelete(field.id)}
          className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Delete field"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

export default function FieldManager() {
  const { fields: allFields, deleteField } = useFarm();
  const { rowCrops, pastureHay } = useMemo(() => {
    const activeFields = allFields.filter(f => !f.deleted_at);
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
  }, [allFields]);

  const [editField, setEditField] = useState<Field | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const hasFields = rowCrops.length > 0 || pastureHay.length > 0; // ✅ Fix: no unnecessary array spread
  const bothCategories = rowCrops.length > 0 && pastureHay.length > 0; // ✅ Fix: used for header visibility

  // ✅ Fix: Look up field name for use in delete dialog
  const fieldToDelete = allFields.find(f => f.id === deleteConfirm);

  return (
    <>
      <div className="space-y-2">
        <button
          onClick={() => setAddOpen(true)}
          className="touch-target w-full flex items-center justify-center gap-2 bg-primary/10 border border-primary/30 text-primary rounded-lg py-3 font-mono text-sm font-bold active:scale-95 transition-transform"
        >
          <Plus size={18} />
          Add New Field
        </button>

        {/* ✅ Fix: Empty state */}
        {!hasFields && (
          <p className="text-xs font-mono text-muted-foreground text-center py-4">
            No fields added yet. Add your first field above.
          </p>
        )}

        {hasFields && (
          <div className="space-y-4">
            {rowCrops.length > 0 && (
              <div className="space-y-2">
                {/* ✅ Fix: Show "Row Crops" header only when both categories are present */}
                {bothCategories && (
                  <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">
                    Row Crops
                  </h3>
                )}
                {rowCrops.map((field: Field) => (
                  <FieldCard
                    key={field.id}
                    field={field}
                    onEdit={setEditField}
                    onDelete={setDeleteConfirm}
                  />
                ))}
              </div>
            )}

            {pastureHay.length > 0 && (
              <div className="space-y-2">
                {bothCategories && (
                  <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">
                    Pasture & Hay
                  </h3>
                )}
                {pastureHay.map((field: Field) => (
                  <FieldCard
                    key={field.id}
                    field={field}
                    onEdit={setEditField}
                    onDelete={setDeleteConfirm}
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

      {/* ✅ Fix: onOpenChange respects the boolean argument */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent className="bg-card border-destructive/30 max-w-sm">
          <AlertDialogHeader>
            {/* ✅ Fix: Show the field name in the dialog */}
            <AlertDialogTitle className="text-foreground">
              Delete &ldquo;{fieldToDelete?.name ?? 'this field'}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently remove this field. Existing records will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="touch-target border-border text-muted-foreground">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirm) deleteField(deleteConfirm);
                setDeleteConfirm(null);
              }}
              className="touch-target bg-destructive text-destructive-foreground glow-destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}