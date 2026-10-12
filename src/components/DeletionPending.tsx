import { useState } from 'react';

import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import type { SignOutResult } from '@/lib/authSignOut';

export default function DeletionPending({ status, signOut }: {
  status: 'checking' | 'pending' | 'error';
  signOut: () => Promise<SignOutResult>;
}) {
  const [busy, setBusy] = useState(false);
  const handleSignOut = async () => {
    setBusy(true);
    try {
      const result = await signOut();
      if (result.serverPending && result.signedOut) toast.warning('Signed out on this device; server sign-out pending');
    } catch {
      toast.error('Could not sign out on this device. Please try again.');
    } finally { setBusy(false); }
  };
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <section className="w-full max-w-md space-y-4" aria-live="polite">
        <h1 className="text-xl font-semibold">
          {status === 'pending' ? 'Account deletion pending' : status === 'checking' ? 'Checking account status…' : 'Could not check account status'}
        </h1>
        <p className="text-muted-foreground">
          {status === 'pending'
            ? 'Your deletion request is pending. To cancel it or get help, contact support@acreledger.app.'
            : status === 'error' ? 'Reconnect and sign in again to check your account before continuing.' : 'Please wait before accessing your farm.'}
        </p>
        <a className="text-primary underline" href="mailto:support@acreledger.app">Contact support@acreledger.app</a>
        <Button className="w-full h-11" disabled={busy} onClick={() => void handleSignOut()}>Sign Out</Button>
      </section>
    </main>
  );
}
