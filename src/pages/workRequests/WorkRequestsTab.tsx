import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFarm } from '@/store/farmStore';
import type { WorkRequest, WorkRequestFieldEntry, WorkRequestProduct, WorkType } from '@/types/farm';
import type { FsaTractImport } from '@/types/fsaTract';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Copy, Download, Mail, Check, X, FileText } from 'lucide-react';
import { formatIsoDate } from '@/utils/dates';
import { roundTo } from '@/utils/numbers';
import { workTypeLabel, farmNamesForRequest } from '@/lib/workRequests/workRequestEmail';
import { downloadWorkRequestPdf, sendWorkRequestEmail } from '@/lib/workRequests/sendWorkRequest';
import {
  performWorkRequestPostSaveAction,
  type WorkRequestSaveOptions,
} from '@/lib/workRequests/postSaveAction';
import { getFieldThumbnailGeometry } from '@/lib/fieldThumbnail';
import { loadBundledFsaTracts, mergeBundledFsaTracts } from '@/lib/bundledFsaTracts';
import { useWorkRequestForm, WIZARD_STEPS } from './useWorkRequestForm';
import FieldSelectionStep from './FieldSelectionStep';
import DetailsStep from './DetailsStep';
import ProductsStep from './ProductsStep';
import FieldReviewStep from './FieldReviewStep';
import ReviewStep from './ReviewStep';

const STATUS_STYLES: Record<WorkRequest['status'], string> = {
  Draft: 'bg-muted text-muted-foreground border-border',
  Sent: 'bg-spray/10 text-spray border-spray/20',
  Completed: 'bg-plant/10 text-plant border-plant/20',
  Canceled: 'bg-destructive/10 text-destructive border-destructive/20',
};

