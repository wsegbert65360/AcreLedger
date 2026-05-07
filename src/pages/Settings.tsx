import BottomNav from '@/components/BottomNav';
import { Settings as SettingsIcon } from 'lucide-react';
import SeedManager from '@/components/settings/SeedManager';
import RecipeManager from '@/components/settings/RecipeManager';
import DisplayManager from '@/components/settings/DisplayManager';
import SyncStatus from '@/components/settings/SyncStatus';
import BackupManager from '@/components/settings/BackupManager';
import SecurityManager from '@/components/settings/SecurityManager';
import AccountManager from '@/components/settings/AccountManager';
import DevTools from '@/components/settings/DevTools';
import VersionFooter from '@/components/VersionFooter';

export default function Settings() {
  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-8">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3 lg:max-w-4xl lg:px-8">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
            <SettingsIcon size={20} className="text-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">Settings</h1>
            <p className="text-xs text-muted-foreground">App configuration</p>
          </div>
        </div>
      </header>
      <div className="max-w-lg mx-auto p-4 space-y-6 lg:max-w-4xl lg:px-8">

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SeedManager />
          <RecipeManager />
          <DisplayManager />
          <SyncStatus />
          <BackupManager />
          <SecurityManager />
          <AccountManager />
          {import.meta.env.DEV && <DevTools />}
        </div>

        <VersionFooter />
      </div>
      <BottomNav />
    </div>
  );
}
