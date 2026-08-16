import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { ACTIVITY_ICONS, ACTIVITY_TEXT_COLORS } from '@/lib/activityIcons';
import { getPlantedCropColorStyles } from '@/lib/cropColors';
import type { GeoJSONGeometry } from '@/lib/geoHelpers';
import { cn } from '@/lib/utils';
import { Field } from '@/types/farm';
import { roundTo } from '@/utils/numbers';
import FieldBoundaryThumbnail from './FieldBoundaryThumbnail';

interface FieldCardProps {
  field: Field & {
    displayAcreage?: number;
    thumbnailGeometry?: GeoJSONGeometry | null;
  };
}

export default function FieldCard({ field }: FieldCardProps) {
  const navigate = useNavigate();
  const summary = field.activitySummary;
  const displayAcreage = roundTo(field.displayAcreage ?? field.acreage, 0);
  const cropStyles = summary?.planted ? getPlantedCropColorStyles(summary.crop) : null;

  const openField = () => {
    navigate(`/field/${field.id}`);
  };

  const hasActivity = summary?.planted || (summary?.sprayed ?? 0) > 0 || (summary?.fertilized ?? 0) > 0;
  const statusLabel = summary?.planted
    ? (summary.crop || 'Planted')
    : hasActivity
      ? 'Activity logged'
      : 'No activity';
  const statusPillClass = cropStyles
    ? cropStyles.pill
    : summary?.planted
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
      data-crop={cropStyles?.key}
      aria-label={summary?.crop ? `Open ${field.name} details, ${summary.crop}` : `Open ${field.name} details`}
      className={cn(
        'group relative flex min-h-[72px] cursor-pointer items-center justify-between rounded-2xl border bg-card/90 p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        cropStyles ? cropStyles.card : 'border-border/70 hover:border-primary/25',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border p-1.5 transition-colors',
            cropStyles ? cropStyles.thumb : 'border-primary/15 bg-primary/10 text-primary group-hover:bg-primary/15',
          )}
        >
          <FieldBoundaryThumbnail geometry={field.thumbnailGeometry ?? field.boundary} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="truncate font-bold leading-tight text-foreground">{field.name}</h3>
            <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border leading-none whitespace-nowrap ${statusPillClass}`}>
              {statusLabel}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-1 font-mono text-xs font-medium text-muted-foreground">
            {displayAcreage} AC
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* Seasonal Activity Icons */}
        <div className="flex items-center -mr-2">
          {summary?.planted && (
            <div
              className={`h-8 w-8 flex items-center justify-center ${ACTIVITY_TEXT_COLORS.plant} opacity-80`}
              title="Planting activity"
            >
              <ACTIVITY_ICONS.plant size={16} />
            </div>
          )}
          {(summary?.sprayed ?? 0) > 0 && (
            <div
              className={`h-8 w-auto min-w-8 flex items-center justify-center ${ACTIVITY_TEXT_COLORS.spray} opacity-85`}
              title="Spraying activity"
            >
              <div className="flex items-center">
                <ACTIVITY_ICONS.spray size={16} />
                <span className="ml-0.5 rounded-full bg-spray/10 px-1 py-0.5 text-[10px] font-mono font-bold leading-none text-spray">x{summary?.sprayed}</span>
              </div>
            </div>
          )}
          {(summary?.fertilized ?? 0) > 0 && (
            <div
              className={`h-8 w-8 flex items-center justify-center ${ACTIVITY_TEXT_COLORS.fertilizer} opacity-80`}
              title="Fertilizer activity"
            >
              <ACTIVITY_ICONS.fertilizer size={16} />
            </div>
          )}
        </div>
        <ChevronRight size={20} className={cn('text-muted-foreground/40 transition-transform group-hover:translate-x-0.5', cropStyles ? 'group-hover:text-current' : 'group-hover:text-primary')} />
      </div>
    </div>
  );
}
