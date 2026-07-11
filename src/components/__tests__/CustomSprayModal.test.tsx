/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CustomSprayModal from '../CustomSprayModal';
import { WeatherService } from '@/services/WeatherService';
import { CustomSprayRecord, Field } from '@/types/farm';

const addCustomSprayRecordMock = vi.fn().mockResolvedValue(true);
const updateCustomSprayRecordMock = vi.fn().mockResolvedValue(true);

vi.mock('@/store/farmStore', () => ({
  useFarm: () => ({
    addCustomSprayRecord: addCustomSprayRecordMock,
    updateCustomSprayRecord: updateCustomSprayRecordMock,
    customSprayRecords: [],
    viewingSeason: 2026,
  }),
}));

vi.mock('@/services/WeatherService', () => ({
  WeatherService: {
    fetchHistoricalConditions: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/native', () => ({
  native: {
    haptic: {
      error: vi.fn(),
      success: vi.fn(),
    },
  },
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog-root">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

describe('CustomSprayModal weather', () => {
  const field: Field = {
    id: 'field-1',
    name: 'North Field',
    acreage: 80,
    lat: 40.25,
    lng: -93.5,
    farm_id: 'farm-1',
    deleted_at: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(WeatherService.fetchHistoricalConditions).mockResolvedValue(null);
  });

  it('pulls historical weather for the selected application date and time', async () => {
    vi.mocked(WeatherService.fetchHistoricalConditions).mockResolvedValue({
      temp: 74,
      humidity: 48,
      wind: 7,
      windDirection: 'SSE',
    });

    render(<CustomSprayModal field={field} open={true} onClose={vi.fn()} />);

    expect(WeatherService.fetchHistoricalConditions).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Application Date/i), { target: { value: '2026-05-18' } });
    fireEvent.change(screen.getByLabelText(/Time/i), { target: { value: '14:30' } });
    fireEvent.click(screen.getByRole('button', { name: /Pull historical weather/i }));

    await waitFor(() => {
      expect(WeatherService.fetchHistoricalConditions).toHaveBeenCalledWith(
        40.25,
        -93.5,
        '2026-05-18',
        '14:30',
      );
      expect(screen.getByLabelText('Wind', { exact: true })).toHaveValue(7);
      expect(screen.getByLabelText('Dir', { exact: true })).toHaveValue('SSE');
      expect(screen.getByLabelText(/F$/i)).toHaveValue(74);
    });
  });

  it('keeps manual weather values when historical recovery finds no data', async () => {
    render(<CustomSprayModal field={field} open={true} onClose={vi.fn()} />);

    const windInput = screen.getByLabelText('Wind', { exact: true });
    const directionInput = screen.getByLabelText('Dir', { exact: true });
    const temperatureInput = screen.getByLabelText(/F$/i);

    fireEvent.change(windInput, { target: { value: '12' } });
    fireEvent.change(directionInput, { target: { value: 'NW' } });
    fireEvent.change(temperatureInput, { target: { value: '81' } });
    fireEvent.click(screen.getByRole('button', { name: /Pull historical weather/i }));

    await waitFor(() => {
      expect(windInput).toHaveValue(12);
      expect(directionInput).toHaveValue('NW');
      expect(temperatureInput).toHaveValue(81);
    });
  });

  it('preserves saved weather when editing an existing record', async () => {
    const existingRecord: CustomSprayRecord = {
      id: 'custom-spray-1',
      farm_id: 'farm-1',
      fieldId: field.id,
      fieldName: field.name,
      date: '2026-07-01',
      applicationTime: '09:30',
      applicator: 'County Co-op',
      windSpeed: 9,
      windDirection: 'W',
      temperature: 78,
      seasonYear: 2026,
      timestamp: Date.now(),
      deleted_at: null,
    };

    render(
      <CustomSprayModal
        field={field}
        open={true}
        onClose={vi.fn()}
        initialData={existingRecord}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Wind', { exact: true })).toHaveValue(9);
      expect(screen.getByLabelText('Dir', { exact: true })).toHaveValue('W');
      expect(screen.getByLabelText(/F$/i)).toHaveValue(78);
      expect(screen.getByLabelText(/Time/i)).toHaveValue('09:30');
    });
    expect(WeatherService.fetchHistoricalConditions).not.toHaveBeenCalled();
  });

  it('saves the selected application time with the custom spray record', async () => {
    render(<CustomSprayModal field={field} open={true} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Who Sprayed/i), { target: { value: 'County Co-op' } });
    fireEvent.change(screen.getByLabelText(/Application Date/i), { target: { value: '2026-05-18' } });
    fireEvent.change(screen.getByLabelText(/Time/i), { target: { value: '14:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Custom Spray' }));

    await waitFor(() => {
      expect(addCustomSprayRecordMock).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2026-05-18',
          applicationTime: '14:30',
          applicator: 'County Co-op',
        }),
      );
    });
  });
});
