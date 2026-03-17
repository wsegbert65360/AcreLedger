import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFarm } from '@/store/farmStore';
import { WeatherService } from '@/services/WeatherService';
import { 
  Wind, Sprout, Wheat, Leaf, Tractor, ArrowLeft, 
  Cloud, Loader2, Navigation, MapPin, Droplets, RefreshCw, AlertCircle
} from 'lucide-react';
import { RainService } from '@/services/RainService';
import type { RainData } from '@/types/weather';
import PlantModal from '@/components/PlantModal';
import SprayModal from '@/components/SprayModal';
import HarvestModal from '@/components/HarvestModal';
import HayModal from '@/components/HayModal';
import FertilizerModal from '@/components/FertilizerModal';
import Logo from '@/components/Logo';

type ModalType = 'plant' | 'spray' | 'harvest' | 'hay' | 'fertilizer' | null;

const FIELD_ACTIONS = [
  { id: 'plant', label: 'Plant', icon: Leaf, color: 'text-plant', bg: 'bg-plant/10', border: 'border-plant/20' },
  { id: 'spray', label: 'Spray', icon: Cloud, color: 'text-spray', bg: 'bg-spray/10', border: 'border-spray/20' },
  { id: 'fertilizer', label: 'Fertilizer', icon: Sprout, color: 'text-lime-500', bg: 'bg-lime-500/10', border: 'border-lime-500/20' },
  { id: 'harvest', label: 'Harvest', icon: Wheat, color: 'text-harvest', bg: 'bg-harvest/10', border: 'border-harvest/20' },
  { id: 'hay', label: 'Hay', icon: Tractor, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' }
] as const;

export default function FieldDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { fields } = useFarm();
  const field = useMemo(() => fields.find(f => f.id === id), [fields, id]);

  const [conditions, setConditions] = useState<{ 
    windspeed: number | null; 
    winddir: number | null;
    windcardinal: string;
    temp: number | null;
    humidity: number | null;
    isError?: boolean;
  } | null>(null);
  const [rainData, setRainData] = useState<RainData | null>(null);
  const [rainError, setRainError] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [fetchingRain, setFetchingRain] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');

    if (field?.id && field?.lat != null && field?.lng != null) {
      WeatherService.fetchFieldConditions(field.lat, field.lng, controller.signal)
      .then((windData) => {
        setConditions(windData);
        setStatus('success');
      }).catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('[FieldDetail] Fetch error:', err);
        setStatus('error');
      });
    } else {
      setStatus('success');
    }

    return () => controller.abort();
  }, [field]);

  if (!field) return <div className="p-8 text-center text-muted-foreground uppercase font-mono">Field not found</div>;

  const getWindColor = (speed: number) => {
    if (speed > 15) return 'text-destructive';
    if (speed > 10) return 'text-yellow-500';
    return 'text-foreground';
  };

  const handleFetchRain = async () => {
    if (!field || fetchingRain) return;
    
    setFetchingRain(true);
    setRainError(null);
    try {
      const lat = field.lat;
      const lng = field.lng;

      if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
        setRainError('Location not available. Please wait and try again.');
        return;
      }

      const data = await RainService.fetchRainfall({
        lat: lat,
        lon: lng,
        polygon: field.boundary?.coordinates[0] as [number, number][]
      });
      setRainData(data);
    } catch (err: any) {
      console.error('[FieldDetail] Rain fetch error:', err);
      if (err.message.includes('404')) {
        setRainError('This location is outside supported coverage (US only).');
      } else if (err.message.includes('502')) {
        setRainError('Weather data temporarily unavailable. Please try again in a minute.');
      } else {
        setRainError('Could not load rainfall data. Please try again.');
      }
    } finally {
      setFetchingRain(false);
    }
  };


  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Premium Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border p-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button 
            onClick={() => navigate(-1)} 
            className="w-16 h-16 -ml-4 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={28} className="text-foreground" />
          </button>
          <Logo className="h-10" />
          <div className="w-10" /> {/* Spacer for balance */}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-8">
        {/* Field Info Header */}
        <section className="text-center space-y-4">
          <h1 className="text-4xl font-black text-foreground tracking-tight">{field.name}</h1>
          <div className="flex items-center justify-center gap-2 text-foreground font-mono uppercase tracking-widest text-4xl font-black">
            {field.acreage} ACRES
          </div>
        </section>

        {/* Primary Weather Indicators */}
        <section className="flex flex-col items-center gap-4">
          {/* Current Wind Widget */}
          <div className="w-full max-w-sm bg-card border border-border rounded-3xl p-6 flex flex-col items-center justify-center space-y-2 shadow-xl">
            {status === 'loading' ? (
              <Loader2 size={24} className="animate-spin text-muted-foreground mx-auto" />
            ) : (
              <>
                <div className="relative">
                  {conditions?.winddir !== null && !conditions?.isError ? (
                    <Navigation 
                      size={32} 
                      className="text-primary transition-transform duration-500" 
                      style={{ transform: `rotate(${conditions?.winddir ?? 0}deg)` }}
                    />
                  ) : (
                    <Wind size={32} className="text-muted-foreground opacity-20" />
                  )}
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-black ${getWindColor(conditions?.windspeed ?? 0)}`}>
                    {conditions?.windspeed !== null && !conditions?.isError ? Math.round(conditions?.windspeed ?? 0) : '--'} <span className="text-sm font-bold text-muted-foreground">MPH</span>
                  </div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase font-mono tracking-tighter">
                    Wind: {conditions?.windcardinal ?? '—'}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Rainfall Widget */}
          <div className="w-full max-w-sm bg-card border border-border rounded-3xl p-6 flex flex-col space-y-4 shadow-xl">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                  <Droplets size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Rainfall</h3>
                  <p className="text-[10px] font-mono text-muted-foreground uppercase">Stage IV Radar</p>
                </div>
              </div>
              <button
                onClick={handleFetchRain}
                disabled={fetchingRain || field.lat == null || field.lng == null || isNaN(field.lat) || isNaN(field.lng)}
                className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-30"
                aria-label="Refresh rainfall data"
              >
                <RefreshCw size={18} className={`${fetchingRain ? 'animate-spin' : ''} text-muted-foreground`} />
              </button>
            </div>

            {!rainData ? (
              <div className="text-center py-4">
                <button
                  onClick={handleFetchRain}
                  className="text-xs font-bold text-blue-500 hover:text-blue-600 uppercase tracking-widest"
                >
                  {fetchingRain ? 'Fetching...' : 'Click to Load Rainfall'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: '12H', value: rainData.rain['12h'] },
                    { label: '24H', value: rainData.rain['24h'] },
                    { label: '72H', value: rainData.rain['72h'] }
                  ].map((period) => (
                    <div key={period.label} className="text-center p-2 rounded-xl bg-muted/30 border border-border/50">
                      <div className="text-[10px] font-bold text-muted-foreground mb-1">{period.label}</div>
                      <div className="text-lg font-black text-foreground">{period.value}<span className="text-[10px] ml-0.5">"</span></div>
                    </div>
                  ))}
                </div>
                
                {rainData.dataWarning && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
                    <AlertCircle size={14} className="text-yellow-500 shrink-0 mt-0.5" />
                    <p className="text-[9px] font-medium text-yellow-600/80 leading-tight italic">
                      {rainData.dataWarning}
                    </p>
                  </div>
                )}

                {rainError && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                    <AlertCircle size={14} className="text-destructive shrink-0 mt-0.5" />
                    <p className="text-[9px] font-medium text-destructive leading-tight italic">
                      {rainError}
                    </p>
                  </div>
                )}
                
                <div className="text-[8px] font-mono text-muted-foreground text-center uppercase tracking-tighter">
                  End: {new Date(rainData.periodEndUtc).toLocaleString()}
                </div>
              </div>
            )}

            {rainError && !rainData && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/5 border border-destructive/10">
                <AlertCircle size={16} className="text-destructive shrink-0 mt-0.5" />
                <p className="text-[11px] font-medium text-destructive leading-normal italic">
                  {rainError}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Action Grid */}
        <section className="space-y-4">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] text-center px-1">Field Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {FIELD_ACTIONS.map((action) => (
              <button
                key={action.id}
                onClick={() => setModal(action.id as ModalType)}
                className={`w-full aspect-square flex flex-col items-center justify-center gap-4 rounded-2xl ${action.bg} border ${action.border} ${action.color} transition-all active:scale-95 hover:brightness-110 shadow-lg p-4`}
              >
                <action.icon size={36} strokeWidth={2.5} />
                <span className="font-mono text-xs uppercase font-bold tracking-tight">{action.label}</span>
              </button>
            ))}
          </div>
        </section>
      </main>

      {/* Modals */}
      {modal === 'plant' && <PlantModal field={field} open onClose={() => setModal(null)} />}
      {modal === 'spray' && <SprayModal field={field} open onClose={() => setModal(null)} />}
      {modal === 'harvest' && <HarvestModal field={field} open onClose={() => setModal(null)} />}
      {modal === 'hay' && <HayModal field={field} open onClose={() => setModal(null)} />}
      {modal === 'fertilizer' && <FertilizerModal field={field} open onClose={() => setModal(null)} />}
    </div>
  );
}
