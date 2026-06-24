import { useLocation, useNavigate } from 'react-router-dom';

import { native } from '@/lib/native';

import { navTabs } from './navConfig';

export default function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-lg border-t border-border print:hidden pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="flex items-center justify-around max-w-lg mx-auto relative px-2">
        {navTabs.map(({ path, icon: Icon, label }) => {
          const active = pathname === path;
          return (
            <button
              key={path}
              id={path === '/activity' ? 'coachmark-activity-tab' : path === '/reports' ? 'coachmark-reports-tab' : undefined}
              onClick={() => {
                native.haptic.light();
                navigate(path);
              }}
              className={`relative touch-target flex flex-col items-center justify-center gap-0.5 py-3 px-3 transition-colors ${active ? 'text-primary' : 'text-muted-foreground'
                }`}
              aria-label={label}
            >
              <div className="relative">
                {active && (
                  <div
                    className="absolute -inset-x-3 -inset-y-1.5 bg-primary/10 border border-primary/20 rounded-xl -z-10 animate-in fade-in duration-200"
                  />
                )}
                <Icon size={22} strokeWidth={active ? 2.5 : 1.5} />
              </div>
              <span className={`text-[11px] ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
              {active && (
                <div className="w-1 h-1 rounded-full bg-primary animate-in fade-in zoom-in duration-200" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
