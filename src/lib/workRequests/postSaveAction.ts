import type { WorkRequest } from '@/types/farm';

export interface WorkRequestSaveOptions {
  sendEmail: boolean;
  downloadPdf?: boolean;
}

interface WorkRequestPostSaveActions {
  sendEmail: (request: WorkRequest) => Promise<void>;
  downloadPdf: (request: WorkRequest) => Promise<void>;
}

/** Run the requested terminal action after the authoritative record is saved. */
export async function performWorkRequestPostSaveAction(
  request: WorkRequest,
  options: WorkRequestSaveOptions,
  actions: WorkRequestPostSaveActions,
): Promise<void> {
  if (options.sendEmail) {
    await actions.sendEmail(request);
  } else if (options.downloadPdf) {
    await actions.downloadPdf(request);
  }
}
