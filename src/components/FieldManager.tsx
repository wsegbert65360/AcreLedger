import { useState, useMemo } from 'react';
import { useFarm } from '@/store/farmStore';
import { Field } from '@/types/farm';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import FieldManageModal from './FieldManageModal';

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
      })
    };
  }, [allFields]);

  const [editField, setEditField] = useState<Field | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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

        {[...rowCrops, ...pastureHay].length > 0 && (
          <div className="space-y-4">
            {rowCrops.length > 0 && (
              <div className="space-y-2">
                {pastureHay.length > 0 && (
                  <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Row Crops</h3>
                )}
                {rowCrops.map((field: Field) => (
                  <div key={field.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-foreground text-sm">{field.name}</span>
                      <div className="text-xs font-mono text-muted-foreground mt-0.5">
                        {field.acreage} ac · {field.lat.toFixed(3)}, {field.lng.toFixed(3)}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditField(field)}
                        className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(field.id)}
                        className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pastureHay.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Pasture & Hay</h3>
                {pastureHay.map((field: Field) => (
                  <div key={field.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-foreground text-sm">{field.name}</span>
                      <div className="text-xs font-mono text-muted-foreground mt-0.5">
                        {field.acreage} ac · {field.lat.toFixed(3)}, {field.lng.toFixed(3)}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditField(field)}
                        className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(field.id)}
                        className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {addOpen && (
        <FieldManageModal open onClose={() => setAddOpen(false)} />
      )}
      {editField && (
        <FieldManageModal open editField={editField} onClose={() => setEditField(null)} />
      )}

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-card border-destructive/30 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete Field</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently remove this field. Existing records will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="touch-target border-border text-muted-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteConfirm) deleteField(deleteConfirm); setDeleteConfirm(null); }}
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
