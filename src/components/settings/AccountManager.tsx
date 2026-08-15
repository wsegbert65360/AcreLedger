import { useState, useEffect } from 'react';
import { useFarm } from '@/store/farmStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function AccountManager() {
  const { session, farmName, updateFarmName, signOut, pendingSyncCount } = useFarm();
  const [name, setName] = useState(farmName || '');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    if (farmName) {
      setName(farmName);
    }
  }, [farmName]);

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim() === farmName) return;

    setIsSaving(true);
    await updateFarmName(name.trim());
    setIsSaving(false);
  };

  const hasChanges = name.trim() !== '' && name.trim() !== farmName;

  const handleSignOutClick = () => {
    // Signing out clears the local sync queue; queued offline changes that
    // have not synced yet would be permanently lost, so require confirmation.
    if (pendingSyncCount > 0) {
      setConfirmSignOut(true);
      return;
    }
    signOut();
  };

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-foreground text-lg flex items-center gap-2">
          Account & Farm Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Farm Name Settings */}
        <form onSubmit={handleRename} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="settingsFarmName" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Farm Name
            </label>
            <Input
              id="settingsFarmName"
              name="farmName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Oak Creek Farms"
              maxLength={100}
              className="bg-background h-10"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            className="w-full h-10"
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? 'Saving...' : 'Rename Farm'}
          </Button>
        </form>

        <div className="border-t border-border/40 my-4" />

        {/* User Account Info */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="accountEmailDisplay" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              User Account
            </label>
            <div id="accountEmailDisplay" className="text-sm font-mono text-muted-foreground p-3 bg-muted rounded-lg break-all">
              {session?.user.email}
            </div>
          </div>
          <Button
            variant="destructive"
            className="w-full h-10"
            onClick={handleSignOutClick}
          >
            Sign Out
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmSignOut} onOpenChange={(open) => { if (!open) setConfirmSignOut(false); }}>
        <AlertDialogContent className="bg-card border-destructive/30 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsynced changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have {pendingSyncCount} offline change{pendingSyncCount !== 1 ? 's' : ''} still waiting to sync.
              Signing out now permanently deletes {pendingSyncCount !== 1 ? 'them' : 'it'} from this device.
              Reconnect and let the app sync first to keep {pendingSyncCount !== 1 ? 'them' : 'it'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay signed in</AlertDialogCancel>
            <AlertDialogAction onClick={() => signOut()}>
              Sign out and discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
