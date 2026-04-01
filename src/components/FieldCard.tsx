import { useNavigate } from 'react-router-dom';
import { Field } from '@/types/farm';
import { useFarm } from '@/store/farmStore';
import { MapPin, ChevronRight, Sprout, Cloud, FlaskConical as Flask, Wheat, Droplets, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

// ── Types ───────────────────────────────────────────────────────────────

interface FieldCardProps {
  field: Field;
  index?: number;
}

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

const fmtRain = (v: number) => v.toFixed(2);

/**
 * Compute a centroid [lat, lng] from a GeoJSON Polygon boundary.
 * Returns null if boundary is missing or has no coordinates.
 */
function centroidFromBoundary(boundary: Field['boundary']): [number, number] | null {
  if (!boundary?.coordinates?.[0]?.length) return null;
  const ring = boundary.coordinates[0];
  let lat = 0, lng = 0;
  for (const c of ring) { lat += c[1]; lng += c[0]; }
  return [lat / ring.length, lng / ring.length];
}

/**
 * Resolve the best [lat, lng] for a field — uses direct lat/lng if
 * available, otherwise falls back to computing a centroid from the
 * polygon boundary.  Returns null when neither is available.
 */
function resolveCoords(field: Field): [number, number] | null {
  if (field.lat != null && field.lng != null) {
    return [field.lat, field.lng];
  }
  return centroidFromBoundary(field.boundary);
}

/**
 * Direct fetch to the rain API — no promise caching, no RainService,
 * no custom range calls.  Just GET /rain?lat=X&lon=Y&days=7 and
 * sum the last day from the breakdown (per the Rain API instructions).
 */
async function fetchRain24h(
  lat: number,
  lng: number,
): Promise<number | null> {
  const baseUrl = (typeof import.meta !== 'undefined')
    ? import.meta.env?.VITE_RAIN_API_URL
    : (typeof process !== 'undefined' ? process.env?.VITE_RAIN_API_URL : undefined);

  if (!baseUrl) {
    console.warn('[FieldCard] VITE_RAIN_API_URL not set');
    return null;
  }

  const url = `${baseUrl}/rain?lat=${lat}&lon=${lng}&days=7`;

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[FieldCard] Rain API ${res.status}`);
    return null;
  }

  const data = await res.json();
  const breakdown: Record<string, number> = data.breakdown || {};
  const dates = Object.keys(breakdown).sort();
  if (dates.length === 0) return 0;

  // Return the most recent day's rainfall (24h)
  return Number(breakdown[dates[dates.length - 1]]) || 0;
}

/**
 * useFieldRain — simplest possible hook.
 *
 * 1. Wait 3 seconds for the store to hydrate from Supabase.
 * 2. Read the field's lat/lng (or compute centroid from boundary).
 * 3. Make ONE direct fetch to the rain API.
 * 4. Show result, or hide the badge on any failure.
 */
function useFieldRain(fieldId: string) {
  const { fields } = useFarm();
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const [rain24h, setRain24h] = useState<number | null>(undefined as unknown as number);
  const [status, setStatus] = useState<'loading' | 'ready' | 'hidden'>('loading');

  useEffect(() => {
    if (!fieldId) return;

    let cancelled = false;

    const timer = setTimeout(async () => {
      if (cancelled) return;

      const field = fieldsRef.current.find(f => f.id === fieldId);
      if (!field) { setStatus('hidden'); return; }

      const coords = resolveCoords(field);
      if (!coords) { setStatus('hidden'); return; }

      try {
        const inches = await fetchRain24h(coords[0], coords[1]);
        if (cancelled) return;
        setRain24h(inches);
        setStatus('ready');
      } catch (err: any) {
        console.warn(`[FieldCard] rain:`, err?.message);
        if (!cancelled) setStatus('hidden');
      }
    }, 3000);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [fieldId]);

  return { rain24h, status };
}

// ── Component ───────────────────────────────────────────────────────────

export default function FieldCard({ field, index = 0 }: FieldCardProps) {
  const navigate = useNavigate();
  const { rain24h, status } = useFieldRain(field.id);
  const summary = field.activitySummary;
  const planted = !!summary?.planted;
  const harvested = !!summary?.harvested;
  const status_ = statusConfig(planted, harvested);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.04, 0.3) }}
      onClick={() => navigate(`/field/${field.id}`)}
      className={`${status_.bg} border ${status_.border || 'border-border'} rounded-xl p-3 px-3.5 flex items-center justify-between ring-1 ring-white/5 shadow-xl cursor-pointer hover:bg-card/80 transition-all active:scale-[0.97] relative`}
    >
      {/* Status dot */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[3px] w-1.5 h-9 rounded-r-full opacity-80" style={{ backgroundColor: status_.dotColor }} />

      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg ${status_.iconBg} flex items-center justify-center ${status_.iconColor} shrink-0`}>
          {harvested ? <Wheat size={15} /> : planted ? <Sprout size={15} /> : <MapPin size={15} />}
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="font-bold text-foreground text-sm">{field.name}</h3>
            <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded-full ${planted ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
              {status_.label}
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
        {/* Rainfall Badge — only shown while loading or when we have data */}
        {status !== 'hidden' && (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/field/${field.id}`); }}
            className="h-9 px-2 flex items-center justify-center gap-1 text-blue-400/70 hover:text-blue-400 transition-colors active:scale-90 shrink-0"
            title={status === 'ready' && rain24h != null ? `24h: ${fmtRain(rain24h)}"` : ''}
          >
            <Droplets size={13} />
            <span className="text-[10px] font-mono font-bold">
              {status === 'loading' ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                `${fmtRain(rain24h!)}"`
              )}
            </span>
          </button>
        )}

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
