import { useState, useEffect } from 'react';
import { Field } from '@/types/farm';
import PlantModal from '@/components/PlantModal';
import SprayModal from '@/components/SprayModal';
import HarvestModal from '@/components/HarvestModal';
import { Sprout, Wheat, MapPin, CloudRain, Loader2, Tractor, Leaf } from 'lucide-react';
import HayModal from '@/components/HayModal';
import FertilizerModal from '@/components/FertilizerModal';

interface FieldCardProps {
  field: Field;
  rain24h?: number | null;
  rainLoading?: boolean;
}

export default function FieldCard({ field, rain24h, rainLoading }: FieldCardProps) {
  const [modal, setModal] = useState<'plant' | 'spray' | 'harvest' | 'hay' | 'fertilizer' | null>(null);

  return (
    <>
      <div className="bg-card border border-border rounded-lg p-3 space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-lg text-foreground">{field.name}</h3>
            <div className="flex items-center gap-1 text-muted-foreground font-mono text-xs mt-0.5">
              <MapPin size={12} />
              {field.acreage} ac
            </div>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-sm">
            {rainLoading ? (
              <Loader2 size={14} className="text-spray animate-spin" />
            ) : rain24h != null ? (
              <span className={`flex items-center gap-1 ${rain24h > 0 ? 'text-spray' : 'text-muted-foreground'}`}>
                <CloudRain size={14} />
                {rain24h > 0 ? `${rain24h.toFixed(2)}"` : '0.00"'}
                <span className="text-[10px] text-muted-foreground">24h</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-1">
          <button
            onClick={() => setModal('plant')}
            className="touch-target w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-xl bg-plant/10 border border-plant/20 hover:bg-plant/20 text-plant transition-all active:scale-90"
            title="Plant"
          >
            <Leaf size={22} strokeWidth={2.5} />
            <span className="font-mono text-[9px] uppercase font-bold">Plant</span>
          </button>
          <button
            onClick={() => setModal('spray')}
            className="touch-target w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-xl bg-spray/10 border border-spray/20 hover:bg-spray/20 text-spray transition-all active:scale-90"
            title="Spray"
          >
            <CloudRain size={22} strokeWidth={2.5} />
            <span className="font-mono text-[9px] uppercase font-bold">Spray</span>
          </button>
          <button
            onClick={() => setModal('fertilizer')}
            className="touch-target w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-xl bg-lime-500/10 border border-lime-500/20 hover:bg-lime-500/20 text-lime-600 dark:text-lime-400 transition-all active:scale-90"
            title="Fertilizer"
          >
            <Sprout size={22} strokeWidth={2.5} />
            <span className="font-mono text-[9px] uppercase font-bold">Fert</span>
          </button>
          <button
            onClick={() => setModal('harvest')}
            className="touch-target w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-xl bg-harvest/10 border border-harvest/20 hover:bg-harvest/20 text-harvest transition-all active:scale-90"
            title="Harvest"
          >
            <Wheat size={22} strokeWidth={2.5} />
            <span className="font-mono text-[9px] uppercase font-bold">Harvest</span>
          </button>
          <button
            onClick={() => setModal('hay')}
            className="touch-target w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-xl bg-orange-700/10 border border-orange-700/20 hover:bg-orange-700/20 text-orange-700 dark:text-orange-400 transition-all active:scale-90"
            title="Hay"
          >
            <Tractor size={22} strokeWidth={2.5} />
            <span className="font-mono text-[9px] uppercase font-bold">Hay</span>
          </button>
        </div>
      </div>

      <PlantModal field={field} open={modal === 'plant'} onClose={() => setModal(null)} />
      <SprayModal field={field} open={modal === 'spray'} onClose={() => setModal(null)} />
      <HarvestModal field={field} open={modal === 'harvest'} onClose={() => setModal(null)} />
      <HayModal field={field} open={modal === 'hay'} onClose={() => setModal(null)} />
      <FertilizerModal field={field} open={modal === 'fertilizer'} onClose={() => setModal(null)} />
    </>
  );
}
