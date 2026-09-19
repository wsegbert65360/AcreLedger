import { useEffect } from 'react';
import { Clock3, RotateCcw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { trackProductEvent, type ProductEventProps } from '@/lib/productAnalytics';

interface SprayWizardCarryChipProps {
  recordType: ProductEventProps['recordType'];
  sourceFieldName: string;
  sourceTime: string;
  carryDescription: string;
  carried: boolean;
  onCarry: () => void;
  onDecline: () => void;
  onRemove: () => void;
}

export function SprayWizardCarryChip({
  recordType,
  sourceFieldName,
  sourceTime,
  carryDescription,
  carried,
  onCarry,
  onDecline,
  onRemove,
}: SprayWizardCarryChipProps) {
  useEffect(() => {
    trackProductEvent('carry_suggestion_shown', { recordType });
  }, [recordType, sourceFieldName, sourceTime]);

  if (carried) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-1.5 text-sm">
        <span className="min-w-0 truncate" title={sourceFieldName}>
          Carried from <span className="font-semibold">{sourceFieldName}</span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label={`Remove details carried from ${sourceFieldName}`}
          className="h-11 min-w-11 shrink-0 px-2 focus-visible:ring-2"
        >
          <X aria-hidden="true" size={17} />
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-live="polite"
      aria-label={`Suggestion available: carry ${recordType} details from ${sourceFieldName}, ${sourceTime} today`}
      className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-3"
    >
      <div className="flex min-w-0 items-center gap-2 font-semibold">
        <Clock3 aria-hidden="true" className="shrink-0 text-primary" size={18} />
        <span className="truncate" title={sourceFieldName}>Carry from {sourceFieldName}</span>
        <span className="shrink-0 text-xs font-normal text-muted-foreground">· {sourceTime} today</span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{carryDescription}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          onClick={() => {
            trackProductEvent('carry_suggestion_accepted', { recordType });
            onCarry();
          }}
          className="h-11 w-full focus-visible:ring-2"
        >
          <RotateCcw aria-hidden="true" className="mr-2" size={17} />
          Carry details
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            trackProductEvent('carry_suggestion_declined', { recordType });
            onDecline();
          }}
          className="h-11 w-full focus-visible:ring-2"
        >
          <X aria-hidden="true" className="mr-2" size={17} />
          Start fresh
        </Button>
      </div>
    </section>
  );
}
