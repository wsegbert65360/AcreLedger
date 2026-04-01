import BottomNav from '@/components/BottomNav';
import SeedManager from '@/components/settings/SeedManager';
import RecipeManager from '@/components/settings/RecipeManager';
import SprayDefaults from '@/components/settings/SprayDefaults';
import DisplayManager from '@/components/settings/DisplayManager';
import SyncStatus from '@/components/settings/SyncStatus';
import BackupManager from '@/components/settings/BackupManager';
import SecurityManager from '@/components/settings/SecurityManager';
import AccountManager from '@/components/settings/AccountManager';
import DevTools from '@/components/settings/DevTools';
import VersionFooter from '@/components/VersionFooter';
import { Wrench, Database, Shield, User, Palette } from 'lucide-react';

function SectionHeader({ icon: Icon, title, color }: { icon: React.ElementType; title: string; color: string }) {
  return (
    <div className="flex items-center gap-2 pt-2 pb-1">
      <div className={`w-5 h-5 rounded flex items-center justify-center ${color}`}>
        <Icon size={12} />
      </div>
      <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
    </div>
  );
}

export default function Settings() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-lg mx-auto p-4 space-y-5">
        <h1 className="text-2xl font-bold text-foreground font-mono">Settings</h1>

        {/* Farm Operations */}
        <section>
          <SectionHeader icon={Wrench} title="Farm Operations" color="bg-primary/15 text-primary" />
          <div className="bg-card border border-border rounded-xl divide-y divide-border/50 overflow-hidden">
            <SprayDefaults />
            <SeedManager />
            <RecipeManager />
          </div>
        </section>

        {/* Data & Sync */}
        <section>
          <SectionHeader icon={Database} title="Data & Sync" color="bg-blue-500/15 text-blue-500" />
          <div className="bg-card border border-border rounded-xl divide-y divide-border/50 overflow-hidden">
            <SyncStatus />
            <BackupManager />
          </div>
        </section>

        {/* Appearance */}
        <section>
          <SectionHeader icon={Palette} title="Appearance" color="bg-purple-500/15 text-purple-500" />
          <div className="bg-card border border-border rounded-xl divide-y divide-border/50 overflow-hidden">
            <DisplayManager />
          </div>
        </section>

        {/* Account & Security */}
        <section>
          <SectionHeader icon={Shield} title="Account & Security" color="bg-orange-500/15 text-orange-500" />
          <div className="bg-card border border-border rounded-xl divide-y divide-border/50 overflow-hidden">
            <AccountManager />
            <SecurityManager />
          </div>
        </section>

        {import.meta.env.DEV && (
          <section>
            <SectionHeader icon={User} title="Developer" color="bg-muted text-muted-foreground" />
            <div className="bg-card border border-border rounded-xl divide-y divide-border/50 overflow-hidden">
              <DevTools />
            </div>
          </section>
        )}

        <VersionFooter />
      </div>
      <BottomNav />
    </div>
  );
}
