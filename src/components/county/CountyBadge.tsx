import { Badge } from '@/components/ui/badge';
import type { CountyDisplayStatus } from '@/lib/county/types';

const LABELS: Record<CountyDisplayStatus, { text: string; className: string }> = {
  automatic: { text: 'Automatic', className: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400' },
  estimated: { text: 'Estimated', className: 'border-amber-500/40 text-amber-700 dark:text-amber-400' },
  manual: { text: 'Manual', className: 'border-sky-500/40 text-sky-700 dark:text-sky-400' },
  unresolved: { text: 'Unresolved', className: 'border-muted-foreground/40 text-muted-foreground' },
  needs_review: { text: 'Needs review', className: 'border-red-500/40 text-red-700 dark:text-red-400' },
};

export function countyStatusText(status: CountyDisplayStatus): string {
  return LABELS[status].text;
}

export default function CountyBadge({ status }: { status: CountyDisplayStatus }) {
  const { text, className } = LABELS[status];
  return <Badge variant="outline" className={className} data-testid={`county-status-${status}`}>{text}</Badge>;
}
