import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Cloud, Users } from 'lucide-react';
import { native } from '@/lib/native';
import { Field } from '@/types/farm';

export type SprayEntryType = 'spray' | 'customSpray';

const storageKey = (userPrefix?: string | null) => `al_spray_entry_choice_${userPrefix ?? ''}`;

/** Reads the user's last spray-entry choice (scoped per user when a prefix is supplied). */
export function getLastSprayChoice(userPrefix?: string | null): SprayEntryType | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(storageKey(userPrefix));
  return raw === 'customSpray' || raw === 'spray' ? raw : null;
}

function rememberChoice(type: SprayEntryType, userPrefix?: string | null) {
  try {
    window.localStorage.setItem(storageKey(userPrefix), type);
  } catch {
    // Ignore storage failures — the choice is only a convenience hint.
  }
}

interface SprayTypeChooserProps {
  open: boolean;
  field: Field;
  userPrefix?: string | null;
  onChoose: (type: SprayEntryType) => void;
  onCancel: () => void;
}

/**
 * Two-option prompt shown when the user taps "Spray": full compliance spray
 * entry vs. a lightweight custom (outside-party) spray. Remembers the last
 * pick so the common path stays a single tap.
 */
export default function SprayTypeChooser({ open, field, userPrefix, onChoose, onCancel }: SprayTypeChooserProps) {
  const last = getLastSprayChoice(userPrefix);

  const choose = (type: SprayEntryType) => {
    native.haptic.light();
    rememberChoice(type, userPrefix);
    onChoose(type);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="bg-card border-spray/30 max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-spray font-bold uppercase tracking-tight">
            <Cloud size={20} />
            Log Spray — {field.name}
          </DialogTitle>
          <DialogDescription>
            Choose how this spray was performed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 py-2">
          <button
            type="button"
            onClick={() => choose('spray')}
            className="touch-target flex items-start gap-3 p-4 rounded-xl border border-spray/30 bg-spray/5 hover:bg-spray/10 active:scale-[0.98] transition-all text-left"
          >
            <div className="p-2 rounded-lg bg-spray/10 text-spray shrink-0">
              <Cloud size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground">Spray Entry</span>
                {last === 'spray' && (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">LAST USED</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Full compliance record — you (or your operation) applied it.</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => choose('customSpray')}
            className="touch-target flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted/50 active:scale-[0.98] transition-all text-left"
          >
            <div className="p-2 rounded-lg bg-muted text-spray shrink-0">
              <Users size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground">Custom Spray</span>
                {last === 'customSpray' && (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">LAST USED</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Outside party applied it — just who, what, and the weather.</p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
