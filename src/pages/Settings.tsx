import { Settings as SettingsIcon, Sprout, Database, User } from 'lucide-react';
import FsaTractManager from '@/components/settings/FsaTractManager';
import SeedManager from '@/components/settings/SeedManager';
import RecipeManager from '@/components/settings/RecipeManager';
import FertilizerRecipeManager from '@/components/settings/FertilizerRecipeManager';
import DisplayManager from '@/components/settings/DisplayManager';
import SyncStatus from '@/components/settings/SyncStatus';
import BackupManager from '@/components/settings/BackupManager';
import SecurityManager from '@/components/settings/SecurityManager';
import AccountManager from '@/components/settings/AccountManager';
import DevTools from '@/components/settings/DevTools';
import VersionFooter from '@/components/VersionFooter';
import SyncStatusIndicator from '@/components/SyncStatusIndicator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export default function Settings() {
  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-8">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between lg:max-w-4xl lg:px-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <SettingsIcon size={20} className="text-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">Settings</h1>
              <p className="text-xs text-muted-foreground">App configuration</p>
            </div>
          </div>
          <SyncStatusIndicator />
        </div>
      </header>
      <div className="max-w-lg mx-auto p-4 space-y-6 lg:max-w-4xl lg:px-8">
        <Accordion type="multiple" defaultValue={['farm-data']} className="space-y-4">
          <AccordionItem value="farm-data" className="border border-border rounded-2xl bg-card px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-2 text-foreground">
                <Sprout size={18} className="text-plant" />
                <span className="font-bold">Farm Data</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-4">
                <SeedManager />
                <RecipeManager />
                <FertilizerRecipeManager />
                <FsaTractManager />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="data-management" className="border border-border rounded-2xl bg-card px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-2 text-foreground">
                <Database size={18} className="text-spray" />
                <span className="font-bold">Data Management</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-4">
                <SyncStatus />
                <BackupManager />
                {import.meta.env.DEV && <DevTools />}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="account-display" className="border border-border rounded-2xl bg-card px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-2 text-foreground">
                <User size={18} className="text-primary" />
                <span className="font-bold">Account &amp; Display</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-4">
                <AccountManager />
                <SecurityManager />
                <DisplayManager />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <VersionFooter />
      </div>
    </div>
  );
}
