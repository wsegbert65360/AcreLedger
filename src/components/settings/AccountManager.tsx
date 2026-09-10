import { useState, useEffect } from 'react';
import { useFarm } from '@/store/farmStore';
import { requestAccountDeletion } from '@/lib/accountDeletion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

export default function AccountManager() {
  const { session, farm_id, farmName, updateFarmName, signOut, pendingSyncCount } = useFarm();
  const [name, setName] = useState(farmName || '');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmDeletion, setConfirmDeletion] = useState(false);
  const [deletionConfirmation, setDeletionConfirmation] = useState('');
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false);

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

  const handleDeletionRequest = async () => {
    if (!session?.user.id || !farm_id || deletionConfirmation !== 'DELETE') return;
    if (pendingSyncCount > 0) {
      toast.error('Sync your offline changes before requesting account deletion.');
      return;
    }

    setIsRequestingDeletion(true);
    try {
      const result = await requestAccountDeletion(session.user.id, farm_id);
      toast.success(
        result === 'already_pending'
          ? 'Your account deletion request is already pending.'
          : 'Account deletion requested. It will be completed within 30 days.',
      );
      setConfirmDeletion(false);
      setDeletionConfirmation('');
      await signOut();
    } catch (error) {
      console.error('Failed to request account deletion:', error);
      toast.error('Could not request account deletion. Please try again.');
    } finally {
      setIsRequestingDeletion(false);
    }
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
            className="w-full h-11 bg-primary text-primary-foreground"
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

          <div className="border-t border-border/40 pt-4 space-y-2">
            <p className="text-xs text-muted-foreground">
              You can request permanent deletion of your account and associated personal data.
              Requests are completed within 30 days.
            </p>
            <Button
              variant="outline"
              className="w-full h-10 border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmDeletion(true)}
            >
              Delete Account
            </Button>
          </div>
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

      <AlertDialog open={confirmDeletion} onOpenChange={(open) => {
        setConfirmDeletion(open);
        if (!open) setDeletionConfirmation('');
      }}>
        <AlertDialogContent className="bg-card border-destructive/30 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Request permanent account deletion?</AlertDialogTitle>
            <AlertDialogDescription>
              This starts deletion of your AcreLedger account and associated personal data.
              The request will be completed within 30 days, and you will be signed out now.
              This cannot be undone after completion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingSyncCount > 0 ? (
            <p className="text-sm text-destructive">
              Reconnect and sync {pendingSyncCount} pending change{pendingSyncCount === 1 ? '' : 's'} first.
            </p>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="deleteAccountConfirmation" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Type DELETE to confirm
              </label>
              <Input
                id="deleteAccountConfirmation"
                value={deletionConfirmation}
                onChange={(event) => setDeletionConfirmation(event.target.value)}
                autoCapitalize="characters"
                autoComplete="off"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep account</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDeletionRequest();
              }}
              disabled={pendingSyncCount > 0 || deletionConfirmation !== 'DELETE' || isRequestingDeletion}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRequestingDeletion ? 'Requesting...' : 'Request deletion'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
