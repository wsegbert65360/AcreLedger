import { Check, Edit2, AlertTriangle } from 'lucide-react';
import {
  ACTIVITY_ICONS,
  ACTIVITY_TEXT_COLORS,
  ACTIVITY_BG_COLORS,
  type ActivityType,
} from '@/lib/activityIcons';

interface RecordListItemProps {
  id: string;
  title: string;
  subtitle: string;
  details: string;
  date: string;
  isSelected: boolean;
  onToggle: (id: string, shift: boolean) => void;
  onEdit: () => void;
  type: ActivityType;
  warning?: boolean;
}

export default function RecordListItem({
  id, title, subtitle, details, date, isSelected, onToggle, onEdit, type, warning
}: RecordListItemProps) {
  const Icon = ACTIVITY_ICONS[type];
  const colorClass = ACTIVITY_TEXT_COLORS[type];
  const bgClass = ACTIVITY_BG_COLORS[type];

  return (
    <div
      onClick={(e) => onToggle(id, e.shiftKey)}
      className={`group relative p-3 rounded-lg border transition-all cursor-pointer ${isSelected
          ? 'bg-primary/5 border-primary ring-1 ring-primary/20'
          : 'bg-card border-border hover:border-border/80'
        }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-1 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${bgClass} ${colorClass}`}>
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-sm text-foreground truncate">{title}</h3>
            <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">{date}</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-hidden">
            {warning && <AlertTriangle size={12} className="text-amber-500 shrink-0" />}
            <p className="text-[11px] font-medium text-muted-foreground truncate uppercase tracking-tight">{subtitle}</p>
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-1 line-clamp-1">{details}</p>
        </div>
        <div className="flex flex-col gap-2 items-center justify-center ml-2">
          <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-border group-hover:border-muted-foreground'
            }`}>
            {isSelected && <Check size={12} strokeWidth={3} />}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Edit2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
