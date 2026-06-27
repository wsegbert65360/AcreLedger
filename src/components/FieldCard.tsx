import { useNavigate } from 'react-router-dom';
import { MapPin, ChevronRight } from 'lucide-react';

import { Field } from '@/types/farm';
import { roundTo } from '@/utils/numbers';
import { ACTIVITY_ICONS } from '@/lib/activityIcons';

interface FieldCardProps {
  field: Field & { displayAcreage?: number };
}

export default function FieldCard({ field }: FieldCardProps) {
  const navigate = useNavigate();
  const summary = field.activitySummary;
  const displayAcreage = roundTo(field.displayAcreage ?? field.acreage, 0);

  const openField = () => {
    navigate(`/field/${field.id}`);
  };

  // Determine status: green if planted, blue if any activity, gray if none
  const hasActivity = summary?.planted || (summary?.sprayed ?? 0) > 0 || (summary?.fertilized ?? 0) > 0;
  const statusLabel = summary?.planted
    ? 'Planted'
    : hasActivity
      ? 'Activity logged'
      : 'No activity';
  const statusPillClass = summary?.planted
    ? 'bg-plant/10 text-plant border-plant/20'
    : hasActivity
      ? 'bg-spray/10 text-spray border-spray/20'
      : 'bg-muted text-muted-foreground border-border';

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
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <MapPin size={12} />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-foreground leading-tight">{field.name}</h3>
            <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border leading-none whitespace-nowrap ${statusPillClass}`}>
              {statusLabel}
            </span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground text-xs mt-1">
            {displayAcreage} ac
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* Seasonal Activity Icons */}
        <div className="flex items-center -mr-2">
          {summary?.planted && (
            <div
              className="h-8 w-8 flex items-center justify-center text-primary/40"
              title="Planting Activity"
            >
              <ACTIVITY_ICONS.plant size={16} />
            </div>
          )}
          {(summary?.sprayed ?? 0) > 0 && (
            <div
              className="h-8 w-8 flex items-center justify-center text-primary/40"
              title="Spraying Activity"
            >
              <div className="flex items-center">
                <ACTIVITY_ICONS.spray size={16} />
                <span className="text-[11px] font-mono font-bold ml-0.5">x{summary?.sprayed}</span>
              </div>
            </div>
          )}
          {(summary?.fertilized ?? 0) > 0 && (
            <div
              className="h-8 w-8 flex items-center justify-center text-primary/40"
              title="Fertilizer Activity"
            >
              <ACTIVITY_ICONS.fertilizer size={16} />
            </div>
          )}
        </div>
        <ChevronRight size={20} className="text-muted-foreground/50" />
      </div>
    </div>
  );
}
