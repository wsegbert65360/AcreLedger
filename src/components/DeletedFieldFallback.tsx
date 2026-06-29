import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DeletedFieldFallbackProps {
  onClose: () => void;
}

const DeletedFieldFallback = ({ onClose }: DeletedFieldFallbackProps) => {
  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm w-full p-6">
        <DialogHeader>
          <DialogTitle>Field Deleted</DialogTitle>
          <DialogDescription>
            The original field for this record has been deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Button onClick={onClose} className="w-full touch-target mt-2">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeletedFieldFallback;
