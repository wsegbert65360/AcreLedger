import { useEffect, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { native } from '@/lib/native';
import { Field, HarvestRecord } from '@/types/farm';
import { roundTo } from '@/utils/numbers';

interface HarvestMoveFieldDialogProps {
  open: boolean;
  onClose: () => void;
  record: HarvestRecord | null;
  fields: Field[];
  onConfirm: (newFieldId: string, reason?: string) => Promise<boolean>;
}

export default function HarvestMoveFieldDialog({
  open, onClose, record, fields, onConfirm,
}: HarvestMoveFieldDialogProps) {
  const [targetFieldId, setTargetFieldId] = useState('');
  const [reason, setReason] = useState('');
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    if (open) {
      setTargetFieldId('');
      setReason('');
      setIsMoving(false);
    }
  }, [open, record?.id]);

  const eligibleFields = fields
    .filter(field => !field.deleted_at && field.id !== record?.fieldId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const targetField = eligibleFields.find(field => field.id === targetFieldId);
  const canConfirm = !!targetField && !isMoving;

  const handleConfirm = async () => {
    if (!record || !targetField) return;
    setIsMoving(true);
    const success = await onConfirm(targetField.id, reason.trim() || undefined);
    setIsMoving(false);
    if (success) {
      native.haptic.success();
      onClose();
    } else {
      native.haptic.error();
    }
  };

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={value => { if (!value && !isMoving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft size={16} className="text-harvest" />
            Move Harvest to Another Field
          </DialogTitle>
          <DialogDescription>
            Reassign this truckload to a different field without deleting and re-entering it.
            Season totals and the linked grain movement follow the load.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="harvestMoveField">New field</Label>
            <Select value={targetFieldId} onValueChange={setTargetFieldId}>
              <SelectTrigger id="harvestMoveField" aria-label="New field" className="h-11 w-full">
                {targetField ? targetField.name : 'Choose a field…'}
              </SelectTrigger>
              <SelectContent>
                {eligibleFields.map(field => (
                  <SelectItem key={field.id} value={field.id}>{field.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {eligibleFields.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No other active fields on this farm.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="harvestMoveReason">Reason (optional)</Label>
            <Textarea
              id="harvestMoveReason"
              name="harvestMoveReason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Loaded from the wrong field at the truck"
              className="min-h-[72px]"
            />
          </div>

          {targetField && (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs font-medium text-foreground">
              Move {roundTo(record.bushels, 2)} bu from{' '}
              <span className="font-bold">{record.fieldName}</span> to{' '}
              <span className="font-bold">{targetField.name}</span>?
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isMoving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canConfirm}>
            {isMoving ? 'Moving…' : 'Confirm Move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
