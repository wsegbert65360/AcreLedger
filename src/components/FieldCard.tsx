import { useNavigate } from 'react-router-dom';
import { Field } from '@/types/farm';
import { MapPin, ChevronRight, Sprout, Cloud, FlaskConical as Flask } from 'lucide-react';

interface FieldCardProps {
  field: Field;
}

export default function FieldCard({ field }: FieldCardProps) {
  const navigate = useNavigate();
  const summary = field.activitySummary;

  return (
    <div 
      onClick={() => navigate(`/field/${field.id}`)}
      className="bg-card/60 backdrop-blur-md border border-border rounded-lg p-2 px-3 flex items-center justify-between ring-1 ring-white/5 shadow-xl cursor-pointer hover:bg-card/80 transition-all active:scale-[0.98] relative"
    >
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <MapPin size={12} />
        </div>
        <div>
          <h3 className="font-bold text-foreground">{field.name}</h3>
          <div className="flex items-center gap-1 text-muted-foreground font-mono text-xs mt-0.5">
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

