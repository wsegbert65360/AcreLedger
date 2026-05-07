import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { Field } from '@/types/farm';
import { useFarm } from '@/store/farmStore';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface FieldNotesProps {
  field: Field;
}

export default function FieldNotes({ field }: FieldNotesProps) {
  const { updateField } = useFarm();
  // Initialize with field.notes or empty string
  const [notes, setNotes] = useState(field.notes || '');
  const [status, setStatus] = useState<'saved' | 'syncing' | 'idle'>('idle');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync with field prop changes (e.g. when navigating between fields)
  useEffect(() => {
    setNotes(field.notes || '');
    setStatus('idle');
  }, [field.id]);

  const handleNotesChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setNotes(newValue);
    setStatus('syncing');

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      // Use the latest local value for the save
      const success = await updateField({ ...field, notes: newValue });
      
      if (success) {
        setStatus('saved');
        // Return to idle after a brief "Saved" confirmation
        setTimeout(() => setStatus('idle'), 2000);
      } else {
        setStatus('idle');
      }
    }, 2000);
  };

  return (
    <section className="relative space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Field Notes</h2>
        <div className="flex items-center gap-1.5 min-w-[60px] justify-end transition-opacity duration-300">
          {status === 'syncing' && (
            <div className="flex items-center gap-1 animate-pulse">
              <Loader2 size={10} className="animate-spin text-primary" />
              <span className="text-[11px] font-bold text-primary uppercase tracking-tighter">Syncing</span>
            </div>
          )}
          {status === 'saved' && (
            <div className="flex items-center gap-1">
              <CheckCircle2 size={10} className="text-green-500" />
              <span className="text-[11px] font-bold text-green-500 uppercase tracking-tighter">Saved</span>
            </div>
          )}
        </div>
      </div>
      <Textarea
        value={notes}
        onChange={handleNotesChange}
        placeholder="Scratchpad for field-specific notes..."
        className="min-h-[100px] text-sm bg-card/30 border-dashed border-border/60 rounded-xl focus-visible:ring-1 focus-visible:ring-primary/30 transition-all resize-none shadow-inner"
      />
    </section>
  );
}
