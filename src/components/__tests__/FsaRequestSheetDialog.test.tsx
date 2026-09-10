import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFsaOfficeRequestSheet } from '@/lib/fsaOfficeRequestSheet';
import { useFarm } from '@/store/farmStore';
import type { Field } from '@/types/farm';

import FsaRequestSheetDialog from '../FsaRequestSheetDialog';

vi.mock('@/store/farmStore', () => ({
  useFarm: vi.fn(),
}));

vi.mock('@/lib/fsaOfficeRequestSheet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/fsaOfficeRequestSheet')>();
  return {
    ...actual,
    createFsaOfficeRequestSheet: vi.fn(),
  };
});

const makeField = (overrides: Partial<Field> = {}): Field => ({
  id: 'field-1',
  farm_id: 'farm-1',
  name: 'Home Place',
  acreage: 10,
  fsaFarmNumber: '4251',
  fsaTractNumber: '9747',
  deleted_at: null,
  lat: null,
  lng: null,
  ...overrides,
});

describe('FsaRequestSheetDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderDialog = (farmOverrides: Record<string, unknown> = {}, onOpenChange = vi.fn()) => {
    (useFarm as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      farmName: 'Doe Farms',
      session: {
        user: {
          id: 'user-1',
          email: 'john@example.com',
          user_metadata: { full_name: 'John Doe' },
        },
      },
      fields: [makeField(), makeField({ id: 'field-2', fsaFarmNumber: '6418', fsaTractNumber: '1417' })],
      ...farmOverrides,
    });
    const utils = render(<FsaRequestSheetDialog open onOpenChange={onOpenChange} />);
    return { onOpenChange, ...utils };
  };

  it('prefills operator name, farm name, and email; leaves county blank', async () => {
    renderDialog();

    expect(await screen.findByLabelText('Operator name')).toHaveValue('John Doe');
    expect(screen.getByLabelText('Farm or business name')).toHaveValue('Doe Farms');
    expect(screen.getByLabelText('Phone or email')).toHaveValue('john@example.com');
    expect(screen.getByLabelText('County and state')).toHaveValue('');
  });

  it('leaves everything blank when no profile information is available', async () => {
    renderDialog({ farmName: null, session: null, fields: [] });

    expect(await screen.findByLabelText('Operator name')).toHaveValue('');
    expect(screen.getByLabelText('Farm or business name')).toHaveValue('');
    expect(screen.getByLabelText('Phone or email')).toHaveValue('');
    expect(screen.getByLabelText('County and state')).toHaveValue('');
  });

  it('downloads the PDF with edited values and the known farm/tract numbers', async () => {
    const { onOpenChange } = renderDialog();

    fireEvent.change(screen.getByLabelText('Operator name'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('County and state'), { target: { value: 'Benton County, MO' } });
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));

    await waitFor(() => {
      expect(createFsaOfficeRequestSheet).toHaveBeenCalledWith(
        expect.objectContaining({
          operatorName: 'Jane Doe',
          farmName: 'Doe Farms',
          countyState: 'Benton County, MO',
          contact: 'john@example.com',
          knownTracts: ['4251-9747', '6418-1417'],
          save: true,
        }),
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('excludes soft-deleted fields from the known tract list', async () => {
    renderDialog({
      fields: [
        makeField(),
        makeField({ id: 'field-2', deleted_at: '2026-09-01T00:00:00Z', fsaFarmNumber: '6418', fsaTractNumber: '1417' }),
      ],
    });

    fireEvent.click(await screen.findByRole('button', { name: /download pdf/i }));

    await waitFor(() => {
      expect(createFsaOfficeRequestSheet).toHaveBeenCalledWith(
        expect.objectContaining({ knownTracts: ['4251-9747'] }),
      );
    });
  });

  it('keeps the dialog open when the PDF fails', async () => {
    (createFsaOfficeRequestSheet as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('boom');
    });
    const { onOpenChange } = renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: /download pdf/i }));

    await waitFor(() => {
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });
});
