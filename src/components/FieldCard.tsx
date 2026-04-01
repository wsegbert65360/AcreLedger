import { useNavigate } from 'react-router-dom';
import { Field } from '@/types/farm';
import { MapPin, ChevronRight, Sprout, Cloud, FlaskConical as Flask, Wheat } from 'lucide-react';

interface FieldCardProps {
  field: Field;
}

/** Determine the field's seasonal status for color coding. */
const statusConfig = (planted: boolean, harvested: boolean) => {
  if (harvested) return {
    label: 'Harvested',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    iconBg: 'bg-amber-500/20',
    iconColor: 'text-amber-500',
    dot: 'bg-amber-400',
  };
  if (planted) return {
    label: 'Planted',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    iconBg: 'bg-emerald-500/20',
    iconColor: 'text-emerald-500',
    dot: 'bg-emerald-400',
  };
  return {
    label: 'Open',
    bg: '',
    border: '',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    dot: 'bg-muted-foreground/30',
  };
};

export default function FieldCard({ field }: FieldCardProps) {
  const navigate = useNavigate();
  const summary = field.activitySummary;
  const planted = !!summary?.planted;
  const harvested = !!summary?.harvested;
  const status = statusConfig(planted, harvested);

  return (
    <div
      onClick={() => navigate(`/field/${field.id}`)}
      className={`${status.bg} border ${status.border || 'border-border'} rounded-lg p-2.5 px-3 flex items-center justify-between ring-1 ring-white/5 shadow-xl cursor-pointer hover:bg-card/80 transition-all active:scale-[0.98] relative`}
    >
      {/* Status dot — small indicator on left edge */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[3px] w-1.5 h-8 rounded-r-full opacity-80" style={{ backgroundColor: status.dot === 'bg-amber-400' ? '#f59e0b' : status.dot === 'bg-emerald-400' ? '#34d399' : '#a1a1aa' }} />

      <div className="flex items-center gap-2.5">
        <div className={`w-7 h-7 rounded-md ${status.iconBg} flex items-center justify-center ${status.iconColor} shrink-0`}>
          {harvested ? <Wheat size={14} /> : planted ? <Sprout size={14} /> : <MapPin size={14} />}
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
        {/* Seasonal Activity Icons */}
        <div className="flex items-center">
          {planted && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/field/${field.id}#planting`);
              }}
              className="h-7 w-7 flex items-center justify-center text-emerald-500/50 hover:text-emerald-500 transition-colors"
              title="Planting Activity"
            >
              <Sprout size={14} />
            </button>
          )}
          {(summary?.sprayed ?? 0) > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/field/${field.id}#spraying`);
              }}
              className="h-7 w-7 flex items-center justify-center text-blue-400/50 hover:text-blue-400 transition-colors"
              title="Spraying Activity"
            >
              <div className="flex items-center">
                <Cloud size={14} />
                <span className="text-[9px] font-mono font-bold ml-0.5">{summary?.sprayed}</span>
              </div>
            </button>
          )}
          {(summary?.fertilized ?? 0) > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/field/${field.id}#fertilizer`);
              }}
              className="h-7 w-7 flex items-center justify-center text-purple-400/50 hover:text-purple-400 transition-colors"
              title="Fertilizer Activity"
            >
              <Flask size={14} />
            </button>
          )}
          {harvested && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/field/${field.id}#harvest`);
              }}
              className="h-7 w-7 flex items-center justify-center text-amber-500/50 hover:text-amber-500 transition-colors"
              title="Harvest Activity"
            >
              <Wheat size={14} />
            </button>
          )}
        </div>
        <ChevronRight size={18} className="text-muted-foreground/40 ml-0.5" />
      </div>
    </div>
  );
}
