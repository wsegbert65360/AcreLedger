import { useLocation, useNavigate } from 'react-router-dom';
import { navTabs } from './navConfig';

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed left-0 top-0 bottom-0 w-60 z-30 bg-sidebar border-r border-sidebar-border flex-col hidden lg:flex print:hidden">
      <div className="px-5 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <img src="/icon-48.png" alt="AcreLedger" className="w-8 h-8 rounded-lg" />
          <div>
            <h1 className="text-sm font-mono font-bold text-sidebar-primary uppercase tracking-wide">AcreLedger</h1>
            <p className="text-[10px] font-mono text-sidebar-foreground/50">Farm Management</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-3 py-4 space-y-1">
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

      <div className="px-5 py-3 border-t border-sidebar-border">
        <p className="text-[10px] font-mono text-sidebar-foreground/40">v3.4.1</p>
      </div>
    </nav>
  );
}
