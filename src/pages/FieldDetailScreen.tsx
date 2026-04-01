import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useFarm } from '@/store/farmStore';
import { 
  Sprout, Leaf, Tractor, ArrowLeft, 
  Cloud, MapPin, Droplets, RefreshCw, 
  AlertCircle, History, 
  FileText, ExternalLink, Info, CheckCircle2
} from 'lucide-react';
import PlantModal from '@/components/PlantModal';
import SprayModal from '@/components/SprayModal';
import HarvestModal from '@/components/HarvestModal';
import HayModal from '@/components/HayModal';
import FertilizerModal from '@/components/FertilizerModal';
import TillageModal from '@/components/TillageModal';
import Logo from '@/components/Logo';
import ActivityFeed from '@/components/ActivityFeed';
import FieldNotes from '@/components/FieldNotes';
import { generateSprayPDF } from '@/lib/sprayExport';
import { getRainApiBaseUrl, resolveCoords, sumLastNDays } from '@/utils/rain';

export type ModalType = 'plant' | 'spray' | 'harvest' | 'hay' | 'fertilizer' | 'tillage' | null;

const FIELD_ACTIONS = [
  { id: 'spray', label: 'Log Spray', icon: Cloud, color: 'text-spray', bg: 'bg-spray/10', border: 'border-spray/20' },
  { id: 'plant', label: 'Log Plant', icon: Leaf, color: 'text-plant', bg: 'bg-plant/10', border: 'border-plant/20' },
  { id: 'fertilizer', label: 'Log Fert', icon: Sprout, color: 'text-lime-500', bg: 'bg-lime-500/10', border: 'border-lime-500/20' },
  { id: 'tillage', label: 'Log Till', icon: Tractor, color: 'text-orange-600', bg: 'bg-orange-600/10', border: 'border-orange-600/20' }
] as const;

