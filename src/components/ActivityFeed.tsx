import { Edit2 } from 'lucide-react';
import { ModalType } from '@/pages/FieldDetailScreen';

import type { ActivityRecord, ActivityRecordBase } from '@/types/farm';

type FeedRecord = Exclude<ActivityRecord, { type: 'grain' }>;
type FeedRecordData = FeedRecord['data'];

interface ActivityFeedProps {
  records: FeedRecord[];
  year: number;
  onEdit: (type: ModalType, data: FeedRecordData) => void;
  onDuplicate?: (type: ModalType, data: FeedRecordData) => void;
  hideHeader?: boolean;
}

export default function ActivityFeed({ records, year, onEdit, onDuplicate, hideHeader }: ActivityFeedProps) {
  const getFeedInfo = (record: FeedRecord) => {
    const { type, data } = record;

    switch (type) {
      case 'plant':
        return { emoji: '🌱', label: 'Plant', detail: data.crop || data.seedVariety };
      case 'spray':
        return { emoji: '☁️', label: 'Spray', detail: data.products?.[0]?.product || 'Herbicide' };
      case 'customSpray':
        return { emoji: '👷', label: 'Custom Spray', detail: data.applicator || data.recipe || 'Outside applicator' };
      case 'fertilizer':
        return { emoji: '🧪', label: 'Fertilizer', detail: data.fertilizer_formula };
      case 'harvest':
        return { emoji: '🌾', label: 'Harvest', detail: `${data.crop || 'Grain'} (${data.bushels} bu)` };
      case 'hay':
        return { emoji: '📦', label: 'Hay', detail: `${data.baleCount} Bales (${data.cuttingNumber} Cut)` };
      case 'tillage':
        return { emoji: '🚜', label: 'Tillage', detail: data.implementType };
      default:
        return { emoji: '📝', label: 'Activity', detail: 'Farm Record' };
    }
  };

  const getRecordDate = (r: ActivityRecordBase): string => {
    const dateRaw = r.date || r.plantDate || r.sprayDate || r.harvestDate;
    if (dateRaw) {
      const parsed = new Date(dateRaw);
      return !isNaN(parsed.getTime())
        ? parsed.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
        : '—';
    }
    if (r.timestamp) {
      const parsed = new Date(r.timestamp);
      return !isNaN(parsed.getTime())
        ? parsed.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
        : '—';
    }
    return '—';
  };

  return (
    <section className="space-y-3 pb-8">
      {!hideHeader && (
        <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] text-center">{year} Activity Feed</h2>
      )}
      <div className="bg-card/40 backdrop-blur-md border border-border rounded-2xl overflow-hidden divide-y divide-border/20 shadow-xl">
        {records?.map((record) => {
          const info = getFeedInfo(record);
          const r = record.data;
          const formattedDate = getRecordDate(r);

          return (
            <div
              key={r.id}
              onClick={() => onEdit(record.type as ModalType, record.data)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(record.type as ModalType, record.data); }}}
              role="button"
              tabIndex={0}
              aria-label={`${info.label}: ${info.detail}`}
              className="p-3.5 flex items-center justify-between group cursor-pointer hover:bg-muted/30 transition-all active:bg-muted/50"
            >
              <div className="flex items-center gap-4">
                <span className="text-[11px] font-mono font-bold text-muted-foreground/60 w-8">{formattedDate}</span>
                <span className="text-lg">{info.emoji}</span>
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{info.label}</span>
                  <span className="text-xs font-semibold text-foreground line-clamp-1">{info.detail}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onDuplicate && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDuplicate(record.type as ModalType, record.data); }}
                    className="p-1.5 rounded hover:bg-muted/50"
                    title="Duplicate record"
                  >
                    <span className="text-[14px]">📄</span>
                  </button>
                )}
                <Edit2
                  size={12}
                  data-testid={`edit-icon-${record.type}-${r.id}`}
                  className="text-muted-foreground opacity-20 group-hover:opacity-100 transition-opacity"
                />
              </div>
            </div>
          );
        })}
        {(!records || records.length === 0) && (
          <div className="p-12 text-center space-y-2">
            <div className="text-2xl opacity-20">🚜</div>
            <p className="text-[11px] text-muted-foreground">No activities for {year}</p>
          </div>
        )}
      </div>
    </section>
  );
}
