import type { WorkRequestFieldEntry } from '@/types/farm';
import type { WorkRequestDraft } from './useWorkRequestForm';
import { Button } from '@/components/ui/button';
import { Download, Mail, Navigation as NavIcon, AlertTriangle, Pencil } from 'lucide-react';
import { workTypeLabel, farmNamesForRequest } from '@/lib/workRequests/workRequestEmail';
import { formatNavigationCoords, buildNavigationUrl } from '@/lib/workRequests/navigation';
import { formatIsoDate } from '@/utils/dates';
import { WORK_REQUEST_DISCLAIMER } from '@/lib/workRequests/workRequestPdfExport';
import { roundTo } from '@/utils/numbers';

interface ReviewStepProps {
  draft: WorkRequestDraft;
  issues: string[];
  canGenerate: boolean;
  goToStep: (step: 'fields' | 'details' | 'products' | 'field-review' | 'review') => void;
  onDownloadPdf: () => void;
  onSendEmail: () => void;
  isExporting: boolean;
}

export default function ReviewStep({ draft, issues, canGenerate, goToStep, onDownloadPdf, onSendEmail, isExporting }: ReviewStepProps) {
  const farms = farmNamesForRequest(draft as never);
  const totalAcres = roundTo(draft.fields.reduce((sum, f) => sum + (f.acreage || 0), 0), 2);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold text-foreground">Review work request</h3>
        <p className="text-xs text-muted-foreground">{draft.requestNumber} · {draft.status} · Created {formatIsoDate(draft.createdAt)}</p>
      </div>

      {/* Validation gate */}
      {issues.length > 0 && (
        <div className="rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-400">
            <AlertTriangle size={16} /> Complete before generating
          </div>
          <ul className="text-xs text-amber-700 dark:text-amber-400 list-disc pl-5">
            {issues.map(issue => <li key={issue}>{issue}</li>)}
          </ul>
        </div>
      )}

      {/* Customer & provider */}
      <ReviewSection title="Customer & provider" onEdit={() => goToStep('details')}>
        <ReviewRow label="Customer" value={draft.customerName || '—'} />
        <ReviewRow label="Phone" value={draft.customerPhone || '—'} />
        {draft.customerBillingAddress && <ReviewRow label="Billing address" value={draft.customerBillingAddress} />}
        <ReviewRow label="Provider" value={draft.providerName || '—'} />
        <ReviewRow label="Provider email" value={draft.providerEmail || '—'} />
      </ReviewSection>

      {/* Work details */}
      <ReviewSection title="Work details" onEdit={() => goToStep('details')}>
        <ReviewRow label="Work type" value={workTypeLabel(draft.workType)} />
        <ReviewRow label="Requested completion" value={formatIsoDate(draft.requestedCompletionDate)} />
        <ReviewRow label="Crop year" value={String(draft.cropYear)} />
        {draft.crop && <ReviewRow label="Crop" value={draft.crop} />}
        {draft.currentCropStage && <ReviewRow label="Current stage" value={draft.currentCropStage} />}
        {draft.previousCrop && <ReviewRow label="Previous crop" value={draft.previousCrop} />}
        {draft.nextPlannedCrop && <ReviewRow label="Next planned crop" value={draft.nextPlannedCrop} />}
        {draft.notes && <ReviewRow label="Notes" value={draft.notes} />}
      </ReviewSection>

      {/* Products */}
      <ReviewSection title="Products" onEdit={() => goToStep('products')}>
        {draft.products.filter(p => p.productName.trim()).length === 0 ? (
          <p className="text-xs text-muted-foreground">No products specified.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {draft.products.filter(p => p.productName.trim()).map((p, i) => (
              <li key={i} className="font-mono text-foreground">
                {p.productName}
                {p.applicationRate && ` @ ${[p.applicationRate, p.rateUnit].filter(Boolean).join(' ')}`}
                {p.carrierVolume && ` · carrier ${[p.carrierVolume, p.carrierVolumeUnit].filter(Boolean).join(' ')}`}
                {p.applicationMethod && ` · ${p.applicationMethod}`}
                {p.supplier && ` · ${p.supplier === 'farmer' ? 'farmer' : 'applicator'} provides`}
              </li>
            ))}
          </ul>
        )}
      </ReviewSection>

      {/* Fields summary */}
      <ReviewSection title={`Fields (${draft.fields.length}) · ${totalAcres.toLocaleString()} ac total`} onEdit={() => goToStep('fields')}>
        <p className="text-xs text-muted-foreground">{farms.length} farm{farms.length !== 1 ? 's' : ''}: {farms.join(', ')}</p>
        <ul className="space-y-1 text-xs">
          {draft.fields.map(entry => {
            const navUrl = entry.navigationLat != null && entry.navigationLng != null
              ? buildNavigationUrl(entry.navigationLat, entry.navigationLng, 'app')
              : null;
            return (
              <li key={entry.fieldId} className="font-mono text-foreground">
                {entry.fieldName} — {entry.acreage.toLocaleString()} ac
                {entry.nearbyRoad && ` · ${entry.nearbyRoad}`}
                {navUrl && (
                  <>
                    {' · '}
                    <a href={navUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center">
                      <NavIcon size={11} className="mr-0.5" /> {formatNavigationCoords(entry.navigationLat, entry.navigationLng)}
                    </a>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </ReviewSection>

      <p className="text-[11px] italic text-muted-foreground">{WORK_REQUEST_DISCLAIMER}</p>

      {/* Terminal actions */}
      <div className="flex flex-col gap-2 pt-2">
        <Button type="button" onClick={onDownloadPdf} disabled={!canGenerate || isExporting} className="h-12">
          <Download size={18} className="mr-2" />
          {isExporting ? 'Generating…' : 'Download PDF'}
        </Button>
        <Button type="button" onClick={onSendEmail} disabled={!canGenerate || isExporting} className="h-12">
          <Mail size={18} className="mr-2" />
          Create Email
        </Button>
      </div>
    </div>
  );
}

function ReviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-foreground">{title}</h4>
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          <Pencil size={14} className="mr-1" /> Edit
        </Button>
      </div>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right font-mono">{value}</span>
    </div>
  );
}

export type { WorkRequestFieldEntry };
