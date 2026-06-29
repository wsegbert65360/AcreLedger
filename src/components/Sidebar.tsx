import { useLocation, useNavigate } from 'react-router-dom';
import { useFarm } from '@/store/farmStore';
import { navTabs } from './navConfig';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, Sprout, Plus } from 'lucide-react';
import { useQuickAdd } from '@/context/QuickAddContext';
import { native } from '@/lib/native';
import pkg from '../../package.json';

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { activeSeason, viewingSeason, setViewingSeason, seasonOptions } = useFarm();
  const { openQuickAdd } = useQuickAdd();

  return (
    <nav className="fixed left-0 top-0 bottom-0 w-60 z-30 bg-sidebar border-r border-sidebar-border flex-col hidden lg:flex print:hidden">
      <div className="px-5 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sprout size={18} className="text-sidebar-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-sidebar-primary tracking-wide">AcreLedger</h1>
            <p className="text-[11px] text-sidebar-foreground/50">Farm Management</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-3 py-4 space-y-4">
        <button
          onClick={() => {
            native.haptic.light();
            openQuickAdd();
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-bold shadow-md active:scale-95 transition-transform"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>Quick Add Record</span>
        </button>

        <div className="space-y-1">
          {navTabs.map(({ path, icon: Icon, label }) => {
            const active = pathname === path;
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                  active
                    ? 'bg-sidebar-accent text-sidebar-primary border-l-2 border-sidebar-primary'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-3 border-t border-sidebar-border space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={14} className="text-sidebar-foreground/50" />
          <span className="text-[11px] font-semibold text-sidebar-foreground/50">Season</span>
        </div>
        <Select value={viewingSeason.toString()} onValueChange={(v) => setViewingSeason(parseInt(v, 10))}>
          <SelectTrigger className="w-full h-11 bg-sidebar-accent/50 border-sidebar-border text-sidebar-primary text-xs font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {seasonOptions.map(y => (
              <SelectItem key={y} value={y.toString()} className="font-mono text-xs">
                {y}{y === activeSeason ? ' (Active)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] font-mono text-sidebar-foreground/40">v{pkg.version}</p>
      </div>
    </nav>
  );
}
