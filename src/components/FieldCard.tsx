import { useNavigate } from 'react-router-dom';
import { Field } from '@/types/farm';
import { MapPin, ChevronRight, Sprout, Cloud, FlaskConical as Flask } from 'lucide-react';

interface FieldCardProps {
  field: Field;
}

export default function FieldCard({ field }: FieldCardProps) {
  const navigate = useNavigate();
  const summary = field.activitySummary;

  const openField = () => {
    navigate(`/field/${field.id}`);
  };

  // Determine status: green if planted, gray if no activity at all
  const hasActivity = summary?.planted || (summary?.sprayed ?? 0) > 0 || (summary?.fertilized ?? 0) > 0;
  const statusColor = summary?.planted
    ? 'bg-plant'
    : hasActivity
      ? 'bg-spray'
      : 'bg-muted-foreground/30';

  return (
    <div
      onClick={openField}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openField();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${field.name} details`}
      className="bg-card/60 backdrop-blur-md border border-border rounded-lg p-2 px-3 flex items-center justify-between ring-1 ring-white/5 shadow-xl cursor-pointer hover:bg-card/80 transition-all active:scale-[0.98] relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {/* Status dot */}
      <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${statusColor}`} />

      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <MapPin size={12} />
        </div>
        <div>
          <h3 className="font-bold text-foreground">{field.name}</h3>
          <div className="flex items-center gap-1 text-muted-foreground text-xs mt-0.5">
            {field.acreage} ac
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* Seasonal Activity Icons */}
        <div className="flex items-center -mr-2">
          {summary?.planted && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/field/${field.id}#planting`);
              }}
              className="h-8 w-8 flex items-center justify-center text-primary/40 hover:text-primary/80 transition-colors"
              title="Planting Activity"
            >
              <Sprout size={16} />
            </button>
          )}
          {(summary?.sprayed ?? 0) > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/field/${field.id}#spraying`);
              }}
              className="h-8 w-8 flex items-center justify-center text-primary/40 hover:text-primary/80 transition-colors"
              title="Spraying Activity"
            >
              <div className="flex items-center">
                <Cloud size={16} />
                <span className="text-[10px] font-mono font-bold ml-0.5">x{summary?.sprayed}</span>
              </div>
            </button>
          )}
          {(summary?.fertilized ?? 0) > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/field/${field.id}#fertilizer`);
              }}
              className="h-8 w-8 flex items-center justify-center text-primary/40 hover:text-primary/80 transition-colors"
              title="Fertilizer Activity"
            >
              <Flask size={16} />
            </button>
          )}
        </div>
        <ChevronRight size={20} className="text-muted-foreground/50" />
      </div>
    </div>
  );
}
