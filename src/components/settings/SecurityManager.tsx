import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarm } from '@/store/farmStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function SecurityManager() {
  const { clearLocalCache } = useFarm();
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <>
      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-foreground text-lg flex items-center gap-2">
            <ShieldAlert size={18} className="text-destructive" />
            Security & Privacy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground font-mono leading-relaxed">
            Remove all sensitive farm data from this device's local storage. This will require a fresh cloud sync.
          </p>
          <Button
            variant="outline"
            className="w-full border-destructive/20 text-destructive hover:bg-destructive/10"
            onClick={() => setShowConfirm(true)}
          >
            <Trash2 size={16} className="mr-2" />
            Clear Local Cache
          </Button>

          <div className="pt-4 border-t border-border/10">
            <Button
              variant="link"
              className="text-[10px] font-mono text-muted-foreground uppercase p-0 h-auto hover:text-primary tracking-widest"
              onClick={() => navigate('/privacy')}
            >
              Review Full Privacy Policy & Compliance
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="bg-card border-destructive/30 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Clear Local Cache?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground font-mono text-xs">
              This will remove all farm records from this device. All data on Supabase remains safe. You will need to re-sync.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="touch-target border-border text-muted-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { clearLocalCache(); setShowConfirm(false); }}
              className="touch-target bg-destructive text-destructive-foreground glow-destructive"
            >
              Clear Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
