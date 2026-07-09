import { ActivityRecord } from '@/types/farm';
import RecordListItem from '@/components/RecordListItem';
import { formatIsoDate, formatDate } from '@/utils/dates';
import { cleanName } from '@/utils/text';

interface HistoryFeedProps {
  records: ActivityRecord[];
  selected: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
  onEdit: (record: ActivityRecord) => void;
  onDuplicate?: (record: ActivityRecord) => void;
}

function getRecordInfo(record: ActivityRecord) {
  const { type, data } = record;
  
  switch (type) {
    case 'plant': {
      const r = data;
      return {
        title: cleanName(r.fieldName),
        subtitle: `${r.crop || 'UNSPECIFIED'} · ${r.seedVariety}`,
        details: `${r.acreage} AC · PLANTED`,
        date: formatIsoDate(r.plantDate) || formatDate(r.timestamp)
      };
    }
    case 'spray': {
      const r = data;
      const wind = r.windSpeed != null ? `${r.windSpeed} MPH ${r.windDirection || ''}`.trim() : null;
      const temp = r.temperature != null ? `${r.temperature}°F` : null;
      const details = [wind, temp].filter(Boolean).join(' · ') || '—';
      const subtitle = r.products?.map(p => p.product).filter(Boolean).join(', ') || 'No products recorded';
      return {
        title: cleanName(r.fieldName),
        subtitle,
        details,
        date: formatIsoDate(r.sprayDate) || formatDate(r.timestamp)
      };
    }
    case 'harvest': {
      const r = data;
      return {
        title: cleanName(r.fieldName),
        subtitle: `${r.crop || 'Grain'} · ${r.bushels} BU`,
        details: `${r.moisturePercent}% Moisture · ${(r.destination || 'unknown').toUpperCase()}`,
        date: formatIsoDate(r.harvestDate) || formatDate(r.timestamp)
      };
    }
    case 'hay': {
      const r = data;
      return {
        title: cleanName(r.fieldName),
        subtitle: `${r.baleCount} Bales · ${r.baleType}`,
        details: `Cutting #${r.cuttingNumber}`,
        date: formatIsoDate(r.date) || formatDate(r.timestamp)
      };
    }
    case 'customSpray': {
      const r = data;
      const wind = r.windSpeed != null ? `${r.windSpeed} MPH ${r.windDirection || ''}`.trim() : null;
      const temp = r.temperature != null ? `${r.temperature}°F` : null;
      const conditions = [wind, temp].filter(Boolean).join(' · ');
      return {
        title: cleanName(r.fieldName),
        subtitle: r.applicator || 'Custom spray',
        details: conditions ? `${r.recipe || 'No recipe'} · ${conditions}` : (r.recipe || 'No recipe'),
        date: formatIsoDate(r.date) || formatDate(r.timestamp)
      };
    }
    case 'fertilizer': {
      const r = data;
      return {
        title: cleanName(r.fieldName),
        subtitle: r.fertilizer_formula,
        details: `${r.acres} AC · APPLIED`,
        date: formatIsoDate(r.date) || formatDate(r.timestamp)
      };
    }
    case 'grain': {
      const r = data;
      const typeLabel = r.type === 'in' ? 'IN' : 'OUT';
      const source = r.sourceFieldName ? ` · FROM ${r.sourceFieldName}` : '';
      const dest = r.destination ? ` · TO ${r.destination}` : '';
      return {
        title: r.binName,
        subtitle: `${typeLabel}${source}${dest}`,
        details: `${r.bushels} BU · ${r.moisturePercent}% MOISTURE`,
        date: formatDate(r.timestamp)
      };
    }
    case 'tillage': {
      const r = data;
      return {
        title: cleanName(r.fieldName),
        subtitle: r.implementType,
        details: r.notes || 'No notes',
        date: formatIsoDate(r.date) || formatDate(r.timestamp)
      };
    }
    default:
      return {
        title: 'Unknown',
        subtitle: '',
        details: '',
        date: ''
      };
  }
}

export default function HistoryFeed({ records, selected, onToggle, onEdit, onDuplicate }: HistoryFeedProps) {
  if (records.length === 0) {
    return (
      <p className="text-center text-muted-foreground text-sm py-8">
        No records found
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {records.map((record, idx) => {
        const info = getRecordInfo(record);
        const id = record.data.id;
        return (
          <RecordListItem
            key={`${record.type}-${id}-${idx}`}
            id={id}
            type={record.type as any}
            title={info.title}
            subtitle={info.subtitle}
            details={info.details}
            date={info.date}
            isSelected={selected.has(id)}
            onToggle={onToggle}
            onEdit={() => onEdit(record)}
            onDuplicate={onDuplicate ? () => onDuplicate(record) : undefined}
          />
        );
      })}
    </div>
  );
}
