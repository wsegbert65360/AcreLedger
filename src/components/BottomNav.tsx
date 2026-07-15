import { useLocation, useNavigate } from 'react-router-dom';

import { native } from '@/lib/native';

import { navTabs } from './navConfig';

export default function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/70 bg-card/90 shadow-[0_-8px_30px_hsl(var(--foreground)/0.06)] backdrop-blur-xl print:hidden pb-[env(safe-area-inset-bottom)] lg:hidden">
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
              className={`relative touch-target flex flex-col items-center justify-center gap-1 py-2.5 px-3 transition-all active:scale-95 ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
            >
              <div className="relative">
                {active && (
                  <div
                    className="absolute -inset-x-3 -inset-y-2 bg-primary/10 border border-primary/15 rounded-xl -z-10 animate-in fade-in duration-200"
                  />
                )}
                {active && (
                  <div
                    aria-hidden="true"
                    className="absolute -top-2.5 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-primary"
                  />
                )}
                <Icon size={22} strokeWidth={active ? 2.5 : 1.5} />
              </div>
              <span className={`text-[11px] ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
