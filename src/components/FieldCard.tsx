import { useNavigate } from 'react-router-dom';
import { Field } from '@/types/farm';
import { useFarm } from '@/store/farmStore';
import { MapPin, ChevronRight, Sprout, Cloud, FlaskConical as Flask, Wheat, Droplets, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { RainService } from '@/services/RainService';
import { useEffect, useRef, useState } from 'react';

// ── Types ───────────────────────────────────────────────────────────────

interface RainfallResult {
  '24h': number;
  '72h': number;
  '7d': number;
  sincePlanting: number;
  sinceLastSpray: number;
  periodEndUtc: string;
  dataWarning?: string;
}

interface FieldCardProps {
  field: Field;
  index?: number;
}

type RainState = 'loading' | 'done' | 'unavailable';

// ── Helpers ─────────────────────────────────────────────────────────────

const statusConfig = (planted: boolean, harvested: boolean) => {
  if (harvested) return {
    label: 'Harvested',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    iconBg: 'bg-amber-500/20',
    iconColor: 'text-amber-500',
    dotColor: '#f59e0b',
  };
  if (planted) return {
    label: 'Planted',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    iconBg: 'bg-emerald-500/20',
    iconColor: 'text-emerald-500',
    dotColor: '#34d399',
  };
  return {
    label: 'Open',
    bg: '',
    border: '',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    dotColor: '#a1a1aa',
  };
};

const fmtRain = (val: number | undefined | null) =>
  val != null ? val.toFixed(2) : '0.00';

/**
 * useFieldRain — self-contained hook.
 *
 * Reads the farm store via refs so it never participates in React's
 * dependency tracking / re-render cycle.  Fires exactly once after a
 * short delay (to let the store hydrate from Supabase), then sets
 * its own local state.
 *
 * This is the same pattern FieldDetailScreen uses (stable fieldId dep
 * + fetchingRef guard), just adapted to live inside the card.
 */
function useFieldRain(fieldId: string) {
  const { fields, plantRecords, sprayRecords, viewingSeason } = useFarm();

  // Keep refs to the latest store values so the async fetch always
  // reads fresh data without triggering re-fetches.
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const plantRef = useRef(plantRecords);
  plantRef.current = plantRecords;
  const sprayRef = useRef(sprayRecords);
  sprayRef.current = sprayRecords;
  const seasonRef = useRef(viewingSeason);
  seasonRef.current = viewingSeason;

  const [rain, setRain] = useState<RainfallResult | null>(null);
  const [state, setState] = useState<RainState>('loading');
  const fetchingRef = useRef(false);

  useEffect(() => {
    if (!fieldId) return;
    fetchingRef.current = false;

    // Delay 2 s to let the store finish hydrating from Supabase.
    // Without this, fields may not have lat/lng yet and the fetch
    // would fail with "Missing location data".
    const timer = setTimeout(() => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      (async () => {
        try {
          const field = fieldsRef.current.find(f => f.id === fieldId);
          if (!field) { setState('unavailable'); return; }

          const season = seasonRef.current;
          const seasonFilter = (r: { fieldId: string; seasonYear: number }) =>
            r.fieldId === field.id && r.seasonYear === season;

          const latestPlant = plantRef.current
            .filter(seasonFilter)
            .sort((a, b) => new Date(b.plantDate || 0).getTime() - new Date(a.plantDate || 0).getTime())[0];
          const latestSpray = sprayRef.current
            .filter(seasonFilter)
            .sort((a, b) => new Date(b.sprayDate || 0).getTime() - new Date(a.sprayDate || 0).getTime())[0];

          const data = await RainService.fetchComprehensiveRainfall({
            fieldId: field.id,
            lat: field.lat,
            lng: field.lng,
            boundary: field.boundary ?? undefined,
            sincePlantingDate: latestPlant?.plantDate,
            sinceLastSprayDate: latestSpray?.sprayDate,
          });

          setRain(data);
          setState('done');
        } catch (err: any) {
          console.warn(`[FieldCard] Rain fetch failed for ${fieldId}:`, err?.message);
          setState('unavailable');
        }
      })();
    }, 2000);

    return () => { clearTimeout(timer); fetchingRef.current = false; };
  }, [fieldId]);

  return { rain, state };
}

