import { useState } from 'react';
import { Map } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useFarm } from '@/store/farmStore';
import TractAssignmentFlow from '@/components/TractAssignmentFlow';

export default function FsaTractManager() {
  const { fsaTracts, cluAssignments } = useFarm();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-foreground text-lg">
            <Map size={18} />
            FSA Tract Boundaries
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {fsaTracts.length} tract{fsaTracts.length !== 1 ? 's' : ''} imported
            </span>
            <span className="text-muted-foreground">
              {cluAssignments.length} CLU{cluAssignments.length !== 1 ? 's' : ''} assigned
            </span>
          </div>
          <Button onClick={() => setOpen(true)} variant="outline" className="w-full">
            <Map size={16} className="mr-2" />
            Manage Tract Assignments
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl h-[80vh] p-0 flex flex-col gap-0">
          <DialogHeader className="p-4 pb-0 shrink-0">
            <DialogTitle>FSA Tract Management</DialogTitle>
            <DialogDescription>
              Import FSA tract JSON files and assign CLU polygons to your fields.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <TractAssignmentFlow onDone={() => setOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
