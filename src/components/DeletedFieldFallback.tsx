import React from 'react';
import { Button } from '@/components/ui/button';

interface DeletedFieldFallbackProps {
  onClose: () => void;
}

const DeletedFieldFallback: React.FC<DeletedFieldFallbackProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border p-6 rounded-xl max-w-sm w-full space-y-4 shadow-2xl">
        <p className="text-sm text-muted-foreground">The original field for this record has been deleted.</p>
        <Button onClick={onClose} className="w-full touch-target">Close</Button>
      </div>
    </div>
  );
};

export default DeletedFieldFallback;