// ── Component ───────────────────────────────────────────────────────────

export default function FieldCard({ field, index = 0 }: FieldCardProps) {
  const navigate = useNavigate();
  const { rain, state: rainState } = useFieldRain(field.id);
  const summary = field.activitySummary;
  const planted = !!summary?.planted;
  const harvested = !!summary?.harvested;
  const status = statusConfig(planted, harvested);
  const hasRain = rainState === 'done' && rain != null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.04, 0.3) }}
      onClick={() => navigate(`/field/${field.id}`)}
      className={`${status.bg} border ${status.border || 'border-border'} rounded-xl p-3 px-3.5 flex items-center justify-between ring-1 ring-white/5 shadow-xl cursor-pointer hover:bg-card/80 transition-all active:scale-[0.97] relative`}
    >
      {/* Status dot */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[3px] w-1.5 h-9 rounded-r-full opacity-80" style={{ backgroundColor: status.dotColor }} />

      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg ${status.iconBg} flex items-center justify-center ${status.iconColor} shrink-0`}>
          {harvested ? <Wheat size={15} /> : planted ? <Sprout size={15} /> : <MapPin size={15} />}
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="font-bold text-foreground text-sm">{field.name}</h3>
            <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded-full ${planted ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
              {status.label}
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground font-mono text-[11px] mt-0.5">
            <span>{field.acreage} ac</span>
            {planted && !harvested && <span className="text-emerald-500">● In season</span>}
            {harvested && <span className="text-amber-500">● Complete</span>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-0.5">
        {/* Rainfall Badge */}
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/field/${field.id}`); }}
          className="h-9 px-2 flex items-center justify-center gap-1 text-blue-400/70 hover:text-blue-400 transition-colors active:scale-90 shrink-0"
          title={
            hasRain
              ? `Rainfall — 24h: ${fmtRain(rain!['24h'])}" | 7d: ${fmtRain(rain!['7d'])}"`
              : 'View field details'
          }
        >
          <Droplets size={13} />
          <span className="text-[10px] font-mono font-bold">
            {rainState === 'loading' ? (
              <Loader2 size={11} className="animate-spin" />
            ) : hasRain ? (
              `${fmtRain(rain!['24h'])}"`
            ) : (
              <span className="text-muted-foreground/40">—</span>
            )}
          </span>
        </button>

        {/* Seasonal Activity Icons */}
        <div className="flex items-center">
          {planted && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/field/${field.id}#planting`); }}
              className="h-9 w-9 flex items-center justify-center text-emerald-500/50 hover:text-emerald-500 transition-colors active:scale-90"
              title="Planting Activity"
            >
              <Sprout size={15} />
            </button>
          )}
          {(summary?.sprayed ?? 0) > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/field/${field.id}#spraying`); }}
              className="h-9 w-9 flex items-center justify-center text-blue-400/50 hover:text-blue-400 transition-colors active:scale-90"
              title="Spraying Activity"
            >
              <div className="flex items-center">
                <Cloud size={15} />
                <span className="text-[9px] font-mono font-bold ml-0.5">{summary?.sprayed}</span>
              </div>
            </button>
          )}
          {(summary?.fertilized ?? 0) > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/field/${field.id}#fertilizer`); }}
              className="h-9 w-9 flex items-center justify-center text-purple-400/50 hover:text-purple-400 transition-colors active:scale-90"
              title="Fertilizer Activity"
            >
              <Flask size={15} />
            </button>
          )}
          {harvested && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/field/${field.id}#harvest`); }}
              className="h-9 w-9 flex items-center justify-center text-amber-500/50 hover:text-amber-500 transition-colors active:scale-90"
              title="Harvest Activity"
            >
              <Wheat size={15} />
            </button>
          )}
        </div>
        <ChevronRight size={18} className="text-muted-foreground/40 ml-0.5" />
      </div>
    </motion.div>
  );
}
