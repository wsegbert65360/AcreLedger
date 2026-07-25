import type { WorkRequestDraft } from './useWorkRequestForm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface DetailsStepProps {
  draft: WorkRequestDraft;
  patchDraft: (patch: Partial<WorkRequestDraft>) => void;
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-semibold text-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function DetailsStep({ draft, patchDraft }: DetailsStepProps) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold text-foreground">Request details</h3>
        <p className="text-xs text-muted-foreground">Tell the provider which farm this is for and what needs to be done.</p>
      </div>
      <Field id="wr-customer-name" label="Farm name *">
        <Input
          id="wr-customer-name"
          className="h-11"
          value={draft.customerName}
          onChange={e => patchDraft({ customerName: e.target.value })}
          placeholder="Farm name"
        />
      </Field>
      <Field id="wr-notes" label="What needs to be done? *">
        <Textarea
          id="wr-notes"
          className="min-h-32"
          value={draft.notes ?? ''}
          onChange={e => patchDraft({ notes: e.target.value })}
          placeholder="Describe the work you want done, products or rates to use, timing, and any special instructions."
        />
      </Field>
    </div>
  );
}
