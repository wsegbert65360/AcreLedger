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

/** Mailto URLs stay under this many encoded characters (client/OS limits). */
export const MAX_MAILTO_URL_LENGTH = 1800;
export const MAX_WORK_REQUEST_EMAIL_BODY = MAX_MAILTO_URL_LENGTH;

function truncateToEncodedLength(value: string, maxEncodedLength: number): string {
  if (maxEncodedLength <= 0) return '';
  if (encodeURIComponent(value).length <= maxEncodedLength) return value.trimEnd();

  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (encodeURIComponent(value.slice(0, mid)).length <= maxEncodedLength) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return value.slice(0, lo).trimEnd();
}

function capMailtoBody(body: string, to: string, subject: string): string {
  const prefix = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=`;
  const budget = Math.max(0, MAX_MAILTO_URL_LENGTH - prefix.length);
  return truncateToEncodedLength(body, budget);
}

const PROVIDER_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Empty is allowed. A present address must be a single trimmed email. */
export function providerEmailForSave(
  value: string | null | undefined,
): { ok: true; email: string | undefined } | { ok: false } {
  if (value == null) return { ok: true, email: undefined };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, email: undefined };
  if (trimmed.length > 254 || !PROVIDER_EMAIL_RE.test(trimmed)) return { ok: false };
  return { ok: true, email: trimmed };
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
 * Subject: `Work Request – [Work Type] – [Farm Name(s)]` (the work-type segment
 * is omitted when the request is the generic `'other'` type, so a simplified
 * request does not read "Work Request – Work – ...").
 * Body includes request number, farm name + phone, requested-work description,
 * optional work type and requested date, selected farms/fields, per-field
 * acreage, total acreage, a concise product/application summary, a statement
 * that the PDF has the full field info + maps, and the required verification
 * disclaimer.
 */
export function buildWorkRequestMailto(request: WorkRequest): WorkRequestMailto {
  const farms = farmNamesForRequest(request);
  const farmsLabel = farms.length > 0 ? farms.join(', ') : 'Farm';
  const typeLabel = request.workType !== 'other' ? workTypeLabel(request.workType) : '';
  const subject = typeLabel
    ? `Work Request – ${typeLabel} – ${farmsLabel}`
    : `Work Request – ${farmsLabel}`;

  const lines: string[] = [];
  lines.push(`Work Request ${request.requestNumber}`);
  lines.push('');
  lines.push(`Farm: ${request.customerName}`);
  if (request.customerPhone) lines.push(`Phone: ${request.customerPhone}`);
  if (request.notes) lines.push(`Requested work: ${request.notes}`);
  if (request.workType !== 'other') lines.push(`Work type: ${workTypeLabel(request.workType)}`);
  if (request.requestedCompletionDate) {
    lines.push(`Requested completion: ${formatIsoDate(request.requestedCompletionDate)}`);
  }
  lines.push('');

  lines.push('Selected farms and fields:');
  for (const entry of request.fields) {
    const crop = entry.overrides?.crop || entry.crop || request.crop;
    lines.push(`  • ${entry.farmName} — ${entry.fieldName} (${entry.acreage} ac${crop ? `, ${crop}` : ''})`);
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

  lines.push('Complete field information, GPS coordinates, navigation links, and field maps are included in the attached PDF.');
  lines.push('');
  lines.push('Field boundaries, locations, maps, roads, and acreages should be verified before application.');

  const to = request.providerEmail?.trim() || '';
  const body = capMailtoBody(
    lines
      .join('\n')
      .replace(/\r\n/g, '\n')
      .replace(/\n/g, '\r\n')
      .trim(),
    to,
    subject,
  );

  return {
    to,
    subject,
    body,
  };
}

/**
 * Build a `mailto:` URL (RFC 6068) with subject/body query parameters. Used on
 * web where attachments cannot be added programmatically.
 */
export function buildMailtoUrl(mailto: WorkRequestMailto): string {
  const body = capMailtoBody(mailto.body, mailto.to, mailto.subject);
  const to = encodeURIComponent(mailto.to);
  const subject = encodeURIComponent(mailto.subject);
  return `mailto:${to}?subject=${subject}&body=${encodeURIComponent(body)}`;
}
