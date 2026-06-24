import { useMemo } from 'react';
import {
  MapPin, Wheat, Warehouse, AlertCircle,
} from 'lucide-react';

import { useFarm } from '@/store/farmStore';
import { Skeleton } from '@/components/ui/skeleton';
import { ACTIVITY_ICONS } from '@/lib/activityIcons';
import { roundTo } from '@/utils/numbers';

// ── Shared card shell ────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  iconColor,
  label,
  value,
  subtitle,
  badge,
  progress,
}: {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  value: string;
  subtitle: string;
  badge?: { text: string; color: string };
  progress?: { pct: number; color: string };
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg bg-muted ${iconColor}`}>
            <Icon size={16} />
          </div>
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        {badge && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>
            {badge.text}
          </span>
        )}
      </div>
      <div className="text-2xl font-black text-foreground leading-none">{value}</div>
      <div className="text-xs text-muted-foreground leading-snug">{subtitle}</div>
      {progress && (
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${progress.color}`}
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ── Skeleton loader (matches card shell exactly) ─────────────────────────────

export function DashboardStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <Skeleton className="h-5 w-5 rounded-lg" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function DashboardStats() {
  const {
    fields,
    plantRecords,
    harvestRecords,
    sprayRecords,
    hayHarvestRecords,
    bins,
    getBinTotal,
    viewingSeason,
  } = useFarm();

  const stats = useMemo(() => {
    const season = viewingSeason;

    // Planted acreage & field count
    const seasonPlants = plantRecords.filter(r => r.seasonYear === season);
    const plantedFieldIds = new Set(seasonPlants.map(r => r.fieldId));
    const plantedAcres = roundTo(seasonPlants.reduce((s, r) => s + r.acreage, 0), 2);

    // Harvest
    const seasonHarvests = harvestRecords.filter(r => r.seasonYear === season);
    const totalBushels = seasonHarvests.reduce((s, r) => s + r.bushels, 0);
    const harvestedFieldIds = new Set(seasonHarvests.map(r => r.fieldId));

    // Spray
    const seasonSprays = sprayRecords.filter(r => r.seasonYear === season);
    const latestSprayTs = seasonSprays.length > 0
      ? Math.max(...seasonSprays.map(r => r.timestamp))
      : null;
    const daysSinceSpray = latestSprayTs
      ? Math.floor((Date.now() - latestSprayTs) / 86_400_000)
      : null;

    // On-farm inventory
    let totalInventory = 0;
    let nearCapacityCount = 0;
    bins.forEach(bin => {
      const t = getBinTotal(bin.id, season);
      totalInventory += t;
      if (bin.capacity > 0 && t / bin.capacity > 0.8) nearCapacityCount++;
    });

    // Attention — fields with no planting record yet
    const unplantedCount = fields.filter(f => !plantedFieldIds.has(f.id)).length;

    // Hay bales
    const totalBales = hayHarvestRecords
      .filter(r => r.seasonYear === season)
      .reduce((s, r) => s + r.baleCount, 0);

    return {
      totalAcres: roundTo(fields.reduce((s, f) => s + f.acreage, 0), 2),
      fieldCount: fields.length,
      plantedAcres,
      plantedFieldCount: plantedFieldIds.size,
      plantedPct: fields.length > 0
        ? Math.round((plantedFieldIds.size / fields.length) * 100)
        : 0,
      totalBushels,
      harvestedFieldCount: harvestedFieldIds.size,
      sprayCount: seasonSprays.length,
      daysSinceSpray,
      totalInventory,
      binCount: bins.length,
      nearCapacityCount,
      unplantedCount,
      totalBales,
    };
  }, [fields, plantRecords, harvestRecords, sprayRecords, hayHarvestRecords, bins, getBinTotal, viewingSeason]);

  const attentionBadge = stats.unplantedCount > 0
    ? { text: `${stats.unplantedCount} unplanted`, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' }
    : { text: 'All planted', color: 'bg-plant/10 text-plant border border-plant/20' };

  const inventoryBadge = stats.nearCapacityCount > 0
    ? { text: `${stats.nearCapacityCount} near full`, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' }
    : undefined;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {/* 1 — Total Operation */}
      <StatCard
        icon={MapPin}
        iconColor="text-foreground"
        label="Total Acreage"
        value={`${stats.totalAcres.toLocaleString()} AC`}
        subtitle={`${stats.fieldCount} field${stats.fieldCount !== 1 ? 's' : ''}`}
      />

      {/* 2 — Planted */}
      <StatCard
        icon={ACTIVITY_ICONS.plant}
        iconColor="text-plant"
        label="Planted"
        value={`${stats.plantedAcres.toLocaleString()} AC`}
        subtitle={`${stats.plantedFieldCount} of ${stats.fieldCount} fields`}
        badge={attentionBadge}
        progress={{
          pct: stats.plantedPct,
          color: stats.plantedPct === 100
            ? 'bg-plant'
            : stats.plantedPct > 50
              ? 'bg-plant/70'
              : 'bg-plant/40',
        }}
      />

      {/* 3 — Harvest */}
      <StatCard
        icon={Wheat}
        iconColor="text-harvest"
        label="Harvest"
        value={`${stats.totalBushels.toLocaleString()} BU`}
        subtitle={`${stats.harvestedFieldCount} field${stats.harvestedFieldCount !== 1 ? 's' : ''} harvested`}
      />

      {/* 4 — Spray */}
      <StatCard
        icon={ACTIVITY_ICONS.spray}
        iconColor="text-spray"
        label="Spray Apps"
        value={stats.sprayCount.toLocaleString()}
        subtitle={stats.daysSinceSpray !== null
          ? `Last application ${stats.daysSinceSpray === 0 ? 'today' : `${stats.daysSinceSpray}d ago`}`
          : 'No applications yet'}
      />

      {/* 5 — On-Farm Inventory */}
      <StatCard
        icon={Warehouse}
        iconColor="text-harvest"
        label="On-Farm Inventory"
        value={stats.binCount > 0 ? `${stats.totalInventory.toLocaleString()} BU` : '—'}
        subtitle={stats.binCount > 0
          ? `${stats.binCount} bin${stats.binCount !== 1 ? 's' : ''}`
          : 'No bins configured'}
        badge={inventoryBadge}
      />

      {/* 6 — Needs Attention */}
      <StatCard
        icon={AlertCircle}
        iconColor={stats.unplantedCount > 0 ? 'text-amber-500' : 'text-plant'}
        label="Attention"
        value={stats.unplantedCount > 0 ? String(stats.unplantedCount) : '✓'}
        subtitle={stats.unplantedCount > 0
          ? `Field${stats.unplantedCount !== 1 ? 's' : ''} not planted`
          : 'No action needed'}
      />
    </div>
  );
}
