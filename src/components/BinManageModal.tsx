import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFarm } from '@/store/farmStore';
import { Bin } from '@/types/farm';
import { Warehouse, Plus, Pencil, Trash2 } from 'lucide-react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface BinManageModalProps {
    open: boolean;
    onClose: () => void;
    editBin?: Bin | null;
}

export default function BinManageModal({ open, onClose, editBin }: BinManageModalProps) {
    const { addBin, updateBin } = useFarm();
    const [name, setName] = useState(editBin?.name || '');
    const [capacity, setCapacity] = useState(editBin?.capacity?.toString() || '');

    const isEdit = !!editBin;

    const handleSubmit = () => {
        const cap = parseInt(capacity);
        if (!name.trim() || isNaN(cap)) return;

        if (isEdit) {
            updateBin({ id: editBin.id, name: name.trim(), capacity: cap });
        } else {
            addBin({ name: name.trim(), capacity: cap });
        }
        onClose();
    };

    const valid = name.trim() && capacity;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-card border-harvest/30 max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-harvest">
                        {isEdit ? <Pencil size={20} /> : <Warehouse size={20} />}
                        {isEdit ? 'Edit Bin' : 'Add Bin'}
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div>
                        <Label htmlFor="binName" className="text-muted-foreground font-mono text-xs">BIN NAME</Label>
                        <Input
                            id="binName"
                            name="binName"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Bin #4"
                            className="mt-1 bg-muted border-border text-foreground"
                            autoFocus
                        />
                    </div>
                    <div>
                        <Label htmlFor="binCapacity" className="text-muted-foreground font-mono text-xs">CAPACITY (BUSHELS)</Label>
                        <Input
                            id="binCapacity"
                            name="binCapacity"
                            type="number"
                            value={capacity}
                            onChange={e => setCapacity(e.target.value)}
                            placeholder="10000"
                            className="mt-1 bg-muted border-border text-foreground"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        onClick={handleSubmit}
                        disabled={!valid}
                        className="touch-target w-full bg-harvest text-harvest-foreground hover:bg-harvest/90 glow-harvest font-bold"
                    >
                        {isEdit ? 'Save Changes' : 'Add Bin'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function BinManager() {
    const { bins, deleteBin } = useFarm();
    const [editBin, setEditBin] = useState<Bin | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    return (
        <>
            <div className="space-y-2">
                <button
                    onClick={() => setAddOpen(true)}
                    className="touch-target w-full flex items-center justify-center gap-2 bg-harvest/10 border border-harvest/30 text-harvest rounded-lg py-3 font-mono text-sm font-bold active:scale-95 transition-transform"
                >
                    <Plus size={18} />
                    Add New Bin
                </button>

                {bins.map(bin => (
                    <div key={bin.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
                        <div>
                            <span className="font-bold text-foreground text-sm">{bin.name}</span>
                            <div className="text-xs font-mono text-muted-foreground mt-0.5">
                                {bin.capacity.toLocaleString()} bu capacity
                            </div>
                        </div>
                        <div className="flex gap-1">
                            <button
                                onClick={() => setEditBin(bin)}
                                className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <Pencil size={16} />
                            </button>
                            <button
                                onClick={() => setDeleteConfirm(bin.id)}
                                className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {addOpen && (
                <BinManageModal open onClose={() => setAddOpen(false)} />
            )}
            {editBin && (
                <BinManageModal open editBin={editBin} onClose={() => setEditBin(null)} />
            )}

            <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
                <AlertDialogContent className="bg-card border-destructive/30 max-w-sm">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">Delete Bin</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            This will permanently remove this bin. Grain movement records associated with this bin ID will remain but may not display correctly.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="touch-target border-border text-muted-foreground">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => { if (deleteConfirm) deleteBin(deleteConfirm); setDeleteConfirm(null); }}
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
