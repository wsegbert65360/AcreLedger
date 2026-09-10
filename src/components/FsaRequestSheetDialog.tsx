import { useEffect, useMemo, useRef, useState } from 'react';
import { FileDown } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { collectKnownFsaTracts, createFsaOfficeRequestSheet } from '@/lib/fsaOfficeRequestSheet';
import { useFarm } from '@/store/farmStore';

interface FsaRequestSheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function readUserMetadataName(metadata: Record<string, unknown> | null | undefined): string {
  const fullName = metadata?.full_name;
  if (typeof fullName === 'string' && fullName.trim()) return fullName.trim();
  const name = metadata?.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return '';
}

/**
 * Collects the operator's contact details (prefilled from the app when
 * available), then downloads the personalized one-page FSA request sheet.
 * Nothing entered here is persisted to the database.
 */
export default function FsaRequestSheetDialog({ open, onOpenChange }: FsaRequestSheetDialogProps) {
  const { farmName, session, fields } = useFarm();

  const [operatorName, setOperatorName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [countyState, setCountyState] = useState('');
  const [contact, setContact] = useState('');

  const knownTracts = useMemo(() => collectKnownFsaTracts(fields), [fields]);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    // Prefill only on each fresh open so mid-dialog token refreshes or store
    // reloads never wipe the farmer's edits.
    if (open && !wasOpenRef.current) {
      setOperatorName(readUserMetadataName(session?.user?.user_metadata));
      setBusinessName(farmName ?? '');
      setCountyState('');
      setContact(typeof session?.user?.email === 'string' ? session.user.email : '');
    }
    wasOpenRef.current = open;
  }, [open, farmName, session]);

  const handleDownload = () => {
    try {
      createFsaOfficeRequestSheet({
        operatorName: operatorName.trim(),
        farmName: businessName.trim(),
        countyState: countyState.trim(),
        contact: contact.trim(),
        knownTracts,
        save: true,
      });
      toast.success('FSA request sheet downloaded.');
      onOpenChange(false);
    } catch (error) {
      console.error('[FsaRequestSheetDialog] Failed to create FSA request sheet:', error);
      toast.error('Could not create the FSA request sheet. Please try again.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>FSA request sheet</DialogTitle>
          <DialogDescription>
            Review the information printed on the sheet. Everything can be corrected before downloading.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="fsa-sheet-operator-name">Operator name</Label>
            <Input
              id="fsa-sheet-operator-name"
              name="operatorName"
              autoComplete="name"
              value={operatorName}
              onChange={e => setOperatorName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fsa-sheet-farm-name">Farm or business name</Label>
            <Input
              id="fsa-sheet-farm-name"
              name="farmName"
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fsa-sheet-county-state">County and state</Label>
            <Input
              id="fsa-sheet-county-state"
              name="countyState"
              placeholder="e.g. Benton County, MO"
              value={countyState}
              onChange={e => setCountyState(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fsa-sheet-contact">Phone or email</Label>
            <Input
              id="fsa-sheet-contact"
              name="contact"
              inputMode="email"
              value={contact}
              onChange={e => setContact(e.target.value)}
            />
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            {knownTracts.length > 0
              ? `The sheet will list the ${knownTracts.length} farm and tract number${knownTracts.length > 1 ? 's' : ''} already recorded on your fields, so the office can find your records faster.`
              : 'No farm or tract numbers are recorded on your fields yet, so the sheet leaves room to add them.'}
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleDownload} className="gap-2 font-semibold">
            <FileDown size={16} />
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
