import { useEffect, useState } from 'react';
import { useFarm } from '@/store/farmStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cloud, CloudOff, WifiOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type SyncState = 'connecting' | 'connected' | 'disconnected' | 'offline';

interface StatusConfig {
  dot: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  pulse: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LAST_SYNC_KEY = 'acreledger_last_sync';

function loadLastSync(): Date | null {
  try {
    const raw = localStorage.getItem(LAST_SYNC_KEY);
    return raw ? new Date(raw) : null;
  } catch { return null; }
}

function saveLastSync(): void {
  try {
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  } catch { /* ignore */ }
}

function formatLastSync(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

const STATUS_CONFIG: Record<SyncState, StatusConfig> = {
  connecting: {
    dot: 'bg-amber-400',
    label: 'Connecting...',
    icon: <Cloud size={18} className="text-amber-400" />,
    description: 'Establishing connection to cloud database.',
    pulse: true,
  },
  connected: {
    dot: 'bg-emerald-500',
    label: 'Synced',
    icon: <Cloud size={18} className="text-emerald-500" />,
    description: 'Your records are being saved and synced in real time.',
    pulse: false,
  },
  disconnected: {
    dot: 'bg-destructive',
    label: 'Sync Unavailable',
    icon: <CloudOff size={18} className="text-destructive" />,
    description: 'Cloud sync is currently unavailable. Your changes may not be saved.',
    pulse: false,
  },
  offline: {
    dot: 'bg-muted-foreground',
    label: 'Offline',
    icon: <WifiOff size={18} className="text-muted-foreground" />,
    description: 'No internet connection detected. Reconnect to resume syncing.',
    pulse: false,
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SyncStatus() {
  const { session } = useFarm();
  const [syncState, setSyncState] = useState<SyncState>(
    navigator.onLine ? 'connecting' : 'offline'
  );
  const [lastSync, setLastSync] = useState<Date | null>(loadLastSync);
  const [, forceRender] = useState(0);

  // Re-render every minute so "Xm ago" stays current
  useEffect(() => {
    const id = setInterval(() => forceRender(n => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Browser online/offline events
  useEffect(() => {
    const goOnline = () => setSyncState('connecting');
    const goOffline = () => setSyncState('offline');
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Supabase realtime channel for true connection health
  useEffect(() => {
    if (!session) return;

    const channel = supabase.channel('sync-status-probe');

    channel
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setSyncState('connected');
          const now = new Date();
          saveLastSync();
          setLastSync(now);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setSyncState(navigator.onLine ? 'disconnected' : 'offline');
        } else if (status === 'CLOSED') {
          setSyncState('disconnected');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]);

  // Don't render until we know if there's a session
  if (session === undefined) {
    return (
      <Card className="border-border/30">
        <CardContent className="p-6">
          <div className="h-14 rounded-md bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (!session) return null;

  const config = STATUS_CONFIG[syncState];

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-foreground text-lg flex items-center gap-2">
          {config.icon}
          Cloud Sync
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Status row */}
        <div className="flex items-center justify-between p-3 bg-muted rounded-md border border-border">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${config.dot} ${config.pulse ? 'animate-pulse' : ''}`} />
            <span className="text-sm font-mono text-foreground font-bold uppercase tracking-tight">
              {config.label}
            </span>
          </div>
          {/* Last synced timestamp */}
          {lastSync && (
            <span className="text-[10px] font-mono text-muted-foreground">
              Last sync: {formatLastSync(lastSync)}
            </span>
          )}
        </div>

        {/* Contextual description */}
        <p className={`text-[10px] font-mono leading-relaxed px-1 ${
          syncState === 'disconnected' || syncState === 'offline'
            ? 'text-destructive/80'
            : 'text-muted-foreground'
        }`}>
          {config.description}
        </p>
      </CardContent>
    </Card>
  );
}