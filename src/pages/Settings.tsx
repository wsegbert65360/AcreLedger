import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Settings as SettingsIcon, Sprout, Database, User, CreditCard, Tractor, ChevronRight } from 'lucide-react';
import FsaTractManager from '@/components/settings/FsaTractManager';
import SeedManager from '@/components/settings/SeedManager';
import RecipeManager from '@/components/settings/RecipeManager';
import FertilizerRecipeManager from '@/components/settings/FertilizerRecipeManager';
import DisplayManager from '@/components/settings/DisplayManager';
import RegionManager from '@/components/settings/RegionManager';
import BillingManager from '@/components/settings/BillingManager';
import { isAuPilotEnabled } from '@/lib/auPilot';
import { isBillingUiAvailable } from '@/lib/billing';
import { isEquipmentUiEnabled } from '@/lib/equipment/feature';
import { useFarm } from '@/store/farmStore';
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

const SETTINGS_SECTIONS = ['farm-data', 'data-management', 'billing', 'account-display'] as const;

function settingsSectionFromQuery(section: string | null, billingAvailable: boolean): string | null {
  if (!section || !(SETTINGS_SECTIONS as readonly string[]).includes(section)) return null;
  if (section === 'billing' && !billingAvailable) return null;
  return section;
}

export default function Settings() {
  const { session } = useFarm();
  const auPilotVisible = isAuPilotEnabled(session?.user?.email);
  const [searchParams] = useSearchParams();
  const billingAvailable = isBillingUiAvailable();
  const requestedSection = settingsSectionFromQuery(searchParams.get('section'), billingAvailable);
  const openSections = requestedSection && requestedSection !== 'farm-data'
    ? ['farm-data', requestedSection]
    : ['farm-data'];

  useEffect(() => {
    if (!requestedSection) return;
    document.getElementById(`settings-section-${requestedSection}`)?.scrollIntoView?.({ block: 'start' });
  }, [requestedSection]);

  return (
    <div className="min-h-screen bg-background pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between lg:max-w-4xl lg:px-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <SettingsIcon size={20} className="text-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">Setup</h1>
              <p className="text-xs text-muted-foreground">App configuration</p>
            </div>
          </div>
          <SyncStatusIndicator />
        </div>
      </header>
      <div className="max-w-lg mx-auto p-4 space-y-6 lg:max-w-4xl lg:px-8">
        {isEquipmentUiEnabled() && (
          <Link to="/equipment" className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm transition hover:border-primary/30">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Tractor size={20} /></span>
            <span className="min-w-0 flex-1"><span className="block font-bold">Equipment</span><span className="block text-xs text-muted-foreground">Machines, meters, maintenance, and repairs</span></span>
            <ChevronRight size={18} className="text-muted-foreground" />
          </Link>
        )}
        <Accordion key={requestedSection ?? 'default'} type="multiple" defaultValue={openSections} className="space-y-4">
          <AccordionItem id="settings-section-farm-data" value="farm-data" className="scroll-mt-24 border border-border rounded-2xl bg-card px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-2 text-foreground">
                <Sprout size={18} className="text-plant" />
                <span className="font-bold">Farm Data</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-4">
                <div className="space-y-6">
                  <SeedManager />
                  <FertilizerRecipeManager />
                </div>
                <div className="space-y-6">
                  <RecipeManager />
                  <FsaTractManager />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem id="settings-section-data-management" value="data-management" className="scroll-mt-24 border border-border rounded-2xl bg-card px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-2 text-foreground">
                <Database size={18} className="text-spray" />
                <span className="font-bold">Data Management</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 gap-6 pb-4">
                <SyncStatus />
                <BackupManager />
                {import.meta.env.DEV && <DevTools />}
              </div>
            </AccordionContent>
          </AccordionItem>

          {billingAvailable && (
            <AccordionItem id="settings-section-billing" value="billing" className="scroll-mt-24 border border-border rounded-2xl bg-card px-4">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-2 text-foreground">
                  <CreditCard size={18} className="text-harvest" />
                  <span className="font-bold">Billing</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 gap-6 pb-4">
                  <BillingManager />
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          <AccordionItem id="settings-section-account-display" value="account-display" className="scroll-mt-24 border border-border rounded-2xl bg-card px-4">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-2 text-foreground">
                <User size={18} className="text-primary" />
                <span className="font-bold">Account &amp; Display</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-4">
                <div className="space-y-6">
                  <AccountManager />
                  <DisplayManager />
                  {auPilotVisible && <RegionManager />}
                </div>
                <div className="space-y-6">
                  <SecurityManager />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <VersionFooter />
      </div>
    </div>
  );
}
