import { useFarm } from '@/store/farmStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cloud } from 'lucide-react';

export default function SyncStatus() {
  const { session, loading } = useFarm();

  if (!session) return null;

  return (
    <Card className="border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-foreground text-lg flex items-center gap-2">
          <Cloud size={18} className="text-primary" />
          Cloud Sync Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between p-3 bg-muted rounded-md border border-border">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
            <span className="text-sm font-mono text-foreground font-bold uppercase tracking-tight">
              {loading ? 'Fetching...' : 'Live Connected'}
            </span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground uppercase">
            Supabase Relational DB
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 font-mono leading-relaxed px-1">
          Each record you save is automatically backed up to your hardened multi-tenant partition on Supabase for total security and data durability.
        </p>
      </CardContent>
    </Card>
  );
}
