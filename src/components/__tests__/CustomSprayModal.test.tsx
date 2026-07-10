/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    fetchCurrentWeather: vi.fn(),
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
    vi.mocked(WeatherService.fetchCurrentWeather).mockResolvedValue(null);
  });

  it('automatically fills weather for a new custom spray record', async () => {
    vi.mocked(WeatherService.fetchCurrentWeather).mockResolvedValue({
      temp: 74,
      humidity: 48,
      wind: 7,
      windDirection: 'SSE',
      isError: false,
      precip24h: 0,
      precip72h: 0,
      precipProb: 0,
    });

    render(<CustomSprayModal field={field} open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(WeatherService.fetchCurrentWeather).toHaveBeenCalledWith(
        '40.25,-93.5',
        expect.any(AbortSignal),
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Wind', { exact: true })).toHaveValue(7);
      expect(screen.getByLabelText('Dir', { exact: true })).toHaveValue('SSE');
      expect(screen.getByLabelText(/F$/i)).toHaveValue(74);
    });
  });

  it('does not overwrite weather entered before the automatic pull finishes', async () => {
    let resolveWeather: (value: any) => void = () => {};
    vi.mocked(WeatherService.fetchCurrentWeather).mockImplementation(
      () => new Promise(resolve => { resolveWeather = resolve; }),
    );

    render(<CustomSprayModal field={field} open={true} onClose={vi.fn()} />);

    const windInput = screen.getByLabelText('Wind', { exact: true });
    const directionInput = screen.getByLabelText('Dir', { exact: true });
    const temperatureInput = screen.getByLabelText(/F$/i);

    fireEvent.change(windInput, { target: { value: '12' } });
    fireEvent.change(directionInput, { target: { value: 'NW' } });
    fireEvent.change(temperatureInput, { target: { value: '81' } });

    await act(async () => {
      resolveWeather({
        temp: 74,
        humidity: 48,
        wind: 7,
        windDirection: 'SSE',
        isError: false,
      });
    });

    expect(windInput).toHaveValue(12);
    expect(directionInput).toHaveValue('NW');
    expect(temperatureInput).toHaveValue(81);
  });

  it('preserves saved weather when editing an existing record', async () => {
    const existingRecord: CustomSprayRecord = {
      id: 'custom-spray-1',
      farm_id: 'farm-1',
      fieldId: field.id,
      fieldName: field.name,
      date: '2026-07-01',
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
    });
    expect(WeatherService.fetchCurrentWeather).not.toHaveBeenCalled();
  });
});
