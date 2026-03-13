import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFarm } from '@/store/farmStore';
import { RainfallStats, WeatherService } from '@/services/WeatherService';
import { 
  CloudRain, Wind, Sprout, Wheat, Leaf, Tractor, ArrowLeft, 
  Cloud, Loader2, Navigation, MapPin
} from 'lucide-react';
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

  const [rainfall, setRainfall] = useState<RainfallStats | null>(null);
  const [conditions, setConditions] = useState<{ windspeed: number; winddir: number } | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [modal, setModal] = useState<ModalType>(null);

  useEffect(() => {
    let isActive = true;
    setStatus('loading');

    if (field?.id && field?.lat != null && field?.lng != null) {
      Promise.all([
        WeatherService.fetchFieldRainfall(field.id),
        WeatherService.fetchFieldConditions(field.lat, field.lng)
      ]).then(([rainData, windData]) => {
        if (!isActive) return;
        setRainfall(rainData);
        setConditions(windData);
        setStatus('success');
      }).catch((err) => {
        console.error('[FieldDetail] Fetch error:', err);
        if (isActive) setStatus('error');
      });
    } else {
      setStatus('success');
    }

    return () => { isActive = false; };
  }, [field]);

  if (!field) return <div className="p-8 text-center text-muted-foreground uppercase font-mono">Field not found</div>;

  const getWindColor = (speed: number) => {
    if (speed > 15) return 'text-destructive';
    if (speed > 10) return 'text-yellow-500';
    return 'text-foreground';
  };

  const degreesToCardinal = (deg: number) => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return directions[Math.round(deg / 22.5) % 16];
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
          <Logo />
          <div className="w-10" /> {/* Spacer for balance */}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-8">
        {/* Field Info Header */}
        <section className="text-center space-y-2">
          <h1 className="text-4xl font-black text-foreground tracking-tight">{field.name}</h1>
          <div className="flex items-center justify-center gap-2 text-muted-foreground font-mono uppercase tracking-widest text-sm">
            <MapPin size={16} />
            {field.acreage} ACRES
          </div>
        </section>

        {/* Primary Weather Indicators */}
        <section className="grid grid-cols-2 gap-4">
          {/* Today's Rain Widget */}
          <div className="bg-card border border-border rounded-3xl p-6 flex flex-col items-center justify-center space-y-2 shadow-xl">
            <CloudRain size={32} className="text-spray" />
            <div className="text-center">
              {status === 'loading' ? (
                <Loader2 size={24} className="animate-spin text-muted-foreground mx-auto" />
              ) : (
                <>
                  <div className="text-4xl font-black text-foreground">
                    {rainfall?.today_in.toFixed(2)}<span className="text-lg ml-0.5 text-muted-foreground">in</span>
                  </div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase font-mono tracking-tighter">Today's Rainfall</div>
                </>
              )}
            </div>
          </div>

          {/* Current Wind Widget */}
          <div className="bg-card border border-border rounded-3xl p-6 flex flex-col items-center justify-center space-y-2 shadow-xl">
            {status === 'loading' ? (
              <Loader2 size={24} className="animate-spin text-muted-foreground mx-auto" />
            ) : (
              <>
                <div className="relative">
                  <Navigation 
                    size={32} 
                    className="text-primary transition-transform duration-500" 
                    style={{ transform: `rotate(${conditions?.winddir ?? 0}deg)` }}
                  />
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-black ${getWindColor(conditions?.windspeed ?? 0)}`}>
                    {Math.round(conditions?.windspeed ?? 0)} <span className="text-sm font-bold text-muted-foreground">MPH</span>
                  </div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase font-mono tracking-tighter">
                    Wind: {degreesToCardinal(conditions?.winddir ?? 0)}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Detailed Rainfall Breakdown */}
        {status !== 'loading' && rainfall && (
          <section className="bg-card border border-border rounded-3xl p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">Precise Precipitation</h2>
              <div className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase font-mono ${
                rainfall.historical_backfill_status === 'complete' ? 'bg-green-500/10 text-green-500' :
                rainfall.historical_backfill_status === 'processing' ? 'bg-blue-500/10 text-blue-500 animate-pulse' :
                'bg-yellow-500/10 text-yellow-500'
              }`}>
                {rainfall.historical_backfill_status}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-y-6 gap-x-8">
              <div className="space-y-1">
                <div className="text-2xl font-black text-foreground">{rainfall.yesterday_in.toFixed(2)} in</div>
                <div className="text-[10px] font-bold text-muted-foreground uppercase font-mono">Yesterday</div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-black text-foreground">{rainfall.last_7_days_in.toFixed(2)} in</div>
                <div className="text-[10px] font-bold text-muted-foreground uppercase font-mono">Last 7 Days</div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-black text-foreground">{rainfall.since_planting_in.toFixed(2)} in</div>
                <div className="text-[10px] font-bold text-muted-foreground uppercase font-mono">Since Planting</div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-black text-foreground">{rainfall.since_last_spray_in.toFixed(2)} in</div>
                <div className="text-[10px] font-bold text-muted-foreground uppercase font-mono">Since Spray</div>
              </div>
            </div>
            
            <div className="pt-6 border-t border-border/50 flex flex-col space-y-4">
              <button 
                onClick={async () => {
                  if (field.id) {
                    await WeatherService.triggerBackfill(field.id);
                    // Reload data after a short delay
                    setTimeout(() => {
                      if (field.id) WeatherService.fetchFieldRainfall(field.id).then(setRainfall);
                    }, 1000);
                  }
                }}
                className="w-full h-16 bg-primary text-primary-foreground rounded-2xl font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                Refresh History
              </button>
              <div className="flex items-center justify-center">
                <span className="text-[10px] font-medium text-muted-foreground/60 uppercase font-mono">
                  Updated: {rainfall.last_updated ? new Date(rainfall.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending'}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Action Grid */}
        <section className="space-y-4">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] text-center px-1">Field Actions</h2>
          <div className="grid grid-cols-3 gap-3">
            {FIELD_ACTIONS.map((action) => (
              <button
                key={action.id}
                onClick={() => setModal(action.id as ModalType)}
                className={`w-full aspect-square flex flex-col items-center justify-center gap-2 rounded-2xl ${action.bg} border ${action.border} ${action.color} transition-all active:scale-95 hover:brightness-110 shadow-lg`}
              >
                <action.icon size={28} strokeWidth={2.5} />
                <span className="font-mono text-[10px] uppercase font-bold tracking-tight">{action.label}</span>
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
