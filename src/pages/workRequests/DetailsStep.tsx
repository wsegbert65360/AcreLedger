import type { WorkRequestDraft, WorkType } from './useWorkRequestForm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const WORK_TYPES: { value: WorkType; label: string }[] = [
  { value: 'spraying', label: 'Spraying' },
  { value: 'fertilizer', label: 'Fertilizer' },
  { value: 'lime', label: 'Lime' },
  { value: 'planting', label: 'Planting' },
  { value: 'harvesting', label: 'Harvesting' },
  { value: 'other', label: 'Other' },
];

interface DetailsStepProps {
  draft: WorkRequestDraft;
  patchDraft: (patch: Partial<WorkRequestDraft>) => void;
  setWorkType: (workType: WorkType) => void;
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-semibold text-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function DetailsStep({ draft, patchDraft, setWorkType }: DetailsStepProps) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold text-foreground">Customer & provider</h3>
        <p className="text-xs text-muted-foreground">Who the work is for, and who is doing it.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="wr-customer-name" label="Landowner / customer name *">
          <Input id="wr-customer-name" className="h-11" value={draft.customerName} onChange={e => patchDraft({ customerName: e.target.value })} placeholder="Required" />
        </Field>
        <Field id="wr-customer-phone" label="Phone number">
          <Input id="wr-customer-phone" className="h-11" value={draft.customerPhone ?? ''} onChange={e => patchDraft({ customerPhone: e.target.value })} placeholder="Optional" />
        </Field>
        <Field id="wr-customer-address" label="Billing address">
          <Textarea id="wr-customer-address" className="min-h-[44px]" value={draft.customerBillingAddress ?? ''} onChange={e => patchDraft({ customerBillingAddress: e.target.value })} placeholder="Optional" />
        </Field>
        <Field id="wr-provider-name" label="Provider / applicator name *">
          <Input id="wr-provider-name" className="h-11" value={draft.providerName ?? ''} onChange={e => patchDraft({ providerName: e.target.value })} placeholder="Required" />
        </Field>
        <Field id="wr-provider-email" label="Provider email address *">
          <Input id="wr-provider-email" type="email" className="h-11" value={draft.providerEmail ?? ''} onChange={e => patchDraft({ providerEmail: e.target.value })} placeholder="required@email.com" />
        </Field>
      </div>

      <div className="border-t border-border pt-5">
        <h3 className="text-base font-bold text-foreground">Work details</h3>
        <p className="text-xs text-muted-foreground">What work is requested and when.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="wr-work-type" label="Work type *">
          <Select value={draft.workType} onValueChange={v => setWorkType(v as WorkType)}>
            <SelectTrigger id="wr-work-type" className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WORK_TYPES.map(wt => <SelectItem key={wt.value} value={wt.value}>{wt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field id="wr-completion-date" label="Requested completion date *">
          <Input id="wr-completion-date" type="date" className="h-11" value={draft.requestedCompletionDate ?? ''} onChange={e => patchDraft({ requestedCompletionDate: e.target.value })} />
        </Field>
        <Field id="wr-crop" label="Crop">
          <Input id="wr-crop" className="h-11" value={draft.crop ?? ''} onChange={e => patchDraft({ crop: e.target.value })} placeholder="e.g. Corn" />
        </Field>
        <Field id="wr-crop-year" label="Crop year">
          <Input id="wr-crop-year" type="number" className="h-11" value={draft.cropYear} onChange={e => patchDraft({ cropYear: Number(e.target.value) || new Date().getFullYear() })} />
        </Field>
        <Field id="wr-stage" label="Current crop stage">
          <Input id="wr-stage" className="h-11" value={draft.currentCropStage ?? ''} onChange={e => patchDraft({ currentCropStage: e.target.value })} placeholder="Optional" />
        </Field>
        <Field id="wr-previous" label="Previous crop">
          <Input id="wr-previous" className="h-11" value={draft.previousCrop ?? ''} onChange={e => patchDraft({ previousCrop: e.target.value })} placeholder="Optional" />
        </Field>
        <Field id="wr-next" label="Next planned crop">
          <Input id="wr-next" className="h-11" value={draft.nextPlannedCrop ?? ''} onChange={e => patchDraft({ nextPlannedCrop: e.target.value })} placeholder="Optional" />
        </Field>
      </div>
      <Field id="wr-notes" label="Special instructions and notes">
        <Textarea id="wr-notes" value={draft.notes ?? ''} onChange={e => patchDraft({ notes: e.target.value })} placeholder="Any details the provider should know." />
      </Field>
    </div>
  );
}
