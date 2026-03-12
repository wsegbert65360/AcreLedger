import BottomNav from '@/components/BottomNav';
import SeedManager from '@/components/settings/SeedManager';
import RecipeManager from '@/components/settings/RecipeManager';
import DisplayManager from '@/components/settings/DisplayManager';
import SyncStatus from '@/components/settings/SyncStatus';
import BackupManager from '@/components/settings/BackupManager';
import SecurityManager from '@/components/settings/SecurityManager';
import AccountManager from '@/components/settings/AccountManager';
import DevTools from '@/components/settings/DevTools';

export default function Settings() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-lg mx-auto p-4 space-y-6">
        <h1 className="text-2xl font-bold text-foreground font-mono">Settings</h1>

        <SeedManager />
        <RecipeManager />
        <DisplayManager />
        <SyncStatus />
        <BackupManager />
        <SecurityManager />
        <AccountManager />
        {import.meta.env.DEV && <DevTools />}
      </div>
      <BottomNav />
    </div>
  );
}
