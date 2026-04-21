import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { navTabs } from './navConfig';

export default function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border print:hidden pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="flex items-center justify-around max-w-lg mx-auto relative px-2">
        {navTabs.map(({ path, icon: Icon, label }) => {
          const active = pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`relative touch-target flex flex-col items-center justify-center gap-1 py-3 px-3 transition-colors ${active ? 'text-primary' : 'text-muted-foreground'
                }`}
              aria-label={label}
            >
              {active && (
                <motion.div
                  layoutId="bottom-nav-pill"
                  className="absolute inset-x-1 inset-y-2 bg-primary/10 border border-primary/20 rounded-xl -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <Icon size={22} strokeWidth={active ? 2.5 : 1.5} />
              <span className="text-[10px] font-mono font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