export default function FieldDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { 
    fields, 
    plantRecords, 
    sprayRecords, 
    harvestRecords, 
    hayHarvestRecords, 
    fertilizerApplications,
    tillageRecords,
    viewingSeason,
    farmName
  } = useFarm();
  const field = useMemo(() => fields.find(f => f.id === id), [fields, id]);

  const [rainStats, setRainStats] = useState<{
    '24h': number;
    '72h': number;
    '7d': number;
    sincePlanting: number;
    sinceLastSpray: number;
    periodEndUtc: string;
    dataWarning?: string;
  } | null>(null);
  
  const [rainError, setRainError] = useState<string | null>(null);
  const [fetchingRain, setFetchingRain] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);
  const [editingRecord, setEditingRecord] = useState<any>(null);

  // Derived Values
  const unifiedRecords = useMemo(() => {
    if (!field) return [];
    const all = [
      ...plantRecords.filter(r => r.fieldId === field.id && r.seasonYear === viewingSeason).map(r => ({ type: 'plant' as const, data: r })),
      ...sprayRecords.filter(r => r.fieldId === field.id && r.seasonYear === viewingSeason).map(r => ({ type: 'spray' as const, data: r })),
      ...harvestRecords.filter(r => r.fieldId === field.id && r.seasonYear === viewingSeason).map(r => ({ type: 'harvest' as const, data: r })),
      ...hayHarvestRecords.filter(r => r.fieldId === field.id && r.seasonYear === viewingSeason).map(r => ({ type: 'hay' as const, data: r })),
      ...fertilizerApplications.filter(r => r.fieldId === field.id && r.seasonYear === viewingSeason).map(r => ({ type: 'fertilizer' as const, data: r })),
      ...tillageRecords.filter(r => r.fieldId === field.id && r.seasonYear === viewingSeason).map(r => ({ type: 'tillage' as const, data: r })),
    ];
    const getTS = (r: any) => {
      if (r.timestamp) return r.timestamp;
      const dateStr = r.date || r.plantDate || r.sprayDate || r.harvestDate || r.date;
      return dateStr ? new Date(dateStr).getTime() : 0;
    };
    return all.sort((a, b) => getTS(b.data) - getTS(a.data));
  }, [field, plantRecords, sprayRecords, harvestRecords, hayHarvestRecords, fertilizerApplications, tillageRecords, viewingSeason]);

  const latestActivity = unifiedRecords[0];
  
  const latestPlanting = useMemo(() => 
    plantRecords
      .filter(r => r.fieldId === field?.id && r.seasonYear === viewingSeason)
      .sort((a,b) => new Date(b.plantDate || 0).getTime() - new Date(a.plantDate || 0).getTime())[0]
  , [plantRecords, field?.id, viewingSeason]);

  const latestSpray = useMemo(() => 
    sprayRecords
      .filter(r => r.fieldId === field?.id && r.seasonYear === viewingSeason)
      .sort((a,b) => new Date(b.sprayDate || 0).getTime() - new Date(a.sprayDate || 0).getTime())[0]
  , [sprayRecords, field?.id, viewingSeason]);

  const crop = latestPlanting?.crop || field?.intendedUse || 'No Crop Logged';

  /** Format rainfall to 2 decimal places; null/undefined fallback to '0.00' */
  const fmtRain = (val: number | undefined | null) =>
    val != null ? val.toFixed(2) : '0.00';

  const daysSinceSpray = useMemo(() => {
    if (!latestSpray?.sprayDate) return null;
    const diff = new Date().getTime() - new Date(latestSpray.sprayDate).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }, [latestSpray]);

  // Keep refs to the latest store values so the async fetch reads fresh data
  // without triggering re-fetches when the store updates.
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const plantRef = useRef(plantRecords);
  plantRef.current = plantRecords;
  const sprayRef = useRef(sprayRecords);
  sprayRef.current = sprayRecords;
  const seasonRef = useRef(viewingSeason);
  seasonRef.current = viewingSeason;

  /**
   * Direct rain fetch — bypasses RainService's promiseCache which
   * caches rejected promises for 30s and causes persistent failures.
   * Per rainapiinstructions.md: GET /rain?lat=X&lon=Y&days=7
   */
  const doFetchRain = async (fieldId: string) => {
    const f = fieldsRef.current.find(x => x.id === fieldId);
    if (!f) { setRainError('Field not found'); return; }

    const coords = resolveCoords(f);
    if (!coords) { setRainError('No location data for this field'); return; }

    const baseUrl = getRainApiBaseUrl();
    if (!baseUrl) { setRainError('Rain API not configured'); return; }

    try {
      const res = await fetch(`${baseUrl}?lat=${coords[0]}&lon=${coords[1]}&days=7`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`API ${res.status}: ${err.error || 'Unknown'}`);
      }
      const data = await res.json();
      const bd: Record<string, number> = data.breakdown || {};

      const r24 = sumLastNDays(bd, 1);
      const r72 = sumLastNDays(bd, 3);
      const r7d = Number(data.rainfall) || Object.values(bd).reduce((s, v) => s + (Number(v) || 0), 0);

      const periodEnd = data.period?.end
        ? `${data.period.end}T23:59:59Z`
        : new Date().toISOString();

      // Custom range calls for since-planting / since-spray
      // Uses coordinate-based IEM queries (lat/lon/days=N) instead of
      // field_id mode, which depends on Supabase MRMS data that may be
      // incomplete or blocked by RLS changes.
      const season = seasonRef.current;
      const latestP = plantRef.current
        .filter(r => r.fieldId === fieldId && r.seasonYear === season)
        .sort((a, b) => new Date(b.plantDate || 0).getTime() - new Date(a.plantDate || 0).getTime())[0];
      const latestS = sprayRef.current
        .filter(r => r.fieldId === fieldId && r.seasonYear === season)
        .sort((a, b) => new Date(b.sprayDate || 0).getTime() - new Date(a.sprayDate || 0).getTime())[0];

      const fetchDaysSince = async (dateStr: string): Promise<number> => {
        try {
          const start = new Date(dateStr);
          const now = new Date();
          const diffMs = now.getTime() - start.getTime();
          const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          if (days <= 0) return 0;
          // Cap at 365 days to avoid oversized IEM requests
          const cappedDays = Math.min(days, 365);
          const r = await fetch(`${baseUrl}?lat=${coords[0]}&lon=${coords[1]}&days=${cappedDays}`);
          if (!r.ok) return 0;
          const d = await r.json();
          return Number(d.rainfall || 0);
        } catch { return 0; }
      };
      const [sincePlant, sinceSpray] = await Promise.all([
        latestP?.plantDate ? fetchDaysSince(latestP.plantDate) : 0,
        latestS?.sprayDate ? fetchDaysSince(latestS.sprayDate) : 0,
      ]);

      setRainStats({
        '24h': Math.round(r24 * 1000) / 1000,
        '72h': Math.round(r72 * 1000) / 1000,
        '7d': Math.round(r7d * 1000) / 1000,
        sincePlanting: Math.round(sincePlant * 1000) / 1000,
        sinceLastSpray: Math.round(sinceSpray * 1000) / 1000,
        periodEndUtc: periodEnd,
        dataWarning: undefined,
      });
      setRainError(null);
    } catch (err: any) {
      console.error('[FieldDetail] Rain fetch error:', err);
      setRainError(err.message || 'Could not load rainfall data.');
    } finally {
      setFetchingRain(false);
    }
  };

  // Auto-fetch on mount with a 2-second delay to let the store hydrate.
  // Only depends on the stable fieldId string — never on store objects.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!id) return;
    fetchedRef.current = false;
    const timer = setTimeout(() => {
      if (!fetchedRef.current) {
        fetchedRef.current = true;
        setFetchingRain(true);
        doFetchRain(id);
      }
    }, 2000);
    return () => { clearTimeout(timer); fetchedRef.current = false; };
  }, [id]);

  // Manual refresh button handler
  const handleFetchRain = useCallback(() => {
    if (!id || fetchingRain) return;
    setFetchingRain(true);
    setRainError(null);
    doFetchRain(id);
  }, [id, fetchingRain]);

  const location = useLocation();
  useEffect(() => {
    if (location.hash === '#planting') setModal('plant');
    if (location.hash === '#spraying') setModal('spray');
    if (location.hash === '#fertilizer') setModal('fertilizer');
    if (location.hash === '#tillage') setModal('tillage');
  }, [location.hash]);

  if (!field) return <div className="p-8 text-center text-muted-foreground uppercase font-mono">Field not found</div>;

  const handleEdit = (type: ModalType, record: any) => {
    setEditingRecord(record);
    setModal(type);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 dark:bg-slate-950">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200 p-4 dark:bg-slate-900/80 dark:border-slate-800">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft size={24} />
          </button>
          <Logo className="h-8" />
          <div className="w-10" />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        
        {/* 1. Dashboard Header */}
        <section className="space-y-1">
          <div className="flex items-baseline justify-between">
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{field.name}</h1>
            <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">{field.acreage} ac</span>
          </div>
          <div className="flex flex-wrap gap-2 items-center text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-tight">
              <Sprout size={12} className="text-emerald-500" />
              {crop}
            </div>
            {(field.fsaFarmNumber || field.fsaTractNumber) && (
              <div className="text-[10px] font-mono text-slate-400 uppercase">
                FSA: {field.fsaFarmNumber || '—'} / {field.fsaTractNumber || '—'} / {field.fsaFieldNumber || '—'}
              </div>
            )}
          </div>
          <p className="text-[10px] font-medium text-slate-400 italic">
            Rainfall updated daily at 8:00 AM
          </p>
        </section>

        {/* 2. Today at a Glance - Grid of 4 Cards */}
        <section className="grid grid-cols-2 gap-3 pb-2">
          {/* Rainfall Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-500">
                <Droplets size={16} />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Rainfall</span>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-black text-slate-900 dark:text-white leading-none">
                {fetchingRain && !rainStats ? (
                  <span className="text-slate-300 animate-pulse">...</span>
                ) : (
                  `${fmtRain(rainStats?.['24h'])}"`
                )}
              </div>
              <div className="text-[10px] text-slate-500 font-medium">
                7D: <span className="text-slate-900 dark:text-slate-300 font-bold">{fmtRain(rainStats?.['7d'])}"</span>
              </div>
              <div className="text-[10px] text-slate-500 font-medium truncate">
                Plant: <span className="text-slate-900 dark:text-slate-300 font-bold">{fmtRain(rainStats?.sincePlanting)}"</span>
              </div>
            </div>
          </div>

          {/* Spray Status Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-500">
                <Cloud size={16} />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Spray</span>
            </div>
            <div className="space-y-1">
              <div className="text-xl font-black text-slate-900 dark:text-white leading-tight">
                {daysSinceSpray === null ? 'None' : daysSinceSpray === 0 ? 'Today' : `${daysSinceSpray}d ago`}
              </div>
              <div className="text-[10px] text-slate-500 font-medium truncate">
                Rain: <span className="text-slate-900 dark:text-slate-300 font-bold">{fmtRain(rainStats?.sinceLastSpray)}"</span>
              </div>
              <div className="text-[10px] text-slate-500 font-medium truncate italic h-4">
                {latestSpray?.products?.[0]?.product || 'No product'}
              </div>
            </div>
          </div>

          {/* Latest Activity Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-500">
                <History size={16} />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Latest</span>
            </div>
            <div className="space-y-1">
              <div className="text-lg font-black text-slate-900 dark:text-white capitalize leading-tight">
                {latestActivity?.type || 'No Activity'}
              </div>
              <div className="text-[10px] text-slate-500 font-medium">
                {latestActivity ? (() => {
                  const d = latestActivity.data as any;
                  const dateVal = d.date || d.plantDate || d.sprayDate || d.harvestDate || '';
                  return dateVal ? new Date(dateVal).toLocaleDateString() : '—';
                })() : '—'}
              </div>
              <div className="text-[10px] text-slate-500 font-medium truncate">
                {latestActivity ? (latestActivity.data as any).startTime ? `Started @ ${(latestActivity.data as any).startTime}` : '—' : '—'}
              </div>
            </div>
          </div>

          {/* Crop Status Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500">
                <Leaf size={16} />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Crop</span>
            </div>
            <div className="space-y-1">
              <div className="text-lg font-black text-slate-900 dark:text-white leading-tight truncate">
                {crop || 'Fallow'}
              </div>
              <div className="text-[10px] text-slate-500 font-medium truncate">
                {latestPlanting?.plantDate ? `Set ${new Date(latestPlanting.plantDate).toLocaleDateString()}` : 'Not planted'}
              </div>
              <div className="text-[10px] text-slate-500 font-medium truncate italic h-4">
                {latestPlanting?.seedVariety || ''}
              </div>
            </div>
          </div>
        </section>

        {/* 3. Quick Actions */}
        <section className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {FIELD_ACTIONS.map((action) => (
              <button
                key={action.id}
                onClick={() => { setEditingRecord(null); setModal(action.id as ModalType); }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm transition-transform active:scale-95"
              >
                <div className={`p-2 rounded-xl ${action.bg} ${action.color}`}>
                  <action.icon size={20} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-tighter text-slate-600 dark:text-slate-400">{action.label.split(' ')[1]}</span>
              </button>
            ))}
          </div>
          <button 
            onClick={() => {
              const el = document.getElementById('history-section');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold uppercase tracking-widest hover:bg-slate-200 transition-colors"
          >
            <History size={14} />
            View Full History
          </button>
        </section>

        {/* 4. Rainfall Summary Section */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
              <Droplets size={16} className="text-blue-500" />
              Rainfall Summary
            </h3>
            <button
              onClick={() => handleFetchRain()}
              disabled={fetchingRain}
              className="p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-30"
            >
              <RefreshCw size={16} className={`${fetchingRain ? 'animate-spin' : ''} text-slate-400`} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: '24 Hours', value: fmtRain(rainStats?.['24h']) },
              { label: '72 Hours', value: fmtRain(rainStats?.['72h']) },
              { label: '7 Days', value: fmtRain(rainStats?.['7d']) },
              { label: 'Planted', value: fmtRain(rainStats?.sincePlanting), sub: 'Since' },
              { label: 'Sprayed', value: fmtRain(rainStats?.sinceLastSpray), sub: 'Since' },
            ].map((stat, i) => (
              <div key={i} className={`p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 ${stat.label === 'Planted' || stat.label === 'Sprayed' ? 'col-span-1' : ''}`}>
                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">{stat.sub ? `${stat.sub} ${stat.label}` : stat.label}</div>
                <div className="text-xl font-black text-slate-900 dark:text-white leading-none">{stat.value}"</div>
              </div>
            ))}
          </div>
          
          {rainError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 flex gap-2">
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <p className="text-[10px] text-red-600 dark:text-red-400 font-medium leading-tight">{rainError}</p>
            </div>
          )}

          <div className="flex flex-col gap-2 text-[10px] text-slate-400 font-medium bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg">
            <div className="flex items-center gap-2">
              <Info size={12} />
              Data updated hourly. {rainStats?.periodEndUtc && `Last synced: ${new Date(rainStats.periodEndUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </div>
            {rainStats?.dataWarning && (
              <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 font-bold uppercase tracking-tighter bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                <AlertCircle size={12} className="mt-0.5 animate-pulse" />
                <span className="leading-tight">{rainStats.dataWarning}</span>
              </div>
            )}
          </div>
        </section>

        {/* 5. Spray Summary Card */}
        {latestSpray && (
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                <Cloud size={16} className="text-purple-500" />
                Latest Spray
              </h3>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                <CheckCircle2 size={12} />
                {latestSpray.nonCompliant ? 'Attention Needed' : 'Compliant'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Application Date</label>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {new Date(latestSpray.sprayDate || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div className="text-[10px] text-slate-500">{latestSpray.startTime} - {latestSpray.endTime}</div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Rain Since Spray</label>
                <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Droplets size={14} className="text-blue-400" />
                  {fmtRain(rainStats?.sinceLastSpray)}"
                </div>
              </div>
              <div className="col-span-2">
                <div className="flex flex-wrap gap-1.5">
                  {latestSpray.products?.map((p, idx) => (
                    <div key={idx} className="flex flex-col gap-0.5 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {p.product} ({p.rate} {p.rateUnit})
                      </span>
                      {p.activeIngredients && (
                        <span className="text-[9px] font-mono text-slate-400 italic leading-none pb-0.5">
                          {p.activeIngredients}
                        </span>
                      )}
                    </div>
                  )) || <span className="text-slate-400 text-xs">No products logged</span>}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Target Pest</label>
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{latestSpray.targetPest || 'General'}</div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button 
                onClick={() => handleEdit('spray', latestSpray)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-100 transition-colors"
              >
                <FileText size={14} />
                View Record
              </button>
              <button 
                onClick={() => generateSprayPDF([latestSpray], farmName)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 text-[10px] font-bold uppercase tracking-widest hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
              >
                <ExternalLink size={14} />
                Export PDF
              </button>
            </div>
          </section>
        )}

        {/* 6. Field History Timeline */}
        <section id="history-section" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
              <History size={16} className="text-slate-400" />
              Field History
            </h3>
            <button 
              onClick={() => { /* Potential full history dialog/navigation */ }}
              className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
            >
              View Full
            </button>
          </div>
          
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-2 shadow-sm">
            <ActivityFeed 
              records={unifiedRecords.slice(0, 8)} 
              year={viewingSeason} 
              onEdit={handleEdit} 
              hideHeader 
            />
            {unifiedRecords.length > 8 && (
              <button 
                className="w-full py-4 text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
              >
                + {unifiedRecords.length - 8} more activities
              </button>
            )}
            {unifiedRecords.length === 0 && (
              <div className="py-12 text-center space-y-2">
                <div className="p-3 rounded-full bg-slate-50 dark:bg-slate-800 w-fit mx-auto text-slate-300">
                  <History size={24} />
                </div>
                <p className="text-xs font-medium text-slate-400">No activity logged for this season</p>
              </div>
            )}
          </div>
        </section>

        {/* 7. Field Details (Meta) */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
            <MapPin size={16} className="text-emerald-500" />
            Field Details
          </h3>
          
          <div className="grid grid-cols-2 gap-y-4 text-xs">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Acreage</label>
              <div className="font-bold text-slate-700 dark:text-slate-300">{field.acreage} Calculated Acres</div>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Location</label>
              <div className="font-mono text-[10px] text-slate-700 dark:text-slate-300">{field.lat?.toFixed(4)}, {field.lng?.toFixed(4)}</div>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Irrigation</label>
              <div className="font-bold text-slate-700 dark:text-slate-300">{field.irrigationPractice || 'Non-Irrigated'}</div>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Intended Use</label>
              <div className="font-bold text-slate-700 dark:text-slate-300">{field.intendedUse || 'Cash Grain'}</div>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Share %</label>
              <div className="font-bold text-slate-700 dark:text-slate-300">{field.producerShare || 100}% Producer</div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <FieldNotes field={field} />
          </div>
        </section>

      </main>

      {/* Modals - Reusing existing implementation */}
      {modal === 'plant' && (
        <PlantModal field={field} open initialData={editingRecord} onClose={() => { setModal(null); setEditingRecord(null); }} />
      )}
      {modal === 'spray' && (
        <SprayModal field={field} open initialData={editingRecord} onClose={() => { setModal(null); setEditingRecord(null); }} />
      )}
      {modal === 'harvest' && (
        <HarvestModal field={field} open initialData={editingRecord} onClose={() => { setModal(null); setEditingRecord(null); }} />
      )}
      {modal === 'hay' && (
        <HayModal field={field} open initialData={editingRecord} onClose={() => { setModal(null); setEditingRecord(null); }} />
      )}
      {modal === 'fertilizer' && (
        <FertilizerModal field={field} open initialData={editingRecord} onClose={() => { setModal(null); setEditingRecord(null); }} />
      )}
      {modal === 'tillage' && (
        <TillageModal field={field} open initialData={editingRecord} onClose={() => { setModal(null); setEditingRecord(null); }} />
      )}
    </div>
  );
}
