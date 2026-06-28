import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { Field } from '@/types/farm';
import { useFarm } from '@/store/farmStore';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface FieldNotesProps {
  field: Field;
}

export default function FieldNotes({ field }: FieldNotesProps) {
  const { updateField } = useFarm();
  const [notes, setNotes] = useState(field.notes || '');
  const [status, setStatus] = useState<'saved' | 'syncing' | 'idle'>('idle');
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const confirmationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const notesId = `field-notes-${field.id}`;

  useEffect(() => {
    setStatus('idle');

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (confirmationTimerRef.current) {
      clearTimeout(confirmationTimerRef.current);
      confirmationTimerRef.current = null;
    }
  }, [field.id]);

  useEffect(() => {
    if (status === 'idle') {
      setNotes(field.notes || '');
    }
  }, [field.id, field.notes, status]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      if (confirmationTimerRef.current) {
        clearTimeout(confirmationTimerRef.current);
      }
    };
  }, []);

  const handleNotesChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setNotes(newValue);
    setStatus('syncing');

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(async () => {
      saveTimerRef.current = null;
      const success = await updateField({ ...field, notes: newValue });

      if (!mountedRef.current) {
        return;
      }

      if (success) {
        setStatus('saved');

        if (confirmationTimerRef.current) {
          clearTimeout(confirmationTimerRef.current);
        }

        confirmationTimerRef.current = setTimeout(() => {
          confirmationTimerRef.current = null;
          setStatus('idle');
        }, 2000);
      } else {
        setStatus('idle');
      }
    }, 2000);
  };

  return (
    <section className="relative space-y-2">
      <div className="flex items-center justify-between px-1">
        <Label htmlFor={notesId} className="text-[11px] font-bold text-muted-foreground">
          Field notes
        </Label>
        <div className="flex items-center gap-1.5 min-w-[60px] justify-end transition-opacity duration-300">
          {status === 'syncing' && (
            <div className="flex items-center gap-1 animate-pulse">
              <Loader2 size={10} className="animate-spin text-primary" />
              <span className="text-[11px] font-bold text-primary">Syncing</span>
            </div>
          )}
          {status === 'saved' && (
            <div className="flex items-center gap-1">
              <CheckCircle2 size={10} className="text-green-500" />
              <span className="text-[11px] font-bold text-green-500">Saved</span>
            </div>
          )}
        </div>
      </div>
      <Textarea
        id={notesId}
        name="field-notes"
        value={notes}
        onChange={handleNotesChange}
        placeholder="Scratchpad for field-specific notes..."
        className="min-h-[100px] text-sm bg-card/30 border-dashed border-border/60 rounded-xl focus-visible:ring-1 focus-visible:ring-primary/30 transition-all resize-none shadow-inner"
      />
    </section>
  );
}
