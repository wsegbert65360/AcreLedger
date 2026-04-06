import { useLocation, useNavigate } from 'react-router-dom';
import { Map, Wheat, ClipboardList, FileText, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

const tabs = [
  { path: '/', icon: Map, label: 'Fields' },
  { path: '/logistics', icon: Wheat, label: 'Storage' },
  { path: '/activity', icon: ClipboardList, label: 'Activity' },
  { path: '/reports', icon: FileText, label: 'Reports' },
  { path: '/settings', icon: Settings, label: 'Setup' },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-2xl border-t border-border/40 shadow-[0_-8px_30px_-15px_rgba(0,0,0,0.1)] print:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around max-w-lg mx-auto relative px-1">
        {tabs.map(({ path, icon: Icon, label }) => {
          const active = pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-2 px-3 min-w-[56px] rounded-xl transition-all duration-200 active:scale-90 ${
                active
                  ? 'text-primary'
                  : 'text-muted-foreground/70 hover:text-muted-foreground'
              }`}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
            >
              {/* Animated pill background */}
              {active && (
                <motion.div
                  layoutId="bottom-nav-pill"
                  className="absolute inset-1 bg-primary/10 rounded-[14px]"
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
                />
              )}
              {/* Icon with bounce on active */}
              <motion.div
                animate={{
                  scale: active ? 1.15 : 1,
                  y: active ? -1 : 0,
                }}
                transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }}
              >
                <Icon size={21} strokeWidth={active ? 2.5 : 1.5} />
              </motion.div>
              {/* Label */}
              <span className={`text-[10px] font-mono transition-all duration-200 ${
                active ? 'font-bold text-primary' : 'font-medium'
              }`}>
                {label}
              </span>
              {/* Active dot indicator below label */}
              {active && (
                <motion.div
                  layoutId="bottom-nav-dot"
                  className="absolute -bottom-1 w-1 h-1 rounded-full bg-primary/80"
                  transition={{ type: 'spring', bounce: 0.3, duration: 0.5 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
