import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFarm } from '@/store/farmStore';
import { WeatherService } from '@/services/WeatherService';
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

export default function FieldDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { fields } = useFarm();
  const field = useMemo(() => fields.find(f => f.id === id), [fields, id]);

  const [weather, setWeather] = useState<{ rain24h: number; windspeed: number; winddir: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'plant' | 'spray' | 'harvest' | 'hay' | 'fertilizer' | null>(null);

  useEffect(() => {
    if (field?.lat != null && field?.lng != null) {
      WeatherService.fetchFieldWeather(field.lat, field.lng)
        .then(setWeather)
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
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
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors">
            <ArrowLeft size={24} className="text-foreground" />
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

        {/* Weather Widgets */}
        <section className="grid grid-cols-2 gap-4">
          {/* Rain Widget */}
          <div className="bg-card border border-border rounded-3xl p-6 flex flex-col items-center justify-center space-y-2 shadow-xl">
            <CloudRain size={32} className="text-spray" />
            <div className="text-center">
              {loading ? (
                <Loader2 size={24} className="animate-spin text-muted-foreground mx-auto" />
              ) : (
                <>
                  <div className="text-4xl font-black text-foreground">
                    {weather?.rain24h.toFixed(2)}<span className="text-lg ml-0.5 text-muted-foreground">"</span>
                  </div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase font-mono tracking-tighter">24H Rainfall</div>
                </>
              )}
            </div>
          </div>

          {/* Wind Widget */}
          <div className="bg-card border border-border rounded-3xl p-6 flex flex-col items-center justify-center space-y-2 shadow-xl">
            {loading ? (
              <Loader2 size={24} className="animate-spin text-muted-foreground mx-auto" />
            ) : (
              <>
                <div className="relative">
                  <Navigation 
                    size={32} 
                    className="text-primary transition-transform duration-500" 
                    style={{ transform: `rotate(${weather?.winddir ?? 0}deg)` }}
                  />
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-black ${getWindColor(weather?.windspeed ?? 0)}`}>
                    {Math.round(weather?.windspeed ?? 0)} <span className="text-sm font-bold text-muted-foreground">MPH</span>
                  </div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase font-mono tracking-tighter">
                    Wind: {degreesToCardinal(weather?.winddir ?? 0)}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Action Grid */}
        <section className="space-y-4">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] text-center px-1">Field Actions</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'plant', label: 'Plant', icon: Leaf, color: 'text-plant', bg: 'bg-plant/10', border: 'border-plant/20' },
              { id: 'spray', label: 'Spray', icon: Cloud, color: 'text-spray', bg: 'bg-spray/10', border: 'border-spray/20' },
              { id: 'fertilizer', label: 'Fertilizer', icon: Sprout, color: 'text-lime-500', bg: 'bg-lime-500/10', border: 'border-lime-500/20' },
              { id: 'harvest', label: 'Harvest', icon: Wheat, color: 'text-harvest', bg: 'bg-harvest/10', border: 'border-harvest/20' },
              { id: 'hay', label: 'Hay', icon: Tractor, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' }
            ].map((action) => (
              <button
                key={action.id}
                onClick={() => setModal(action.id as any)}
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
