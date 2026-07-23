import { describe, expect, it, vi } from 'vitest';
import type { WorkRequest } from '@/types/farm';
import { performWorkRequestPostSaveAction } from './postSaveAction';

const request = {
  id: 'request-1',
  farm_id: 'farm-1',
  requestNumber: 'WR-2026-ABC123',
  status: 'Draft',
  createdAt: '2026-07-23T12:00:00.000Z',
  updatedAt: '2026-07-23T12:00:00.000Z',
  customerName: 'Example Farm',
  workType: 'spraying',
  cropYear: 2026,
  products: [],
  fields: [],
  timestamp: 1_753_276_800_000,
  deleted_at: null,
} satisfies WorkRequest;

describe('performWorkRequestPostSaveAction', () => {
  it('downloads the PDF after save when requested', async () => {
    const sendEmail = vi.fn();
    const downloadPdf = vi.fn().mockResolvedValue(undefined);

    await performWorkRequestPostSaveAction(
      request,
      { sendEmail: false, downloadPdf: true },
      { sendEmail, downloadPdf },
    );

    expect(downloadPdf).toHaveBeenCalledWith(request);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does nothing for an ordinary save', async () => {
    const sendEmail = vi.fn();
    const downloadPdf = vi.fn();

    await performWorkRequestPostSaveAction(
      request,
      { sendEmail: false },
      { sendEmail, downloadPdf },
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(downloadPdf).not.toHaveBeenCalled();
  });
});
