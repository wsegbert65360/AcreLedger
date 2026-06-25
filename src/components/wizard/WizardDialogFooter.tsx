import { type ReactNode } from 'react';

import { AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface WizardDialogFooterProps {
  canGoBack: boolean;
  canContinue: boolean;
  isFinalStep: boolean;
  isSaving: boolean;
  onBack: () => void;
  onPrimary: () => void;
  finalContent: ReactNode;
  extraActions?: ReactNode;
  savingLabel?: string;
  nextLabel?: string;
  backLabel?: string;
  primaryClassName?: string;
  backClassName?: string;
  showFinalWarningIcon?: boolean;
}

export function WizardDialogFooter({
  canGoBack,
  canContinue,
  isFinalStep,
  isSaving,
  onBack,
  onPrimary,
  finalContent,
  extraActions,
  savingLabel = 'Saving...',
  nextLabel = 'Next',
  backLabel = 'Back',
  primaryClassName,
  backClassName,
  showFinalWarningIcon = false,
}: WizardDialogFooterProps) {
  return (
    <DialogFooter className="flex flex-col gap-2 border-t border-border/20 pt-2">
      {extraActions}

      <div className="flex w-full gap-2">
        {canGoBack && (
          <Button
            variant="outline"
            onClick={onBack}
            disabled={isSaving}
            className={cn('touch-target flex-1 border-border py-6 text-base font-bold text-foreground hover:bg-muted', backClassName)}
          >
            <ChevronLeft size={20} className="mr-1" />
            {backLabel}
          </Button>
        )}
        <Button
          onClick={onPrimary}
          disabled={isSaving || !canContinue}
          className={cn('touch-target flex-1 py-6 text-base font-bold disabled:opacity-50 disabled:grayscale', primaryClassName)}
        >
          {isSaving ? (
            <div className="flex items-center gap-2">
              <Loader2 size={24} className="animate-spin" />
              <span>{savingLabel}</span>
            </div>
          ) : isFinalStep ? (
            <div className="flex items-center gap-2">
              {showFinalWarningIcon && <AlertTriangle size={18} />}
              <span>{finalContent}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span>{nextLabel}</span>
              <ChevronRight size={18} />
            </div>
          )}
        </Button>
      </div>
    </DialogFooter>
  );
}