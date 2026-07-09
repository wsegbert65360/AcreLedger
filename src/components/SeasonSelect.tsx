import { CalendarDays } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useFarm } from '@/store/farmStore';

interface SeasonSelectProps {
  className?: string;
  contentClassName?: string;
  showIcon?: boolean;
  variant?: 'default' | 'sidebar';
}

export default function SeasonSelect({
  className,
  contentClassName,
  showIcon = false,
  variant = 'default',
}: SeasonSelectProps) {
  const { activeSeason, viewingSeason, setViewingSeason, seasonOptions } = useFarm();

  return (
    <Select
      value={viewingSeason.toString()}
      onValueChange={(value) => setViewingSeason(parseInt(value, 10))}
    >
      <SelectTrigger
        aria-label="Season"
        className={cn(
          'h-11 shrink-0 rounded-lg font-mono text-sm font-bold',
          variant === 'sidebar'
            ? 'w-full border-sidebar-border bg-sidebar-accent/50 text-sidebar-primary'
            : 'min-w-[5.25rem] border-border bg-muted/60 text-foreground',
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {showIcon && <CalendarDays size={14} className="shrink-0 opacity-70" />}
          <span>{viewingSeason}</span>
        </span>
      </SelectTrigger>
      <SelectContent className={cn('bg-card border-border', contentClassName)}>
        {seasonOptions.map((year) => (
          <SelectItem key={year} value={year.toString()} className="font-mono text-xs">
            {year}{year === activeSeason ? ' (active)' : ' season'}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}