export default function WorkRequestsTab() {
  const { workRequests, addWorkRequest, updateWorkRequest, fields, cluAssignments, fsaTracts } = useFarm();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<WorkRequest | null>(null);
  const [mode, setMode] = useState<'new' | 'edit' | 'duplicate'>('new');
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [bundledFsaTracts, setBundledFsaTracts] = useState<FsaTractImport[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadBundledFsaTracts()
      .then(tracts => {
        if (!cancelled) setBundledFsaTracts(tracts);
      })
      .catch(error => {
        console.error('Failed to load bundled FSA tracts for work requests:', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mergedFsaTracts = useMemo(
    () => mergeBundledFsaTracts(fsaTracts, bundledFsaTracts),
    [fsaTracts, bundledFsaTracts],
  );

  const sorted = useMemo(
    () => [...workRequests].filter(r => !r.deleted_at).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [workRequests],
  );

  const openNew = () => { setEditing(null); setMode('new'); setWizardOpen(true); };
  const openEdit = (req: WorkRequest) => { setEditing(req); setMode('edit'); setWizardOpen(true); };
  const openDuplicate = (req: WorkRequest) => { setEditing(req); setMode('duplicate'); setWizardOpen(true); };

  const getGeometry = useCallback((fieldId: string) => {
    const field = fields.find(f => f.id === fieldId);
    return field ? getFieldThumbnailGeometry(field, cluAssignments, mergedFsaTracts) : null;
  }, [fields, cluAssignments, mergedFsaTracts]);

  const handleDownload = async (req: WorkRequest) => {
    setExportingId(req.id);
    try {
      await downloadWorkRequestPdf({ request: req, getGeometry });
    } finally {
      setExportingId(null);
    }
  };

  const handleResend = async (req: WorkRequest) => {
    setExportingId(req.id);
    try {
      const outcome = await sendWorkRequestEmail({ request: req, getGeometry });
      if (outcome !== 'failed' && req.status === 'Draft') {
        await updateWorkRequest({ ...req, status: 'Sent' });
      }
    } finally {
      setExportingId(null);
    }
  };

  const markCompleted = async (req: WorkRequest) => {
    await updateWorkRequest({ ...req, status: 'Completed' });
  };
  const cancel = async (req: WorkRequest) => {
    await updateWorkRequest({ ...req, status: 'Canceled' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Work Requests</h2>
          <p className="text-xs text-muted-foreground">Send application, planting, and harvest requests to your provider.</p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus size={16} className="mr-1" /> New
        </Button>
      </div>

      {sorted.length === 0 ? (
        <Card className="border-border/30">
          <CardContent className="py-10 text-center space-y-2">
            <FileText size={28} className="mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No work requests yet.</p>
            <Button onClick={openNew} variant="outline" size="sm">
              <Plus size={16} className="mr-1" /> Create your first request
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map(req => (
            <WorkRequestCard
              key={req.id}
              request={req}
              exporting={exportingId === req.id}
              onEdit={() => openEdit(req)}
              onDuplicate={() => openDuplicate(req)}
              onDownload={() => handleDownload(req)}
              onResend={() => handleResend(req)}
              onMarkCompleted={() => markCompleted(req)}
              onCancel={() => cancel(req)}
            />
          ))}
        </div>
      )}

      <WorkRequestWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        initial={editing}
        mode={mode}
        fsaTracts={mergedFsaTracts}
        onSave={async (draft, opts) => {
          if (mode === 'edit' && editing) {
            const savedRequest: WorkRequest = {
              ...editing,
              ...draft,
              id: editing.id,
              farm_id: editing.farm_id,
              timestamp: editing.timestamp,
              deleted_at: editing.deleted_at,
            };
            const ok = await updateWorkRequest(savedRequest);
            if (ok) {
              await performWorkRequestPostSaveAction(savedRequest, opts, {
                sendEmail: handleResend,
                downloadPdf: handleDownload,
              });
              setWizardOpen(false);
            }
          } else {
            let added: WorkRequest | undefined;
            const ok = await addWorkRequest(draft, record => {
              added = record;
            });
            if (!ok) return;
            if (added) {
              await performWorkRequestPostSaveAction(added, opts, {
                sendEmail: handleResend,
                downloadPdf: handleDownload,
              });
            }
            setWizardOpen(false);
          }
        }}
      />
    </div>
  );
}

interface WorkRequestCardProps {
  request: WorkRequest;
  exporting: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDownload: () => void;
  onResend: () => void;
  onMarkCompleted: () => void;
  onCancel: () => void;
}

function WorkRequestCard({ request, exporting, onEdit, onDuplicate, onDownload, onResend, onMarkCompleted, onCancel }: WorkRequestCardProps) {
  const farms = farmNamesForRequest(request);
  const totalAcres = roundTo(request.fields.reduce((s, f) => s + (f.acreage || 0), 0), 2);
  return (
    <Card className="border-border/40">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-foreground">{request.requestNumber}</span>
              <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[request.status]}`}>{request.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {workTypeLabel(request.workType)} · {request.customerName} · {farms.join(', ') || 'Farm'}
            </p>
            <p className="text-[11px] font-mono text-muted-foreground">
              {request.fields.length} field{request.fields.length !== 1 ? 's' : ''} · {totalAcres.toLocaleString()} ac · created {formatIsoDate(request.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button variant="outline" size="sm" onClick={onEdit} disabled={exporting}><Pencil size={14} className="mr-1" /> Edit</Button>
          <Button variant="outline" size="sm" onClick={onDuplicate} disabled={exporting}><Copy size={14} className="mr-1" /> Duplicate</Button>
          <Button variant="outline" size="sm" onClick={onDownload} disabled={exporting}>{exporting ? '…' : <><Download size={14} className="mr-1" /> PDF</>}</Button>
          <Button variant="outline" size="sm" onClick={onResend} disabled={exporting}><Mail size={14} className="mr-1" /> Resend</Button>
          {request.status !== 'Completed' && (
            <Button variant="outline" size="sm" onClick={onMarkCompleted} disabled={exporting}><Check size={14} className="mr-1" /> Complete</Button>
          )}
          {request.status !== 'Canceled' && (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={exporting}><X size={14} className="mr-1" /> Cancel</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface WorkRequestWizardProps {
  open: boolean;
  onClose: () => void;
  initial: WorkRequest | null;
  mode: 'new' | 'edit' | 'duplicate';
  fsaTracts: FsaTractImport[];
  onSave: (
    draft: Omit<WorkRequest, 'id' | 'timestamp' | 'deleted_at' | 'farm_id'>,
    opts: WorkRequestSaveOptions,
  ) => Promise<void>;
}

function WorkRequestWizard({ open, onClose, initial, mode, fsaTracts, onSave }: WorkRequestWizardProps) {
  const form = useWorkRequestForm({ initial, mode, open, fsaTracts });
  const [exporting, setExporting] = useState(false);

  const handlePrimary = async () => {
    if (form.step === 'review') {
      // Final step: save and close.
      await onSave(form.draft, { sendEmail: false });
      return;
    }
    form.goNext();
  };

  const handleSaveDraft = async () => {
    await onSave(form.draft, { sendEmail: false });
  };

  const handleDownloadFromWizard = async () => {
    if (!form.canGenerate) return;
    setExporting(true);
    try {
      // Save first, then export the authoritative persisted record.
      await onSave(form.draft, { sendEmail: false, downloadPdf: true });
    } finally {
      setExporting(false);
    }
  };

  const handleSendFromWizard = async () => {
    if (!form.canGenerate) return;
    setExporting(true);
    try {
      await onSave(form.draft, { sendEmail: true });
    } finally {
      setExporting(false);
    }
  };

  const isFinal = form.step === 'review';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-1rem)] max-w-2xl overflow-x-hidden overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit' ? 'Edit work request' : mode === 'duplicate' ? 'Duplicate work request' : 'New work request'}
          </DialogTitle>
          <DialogDescription>
            {form.draft.requestNumber} · Step {form.stepIndex + 1} of {WIZARD_STEPS.length}: {WIZARD_STEPS[form.stepIndex].label}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
          {WIZARD_STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => i <= form.stepIndex && form.goToStep(s.key)}
              disabled={i > form.stepIndex}
              className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                i === form.stepIndex
                  ? 'bg-primary text-primary-foreground'
                  : i < form.stepIndex
                    ? 'bg-muted text-foreground'
                    : 'bg-muted/40 text-muted-foreground'
              }`}
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </div>

        <div className="py-2">
          {form.step === 'fields' && (
            <FieldSelectionStep
              selectedFieldIds={form.selectedFieldIds}
              setFieldIds={form.setFieldIds}
              totalSelectedAcres={form.totalSelectedAcres}
            />
          )}
          {form.step === 'details' && (
            <DetailsStep draft={form.draft} patchDraft={form.patchDraft} setWorkType={form.setWorkType} />
          )}
          {form.step === 'products' && (
            <ProductsStep
              draft={form.draft}
              addProduct={form.addProduct}
              updateProduct={form.updateProduct}
              removeProduct={form.removeProduct}
            />
          )}
          {form.step === 'field-review' && (
            <FieldReviewStep
              draft={form.draft}
              patchFieldEntry={form.patchFieldEntry}
              resolve={form.resolve}
              navUrlFor={form.navUrlFor}
            />
          )}
          {form.step === 'review' && (
            <ReviewStep
              draft={form.draft}
              issues={form.issues}
              canGenerate={form.canGenerate}
              goToStep={form.goToStep}
              onDownloadPdf={handleDownloadFromWizard}
              onSendEmail={handleSendFromWizard}
              isExporting={exporting}
            />
          )}
        </div>

        <DialogFooter className="flex-col gap-2 border-t border-border/20 pt-2">
          {/* Review screen shows its own terminal buttons; here we offer save-draft + back/next for non-review steps */}
          {!isFinal && (
            <Button type="button" variant="ghost" onClick={handleSaveDraft} disabled={form.isSaving}>
              Save as draft
            </Button>
          )}
          {!isFinal && (
            <div className="flex w-full gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={form.goBack}
                disabled={form.stepIndex === 0}
                className="flex-1 py-6 text-base font-bold"
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={handlePrimary}
                disabled={
                  (form.step === 'fields' && !form.canProceedFields) ||
                  (form.step === 'details' && !form.canProceedDetails)
                }
                className="flex-1 py-6 text-base font-bold"
              >
                Next
              </Button>
            </div>
          )}
          {isFinal && (
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
              <Button type="button" variant="outline" onClick={form.goBack} className="w-full py-6 text-base font-bold">
                Back
              </Button>
              <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={form.isSaving} className="w-full py-6 text-base font-bold">
                Save as draft
              </Button>
              <Button type="button" onClick={handlePrimary} disabled={form.isSaving} className="w-full py-6 text-base font-bold">
                Save & Close
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { WorkRequestFieldEntry, WorkRequestProduct, WorkType };
