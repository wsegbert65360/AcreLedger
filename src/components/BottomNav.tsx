import { Link, useLocation } from 'react-router-dom';

import { useSideBarEdge, type SideBarEdge } from '@/hooks/useSideBarEdge';
import { native } from '@/lib/native';

import { navTabs } from './navConfig';

function coachmarkId(path: string): string | undefined {
  if (path === '/activity') return 'coachmark-activity-tab';
  if (path === '/reports') return 'coachmark-reports-tab';
  return undefined;
}

/**
 * iPhone Duo layout: the tab bar sits in the strip the system reserves for its controls,
 * below the status bar, icons only (Apple HIG, Designing for iPhone Duo, Vertical controls).
 */
function SideTabBar({ edge, pathname }: { edge: SideBarEdge; pathname: string }) {
  return (
    <nav
      aria-label="Primary"
      data-side-tab-bar={edge}
      className="fixed bottom-0 top-0 z-50 flex flex-col items-center justify-end print:hidden lg:hidden"
      style={{
        [edge]: 0,
        width: edge === 'right' ? 'var(--sa-r)' : 'var(--sa-l)',
        paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="flex flex-col items-center gap-1 rounded-full border border-border/70 bg-card/90 p-1.5 shadow-[0_8px_30px_hsl(var(--foreground)/0.08)] backdrop-blur-xl">
        {navTabs.map(({ path, icon: Icon, label }) => {
          const active = pathname === path;
          return (
            <Link
              key={path}
              to={path}
              id={coachmarkId(path)}
              onClick={() => {
                native.haptic.light();
              }}
              title={label}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-all active:scale-95 ${active
                ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                : 'text-muted-foreground hover:text-foreground'
                }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.5} aria-hidden="true" />
              <span className="sr-only">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function BottomNav() {
  const { pathname } = useLocation();
  const sideEdge = useSideBarEdge();

  if (sideEdge) return <SideTabBar edge={sideEdge} pathname={pathname} />;

  return (
    <nav aria-label="Primary" className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/70 bg-card/90 shadow-[0_-8px_30px_hsl(var(--foreground)/0.06)] backdrop-blur-xl print:hidden pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="relative mx-auto flex w-full min-w-0 max-w-lg items-center px-2">
        {navTabs.map(({ path, icon: Icon, label }) => {
          const active = pathname === path;
          return (
            <Link
              key={path}
              to={path}
              id={coachmarkId(path)}
              onClick={() => {
                native.haptic.light();
              }}
              className={`relative flex h-16 min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2.5 transition-all active:scale-95 ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
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
              <span className={`max-w-full truncate text-center text-xs ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
