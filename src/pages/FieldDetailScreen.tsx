import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Sprout, Leaf, Tractor, ArrowLeft,
  Cloud, MapPin, Droplets, RefreshCw,
  AlertCircle, History as HistoryIcon, Wheat, Package,
  FileText, ExternalLink, Info, CheckCircle2, Map as MapIcon
} from 'lucide-react';

import { useFarm } from '@/store/farmStore';
import { RainService, type RainfallResult } from '@/services/RainService';
import { getDisplayFieldAcres } from '@/lib/fieldAcreage';
import { resolveFieldRainfallLocation } from '@/lib/fieldLocation';
import { generateSprayPDF } from '@/lib/sprayExport';
import { roundTo } from '@/utils/numbers';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import TractAssignmentFlow from '@/components/TractAssignmentFlow';

import PlantModal from '@/components/PlantModal';
import SprayModal from '@/components/SprayModal';
import HarvestModal from '@/components/HarvestModal';
import HayModal from '@/components/HayModal';
import FertilizerModal from '@/components/FertilizerModal';
import TillageModal from '@/components/TillageModal';
import Logo from '@/components/Logo';
import ActivityFeed from '@/components/ActivityFeed';
import FieldNotes from '@/components/FieldNotes';
import FieldBoundaryMap from '@/components/FieldBoundaryMap';

export type ModalType = 'plant' | 'spray' | 'harvest' | 'hay' | 'fertilizer' | 'tillage' | null;

