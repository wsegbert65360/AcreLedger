import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import type { WorkRequest } from '@/types/farm';
import { native } from '@/lib/native';
import { exportWorkRequestPdf, workRequestFileName } from './workRequestPdfExport';
import { buildWorkRequestMailto, buildMailtoUrl } from './workRequestEmail';
import type { GeoJSONGeometry } from '@/lib/geoHelpers';

export interface SendWorkRequestOptions {
  request: WorkRequest;
  getGeometry?: (fieldId: string) => GeoJSONGeometry | null | undefined;
}

export type SendOutcome = 'shared' | 'downloaded' | 'failed';

/**
 * "Create Email" action: generate the PDF, then hand off to email.
 *
 * - Native: call `native.sharePdf()` — the OS share sheet opens with the PDF
 *   attached; the user picks Mail (or any app). Returns `'shared'`.
 * - Web: `mailto:` cannot attach files, so the PDF is downloaded AND a
 *   `mailto:` window opens with subject/body prefilled, plus a clear toast
 *   telling the user to attach the downloaded PDF. Returns `'downloaded'`.
 *
 * Does NOT mutate the request; the caller persists the status change
 * (Draft → Sent) if desired.
 */
export async function sendWorkRequestEmail({ request, getGeometry }: SendWorkRequestOptions): Promise<SendOutcome> {
  const fileName = workRequestFileName(request);
  try {
    const doc = await exportWorkRequestPdf({ request, getGeometry });

    if (Capacitor.isNativePlatform()) {
      const shared = await native.sharePdf(fileName, doc);
      if (!shared) {
        toast.error('Could not open the share sheet. The PDF was not sent.');
        return 'failed';
      }
      return 'shared';
    }

    // Web: download the PDF and open the email client with a prefilled message.
    doc.save(fileName);

    const mailto = buildWorkRequestMailto(request);
    if (mailto.to) {
      window.open(buildMailtoUrl(mailto), '_blank');
    }
    toast.success('PDF downloaded. Please attach it to the email that just opened.', {
      description: 'Web email cannot attach files automatically — attach the downloaded PDF manually.',
    });
    return 'downloaded';
  } catch (err) {
    console.error('Failed to send work request email:', err);
    toast.error('Failed to generate the work request PDF.');
    return 'failed';
  }
}

export interface DownloadPdfOptions {
  request: WorkRequest;
  getGeometry?: (fieldId: string) => GeoJSONGeometry | null | undefined;
}

/**
 * "Download PDF" action: generate the PDF and either save it (web) or share it
 * via the OS sheet (native). Used by the standalone download button and the
 * saved-request list "Download PDF again" action.
 */
export async function downloadWorkRequestPdf({ request, getGeometry }: DownloadPdfOptions): Promise<boolean> {
  const fileName = workRequestFileName(request);
  try {
    const doc = await exportWorkRequestPdf({ request, getGeometry });
    if (Capacitor.isNativePlatform()) {
      const shared = await native.sharePdf(fileName, doc);
      if (!shared) {
        toast.error('Could not open the share sheet.');
        return false;
      }
      return true;
    }
    doc.save(fileName);
    toast.success('Work request PDF downloaded.');
    return true;
  } catch (err) {
    console.error('Failed to generate work request PDF:', err);
    toast.error('Failed to generate the work request PDF.');
    return false;
  }
}
