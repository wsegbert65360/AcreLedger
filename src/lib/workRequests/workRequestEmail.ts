import type { WorkRequest, WorkType } from '@/types/farm';
import { formatIsoDate } from '@/utils/dates';

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  spraying: 'Spraying',
  fertilizer: 'Fertilizer',
  lime: 'Lime',
  planting: 'Planting',
  harvesting: 'Harvesting',
  other: 'Work',
};

export function workTypeLabel(workType: WorkType): string {
  return WORK_TYPE_LABELS[workType] ?? 'Work';
}

/** Sorted, de-duplicated list of farm names referenced by the request's fields. */
export function farmNamesForRequest(request: WorkRequest): string[] {
  const names = new Set(request.fields.map(f => f.farmName).filter(Boolean));
  return [...names].sort((a, b) => a.localeCompare(b));
}

export interface WorkRequestMailto {
  to: string;
  subject: string;
  body: string;
}

/**
 * Build the email subject/body for a work request.
 *
 * Subject: `Work Request – [Work Type] – [Farm Name(s)]`
 * Body includes request number, customer name + phone, work type, requested
 * date, selected farms/fields, per-field acreage, total acreage, a concise
 * product/application summary, notes, a statement that the PDF has the full
 * field info + maps, and the required verification disclaimer.
 */
export function buildWorkRequestMailto(request: WorkRequest): WorkRequestMailto {
  const farms = farmNamesForRequest(request);
  const farmsLabel = farms.length > 0 ? farms.join(', ') : 'Farm';
  const subject = `Work Request – ${workTypeLabel(request.workType)} – ${farmsLabel}`;

  const lines: string[] = [];
  lines.push(`Work Request ${request.requestNumber}`);
  lines.push('');
  lines.push(`Customer: ${request.customerName}`);
  if (request.customerPhone) lines.push(`Phone: ${request.customerPhone}`);
  lines.push(`Work type: ${workTypeLabel(request.workType)}`);
  if (request.requestedCompletionDate) {
    lines.push(`Requested completion: ${formatIsoDate(request.requestedCompletionDate)}`);
  }
  lines.push('');

  lines.push('Selected farms and fields:');
  for (const entry of request.fields) {
    lines.push(`  • ${entry.farmName} — ${entry.fieldName} (${entry.acreage} ac)`);
  }
  lines.push('');

  const totalAcres = request.fields.reduce((sum, f) => sum + (f.acreage || 0), 0);
  lines.push(`Total acreage: ${totalAcres} ac`);
  lines.push('');

  if (request.products.length > 0) {
    lines.push('Products and application:');
    for (const product of request.products) {
      const rate = [product.applicationRate, product.rateUnit].filter(Boolean).join(' ');
      const carrier = [product.carrierVolume, product.carrierVolumeUnit].filter(Boolean).join(' ');
      const supplier = product.supplier === 'farmer' ? 'farmer' : product.supplier === 'applicator' ? 'applicator' : '';
      const parts = [product.productName, rate ? `@ ${rate}` : '', carrier ? `carrier ${carrier}` : '', product.applicationMethod ? `via ${product.applicationMethod}` : '', supplier ? `provided by ${supplier}` : ''].filter(Boolean);
      lines.push(`  • ${parts.join(' · ')}`);
    }
    lines.push('');
  }

  if (request.notes) {
    lines.push(`Notes: ${request.notes}`);
    lines.push('');
  }

  lines.push('Complete field information, GPS coordinates, navigation links, and field maps are included in the attached PDF.');
  lines.push('');
  lines.push('Field boundaries, locations, maps, roads, and acreages should be verified before application.');

  return {
    to: request.providerEmail || '',
    subject,
    body: lines.join('\n'),
  };
}

/**
 * Build a `mailto:` URL (RFC 6068) with subject/body query parameters. Used on
 * web where attachments cannot be added programmatically.
 */
export function buildMailtoUrl(mailto: WorkRequestMailto): string {
  const to = encodeURIComponent(mailto.to);
  const subject = encodeURIComponent(mailto.subject);
  const body = encodeURIComponent(mailto.body);
  return `mailto:${to}?subject=${subject}&body=${body}`;
}