const FIELD_ACTIONS = [
  { id: 'spray', label: 'Log Spray', icon: Cloud, color: 'text-spray', bg: 'bg-spray/10', border: 'border-spray/20' },
  { id: 'plant', label: 'Log Plant', icon: Leaf, color: 'text-plant', bg: 'bg-plant/10', border: 'border-plant/20' },
  { id: 'fertilizer', label: 'Log Fert', icon: Sprout, color: 'text-lime-500', bg: 'bg-lime-500/10', border: 'border-lime-500/20' },
  { id: 'tillage', label: 'Log Till', icon: Tractor, color: 'text-orange-600', bg: 'bg-orange-600/10', border: 'border-orange-600/20' },
  { id: 'harvest', label: 'Log Harvest', icon: Wheat, color: 'text-harvest', bg: 'bg-harvest/10', border: 'border-harvest/20' },
  { id: 'hay', label: 'Log Hay', icon: Package, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
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
    cluAssignments,
    fsaTracts,
    viewingSeason,
    farmName
  } = useFarm();
  const field = useMemo(() => fields.find(f => f.id === id), [fields, id]);
  const displayFieldAcres = useMemo(
    () => field ? roundTo(getDisplayFieldAcres(field, cluAssignments), 0) : 0,
    [field, cluAssignments]
  );

  const [rainStats, setRainStats] = useState<RainfallResult | null>(null);

  const [rainError, setRainError] = useState<string | null>(null);
  const [fetchingRain, setFetchingRain] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);
  const [isCluDialogOpen, setIsCluDialogOpen] = useState(false);

  const fieldClus = useMemo(() => {
    return cluAssignments.filter(a => a.fieldId === id && !a.deletedAt);
  }, [cluAssignments, id]);

  const fieldCroplandAcres = useMemo(() => {
    return fieldClus.filter(a => a.landUse === 'cropland').reduce((sum, a) => sum + a.acres, 0);
  }, [fieldClus]);

  const fieldNonCroplandAcres = useMemo(() => {
    return fieldClus.filter(a => a.landUse === 'non_cropland').reduce((sum, a) => sum + a.acres, 0);
  }, [fieldClus]);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editingMode, setEditingMode] = useState<'edit' | 'duplicate'>('edit');
  const fetchingRainRef = useRef(false);
  const inFlightRainFetchKeyRef = useRef<string | null>(null);
  const lastSuccessfulRainFetchKeyRef = useRef<string | null>(null);
  const fieldRef = useRef(field);
  const fieldClusRef = useRef(fieldClus);
  const fsaTractsRef = useRef(fsaTracts);
  fieldRef.current = field;
  fieldClusRef.current = fieldClus;
  fsaTractsRef.current = fsaTracts;
  const fieldCluNumbersKey = (field?.cluNumbers ?? []).filter(Boolean).sort().join('|');
  const fieldAssignmentLocationKey = fieldClus
    .map(assignment => `${assignment.tractKey}:${assignment.cluNumber}:${assignment.deletedAt ?? ''}`)
    .sort()
    .join('|');
  const fsaTractLocationKey = fsaTracts
    .filter(tract => !tract.deletedAt)
    .map(tract => `${tract.tractKey}:${tract.featureCount}:${tract.importedAt}`)
    .sort()
    .join('|');

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

  // Fetching Logic
  const handleFetchRain = useCallback(async (signal?: AbortSignal, force = false) => {
    const currentField = fieldRef.current;
    if (!currentField?.id || fetchingRainRef.current) return;

    fetchingRainRef.current = true;
    setFetchingRain(true);
    setRainError(null);

    let fetchKey: string | null = null;
    try {
      const location = await resolveFieldRainfallLocation(
        currentField,
        fieldClusRef.current,
        fsaTractsRef.current,
      );
      if (signal?.aborted) return;

      // Skip if this exact field/activity/location combination is already loaded or loading.
      fetchKey = JSON.stringify({
        fieldId: currentField.id,
        lat: location.lat,
        lng: location.lng,
        boundary: location.boundary ?? null,
        locationSource: location.source,
        plantDate: latestPlanting?.plantDate || '',
        sprayDate: latestSpray?.sprayDate || '',
      });
      if (!force && lastSuccessfulRainFetchKeyRef.current === fetchKey) return;
      if (inFlightRainFetchKeyRef.current === fetchKey) return;
      inFlightRainFetchKeyRef.current = fetchKey;

      const data = await RainService.fetchComprehensiveRainfall({
        fieldId: currentField.id,
        lat: location.lat,
        lng: location.lng,
        boundary: location.boundary,
        sincePlantingDate: latestPlanting?.plantDate,
        sinceLastSprayDate: latestSpray?.sprayDate,
        signal
      });
      if (!signal?.aborted) {
        setRainStats(data);
        lastSuccessfulRainFetchKeyRef.current = fetchKey;
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || signal?.aborted) return;
      console.error('[FieldDetail] Rain fetch error:', err);
      setRainError(err.message || 'Could not load rainfall data.');
    } finally {
      if (fetchKey && inFlightRainFetchKeyRef.current === fetchKey) {
        inFlightRainFetchKeyRef.current = null;
      }
      fetchingRainRef.current = false;
      if (!signal?.aborted) {
        setFetchingRain(false);
      }
    }
  }, [
    field?.id,
    field?.lat,
    field?.lng,
    field?.boundary,
    field?.fsaFarmNumber,
    field?.fsaTractNumber,
    fieldCluNumbersKey,
    fieldAssignmentLocationKey,
    fsaTractLocationKey,
    latestPlanting?.plantDate,
    latestSpray?.sprayDate
  ]);

  useEffect(() => {
    if (!field?.id) return;
    const controller = new AbortController();
    handleFetchRain(controller.signal);
    return () => {
      controller.abort();
      // Ensure we clear the fetching ref on unmount
      fetchingRainRef.current = false;
    };
  }, [field?.id, handleFetchRain]);

  const location = useLocation();
  useEffect(() => {
    if (location.hash === '#planting') setModal('plant');
    if (location.hash === '#spraying') setModal('spray');
    if (location.hash === '#fertilizer') setModal('fertilizer');
    if (location.hash === '#tillage') setModal('tillage');
  }, [location.hash]);

  if (!field) return <div className="p-8 text-center text-muted-foreground">Field not found</div>;

  const handleEdit = (type: ModalType, record: any) => {
    setEditingRecord(record);
    setEditingMode('edit');
    setModal(type);
  };

  const handleDuplicate = (type: ModalType, record: any) => {
    setEditingRecord(record);
    setEditingMode('duplicate');
    setModal(type);
  };

  const closeModal = () => {
    setModal(null);
    setEditingRecord(null);
    setEditingMode('edit');
  };

  const hasFsaTractReference = !!field.fsaFarmNumber && (
    !!field.fsaTractNumber || field.fsaFarmNumber.includes('-')
  );
  const hasFieldMapData =
    (field.lat != null && field.lng != null) ||
    !!field.boundary ||
    fieldClus.length > 0 ||
    hasFsaTractReference;

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-8">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border p-4">
        <div className="max-w-lg mx-auto flex items-center justify-between lg:max-w-5xl lg:px-8">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors">
            <ArrowLeft size={24} />
          </button>
          <Logo className="h-8" />
          <div className="w-10" />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6 lg:max-w-5xl lg:px-8">

        {/* 1. Dashboard Header */}
        <section className="space-y-1">
          <div className="flex items-baseline justify-between">
            <h1 className="text-3xl font-black text-foreground tracking-tight">{field.name}</h1>
            <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{displayFieldAcres} ac</span>
          </div>
          <div className="flex flex-wrap gap-2 items-center text-muted-foreground">
            <div className="flex items-center gap-1.5 bg-muted px-2 py-0.5 rounded text-xs font-bold uppercase tracking-tight">
              <Sprout size={12} className="text-primary" />
              {crop}
            </div>
            {(field.fsaFarmNumber || field.fsaTractNumber) && (
              <div className="text-xs text-muted-foreground">
                FSA: {field.fsaFarmNumber || '—'} / {field.fsaTractNumber || '—'} / {field.fsaFieldNumber || '—'}
              </div>
            )}
          </div>
          <p className="text-xs font-medium text-muted-foreground italic">
            Rainfall updated daily at 8:00 AM
          </p>
        </section>

        {/* Field Boundary Map */}
        {hasFieldMapData && (
          <section>
            <FieldBoundaryMap fieldId={field.id} />
          </section>
        )}

        {/* CLU Assignments Section */}
        <section className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <MapIcon size={18} className="text-primary" />
              FSA CLU Assignments
            </h2>
            <Button
              onClick={() => setIsCluDialogOpen(true)}
              variant="outline"
              size="sm"
              className="h-11 text-xs font-bold px-4"
            >
              Manage CLUs
            </Button>
          </div>

          {fieldClus.length > 0 ? (
            <div className="space-y-3">
              <div className="divide-y divide-border rounded-xl border border-border bg-muted/30 overflow-hidden">
                {fieldClus.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3 text-sm">
                    <div className="space-y-0.5">
                      <div className="font-mono font-bold text-foreground">
                        CLU {a.cluNumber}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        Tract Key: {a.tractKey}
                      </div>
                    </div>
                    <div className="text-right space-y-0.5">
                      <div className="font-mono font-bold text-foreground">
                        {roundTo(a.acres, 2)} ac
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium font-sans uppercase tracking-tight ${
                        a.landUse === 'cropland' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' 
                          : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                      }`}>
                        {a.landUse === 'cropland' ? 'Cropland' : 'Non-crop'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-medium text-muted-foreground bg-muted/20 p-2.5 rounded-xl border border-border/50">
                <div>Cropland: <span className="font-mono font-bold text-foreground">{roundTo(fieldCroplandAcres, 1)} ac</span></div>
                <div>Non-cropland: <span className="font-mono font-bold text-foreground">{roundTo(fieldNonCroplandAcres, 1)} ac</span></div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 px-4 border border-dashed border-border rounded-xl bg-muted/10 space-y-2">
              <p className="text-xs text-muted-foreground">
                No FSA Common Land Unit (CLU) boundaries assigned to this field yet.
              </p>
              <Button
                onClick={() => setIsCluDialogOpen(true)}
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-primary font-bold"
              >
                Assign CLU Boundaries
              </Button>
            </div>
          )}
        </section>

        {/* 2. Today at a Glance - Grid of 4 Cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 pb-2">
          {/* Rainfall Card */}
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-1.5 rounded-lg bg-spray/10 text-spray">
                <Droplets size={16} />
              </div>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-tighter">Rainfall</span>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-black text-foreground leading-none">
                {fetchingRain && !rainStats ? (
                  <span className="text-muted-foreground animate-pulse">...</span>
                ) : (
                  `${fmtRain(rainStats?.['24h'])}"`
                )}
              </div>
              <div className="text-xs text-muted-foreground font-medium">
                7D: <span className="text-foreground font-bold">{fmtRain(rainStats?.['7d'])}"</span>
              </div>
              <div className="text-xs text-muted-foreground font-medium truncate">
                Plant: <span className="text-foreground font-bold">{fmtRain(rainStats?.sincePlanting)}"</span>
              </div>
            </div>
          </div>

          {/* Spray Status Card */}
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-1.5 rounded-lg bg-spray/10 text-spray">
                <Cloud size={16} />
              </div>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-tighter">Spray</span>
            </div>
            <div className="space-y-1">
              <div className="text-xl font-black text-foreground leading-tight">
                {daysSinceSpray === null ? 'None' : daysSinceSpray === 0 ? 'Today' : `${daysSinceSpray}d ago`}
              </div>
              <div className="text-xs text-muted-foreground font-medium truncate">
                Rain: <span className="text-foreground font-bold">{fmtRain(rainStats?.sinceLastSpray)}"</span>
              </div>
              <div className="text-xs text-muted-foreground font-medium truncate italic h-4">
                {latestSpray?.products?.[0]?.product || 'No product'}
              </div>
            </div>
          </div>

          {/* Latest Activity Card */}
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-1.5 rounded-lg bg-harvest/10 text-harvest">
                <HistoryIcon size={16} />
              </div>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-tighter">Latest</span>
            </div>
            <div className="space-y-1">
              <div className="text-lg font-black text-foreground capitalize leading-tight">
                {latestActivity?.type || 'No Activity'}
              </div>
              <div className="text-xs text-muted-foreground font-medium">
                {latestActivity ? (() => {
                  const d = latestActivity.data as any;
                  const dateVal = d.date || d.plantDate || d.sprayDate || d.harvestDate || '';
                  return dateVal ? new Date(dateVal).toLocaleDateString() : '—';
                })() : '—'}
              </div>
              <div className="text-xs text-muted-foreground font-medium truncate">
                {latestActivity ? (latestActivity.data as any).startTime ? `Started @ ${(latestActivity.data as any).startTime}` : '—' : '—'}
              </div>
            </div>
          </div>

          {/* Crop Status Card */}
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Leaf size={16} />
              </div>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-tighter">Crop</span>
            </div>
            <div className="space-y-1">
              <div className="text-lg font-black text-foreground leading-tight truncate">
                {crop || 'Fallow'}
              </div>
              <div className="text-xs text-muted-foreground font-medium truncate">
                {latestPlanting?.plantDate ? `Set ${new Date(latestPlanting.plantDate).toLocaleDateString()}` : 'Not planted'}
              </div>
              <div className="text-xs text-muted-foreground font-medium truncate italic h-4">
                {latestPlanting?.seedVariety || ''}
              </div>
            </div>
          </div>
        </section>

        {/* 3. Quick Actions */}
        <section className="space-y-3">
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
            {FIELD_ACTIONS.map((action) => (
              <button
                key={action.id}
                onClick={() => { setEditingRecord(null); setModal(action.id as ModalType); }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-card border border-border shadow-sm transition-transform active:scale-95"
              >
                <div className={`p-2 rounded-xl ${action.bg} ${action.color}`}>
                  <action.icon size={20} />
                </div>
                <span className="text-xs font-black uppercase tracking-tighter text-muted-foreground">{action.label.split(' ')[1]}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              const el = document.getElementById('history-section');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-muted text-muted-foreground text-sm font-semibold hover:bg-muted/80 transition-colors"
          >
            <HistoryIcon size={14} />
            View Full History
          </button>
        </section>

        {/* 4. Rainfall Summary Section */}
        <section className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Droplets size={16} className="text-spray" />
              Rainfall Summary
            </h3>
            <button
              onClick={() => handleFetchRain(undefined, true)}
              disabled={fetchingRain}
              className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-30"
            >
              <RefreshCw size={16} className={`${fetchingRain ? 'animate-spin' : ''} text-muted-foreground`} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: '24 Hours', value: fmtRain(rainStats?.['24h']) },
              { label: '72 Hours', value: fmtRain(rainStats?.['72h']) },
              { label: '7 Days', value: fmtRain(rainStats?.['7d']) },
              { label: 'Planted', value: fmtRain(rainStats?.sincePlanting), sub: 'Since' },
              { label: 'Sprayed', value: fmtRain(rainStats?.sinceLastSpray), sub: 'Since' },
              { label: 'Season', value: rainStats?.periodEndUtc ? (() => {
                const start = latestPlanting?.plantDate ? new Date(latestPlanting.plantDate) : new Date(`${viewingSeason}-03-01`);
                const end = new Date();
                const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
                return `${days}d`;})() : '—' },
            ].map((stat, i) => (
              <div key={i} className="p-3 rounded-2xl bg-muted/50 border border-border/60">
                <div className="text-xs font-semibold text-muted-foreground mb-1 leading-none">{stat.sub ? `${stat.sub} ${stat.label}` : stat.label}</div>
                <div className="text-xl font-black font-mono text-foreground leading-none">{stat.value}"</div>
              </div>
            ))}
          </div>

          {rainError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 flex gap-2">
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <p className="text-xs text-red-600 dark:text-red-400 font-medium leading-tight">{rainError}</p>
            </div>
          )}

          <div className="flex flex-col gap-2 text-xs text-muted-foreground font-medium bg-muted/50 p-2 rounded-lg">
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
          <section className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Cloud size={16} className="text-spray" />
                Latest Spray
              </h3>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                <CheckCircle2 size={12} />
                {latestSpray.nonCompliant ? 'Attention Needed' : 'Compliant'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-0.5">Application Date</label>
                <div className="text-sm font-bold text-foreground">
                  {new Date(latestSpray.sprayDate || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div className="text-xs text-muted-foreground">{latestSpray.startTime} - {latestSpray.endTime}</div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-0.5">Rain Since Spray</label>
                <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <Droplets size={14} className="text-spray" />
                  {fmtRain(rainStats?.sinceLastSpray)}"
                </div>
              </div>
              <div className="col-span-2">
                <div className="flex flex-wrap gap-1.5">
                  {latestSpray.products?.map((p, idx) => (
                    <div key={idx} className="flex flex-col gap-0.5 px-2 py-1 rounded bg-muted">
                      <span className="text-xs font-bold text-foreground">
                        {p.product} ({p.rate} {p.rateUnit})
                      </span>
                      {p.activeIngredients && (
                        <span className="text-xs font-mono text-muted-foreground italic leading-none pb-0.5">
                          {p.activeIngredients}
                        </span>
                      )}
                    </div>
                  )) || <span className="text-muted-foreground text-xs">No products logged</span>}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-0.5">Target Pest</label>
                <div className="text-sm font-bold text-foreground truncate">{latestSpray.targetPest || 'General'}</div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-border/70">
              <button
                onClick={() => handleEdit('spray', latestSpray)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-semibold hover:bg-muted/80 transition-colors"
              >
                <FileText size={14} />
                View Record
              </button>
              <button
                onClick={() => generateSprayPDF([latestSpray], farmName)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-spray/10 text-spray text-sm font-semibold hover:bg-spray/20 transition-colors"
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
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <HistoryIcon size={16} className="text-muted-foreground" />
              Field History
            </h3>
            <button
              onClick={() => navigate('/activity')}
              className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              View All Activity
            </button>
          </div>

          <div className="bg-card border border-border rounded-2xl p-2 shadow-sm">
            <ActivityFeed
              records={unifiedRecords.slice(0, 8)}
              year={viewingSeason}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              hideHeader
            />
            {unifiedRecords.length > 8 && (
              <button
                onClick={() => navigate('/activity')}
                className="w-full py-4 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                + {unifiedRecords.length - 8} more activities
              </button>
            )}
            {unifiedRecords.length === 0 && (
              <div className="py-12 text-center space-y-2">
                <div className="p-3 rounded-full bg-muted w-fit mx-auto text-muted-foreground">
                  <HistoryIcon size={24} />
                </div>
                <p className="text-xs font-medium text-muted-foreground">No activity logged for this season</p>
              </div>
            )}
          </div>
        </section>

        {/* 7. Field Details (Meta) */}
        <section className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <MapPin size={16} className="text-primary" />
            Field Details
          </h3>

          <div className="grid grid-cols-2 gap-y-4 text-xs">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-0.5">Acreage</label>
              <div className="font-bold text-foreground">{displayFieldAcres} Plantable Acres</div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-0.5">Location</label>
              <div className="font-mono text-xs text-foreground">{field.lat != null ? field.lat.toFixed(4) : '—'}, {field.lng != null ? field.lng.toFixed(4) : '—'}</div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-0.5">Irrigation</label>
              <div className="font-bold text-foreground">{field.irrigationPractice || 'Non-Irrigated'}</div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-0.5">Intended Use</label>
              <div className="font-bold text-foreground">{field.intendedUse || 'Cash Grain'}</div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-0.5">Share %</label>
              <div className="font-bold text-foreground">{field.producerShare || 100}% Producer</div>
            </div>
          </div>

          <div className="pt-4 border-t border-border/70">
            <FieldNotes key={field.id} field={field} />
          </div>
        </section>

      </main>

      {/* Modals - Reusing existing implementation */}
      {modal === 'plant' && (
        <PlantModal field={field} open initialData={editingRecord} mode={editingMode} onClose={closeModal} />
      )}
      {modal === 'spray' && (
        <SprayModal field={field} open initialData={editingRecord} mode={editingMode} onClose={closeModal} />
      )}
      {modal === 'harvest' && (
        <HarvestModal field={field} open initialData={editingRecord} mode={editingMode} onClose={closeModal} />
      )}
      {modal === 'hay' && (
        <HayModal field={field} open initialData={editingRecord} mode={editingMode} onClose={closeModal} />
      )}
      {modal === 'fertilizer' && (
        <FertilizerModal field={field} open initialData={editingRecord} mode={editingMode} onClose={closeModal} />
      )}
      {modal === 'tillage' && (
        <TillageModal field={field} open initialData={editingRecord} mode={editingMode} onClose={closeModal} />
      )}

      {/* Dialog for CLU management */}
      <Dialog open={isCluDialogOpen} onOpenChange={setIsCluDialogOpen}>
        <DialogContent className="max-w-2xl h-[80vh] p-0 flex flex-col gap-0">
          <DialogHeader className="p-4 pb-0 shrink-0">
            <DialogTitle>FSA Tract Management</DialogTitle>
            <DialogDescription>
              Import FSA tract JSON files and assign CLU polygons to your fields.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <TractAssignmentFlow initialFieldId={field.id} onDone={() => setIsCluDialogOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
