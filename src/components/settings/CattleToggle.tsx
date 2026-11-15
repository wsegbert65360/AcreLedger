import { useState } from 'react';
import { Beef } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useFarm } from '@/store/farmStore';

/** Farm-level "I run cattle" switch. Saved through the offline queue. */
export default function CattleToggle() {
  const { runsCattle, updateRunsCattle, farm_id } = useFarm();
  const [saving, setSaving] = useState(false);

  const change = async (value: boolean) => {
    if (saving) return;
    setSaving(true);
    try { await updateRunsCattle(value); } finally { setSaving(false); }
  };

  return (
    <label
      htmlFor="runs-cattle-switch"
      className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Beef size={21} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">I run cattle</span>
        <span className="block text-xs text-muted-foreground">Track herds, pasture moves, and herd events</span>
      </span>
      {/* The label is the tap target, so the whole row is well over 44 pt tall. */}
      <Switch
        id="runs-cattle-switch"
        checked={runsCattle}
        disabled={!farm_id || saving}
        onCheckedChange={change}
        aria-label="I run cattle"
      />
    </label>
  );
}
